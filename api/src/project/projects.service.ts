import { Injectable } from "@nestjs/common";
import {
  DenyByDefaultError,
  denyExternalOrgWideAccess,
  redactSecrets,
} from "@amber/shared";
import { AuditService } from "../audit/audit.service";
import type { RequestSession } from "../auth/session.types";
import { AuthzService } from "../authz/authz.service";
import { currentCorrelationId } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { RolesService } from "../org/roles.service";

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authz: AuthzService,
    private readonly roles: RolesService,
  ) {}

  async create(session: RequestSession, organizationId: string, input: { name: string }) {
    const actor = await this.authz.assert(session, "project.create");
    if (session.activeOrganizationId !== organizationId) {
      throw new DenyByDefaultError("Path organizationId does not match session-bound Organization");
    }
    const coordinatorRole = await this.roles.requireOrgOwnedRole(organizationId, {
      templateKey: "PROJECT_COORDINATOR",
    });
    const created = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: { organizationId, name: input.name.trim() },
      });
      const membership = await tx.projectMembership.create({
        data: {
          projectId: project.id,
          organizationMembershipId: actor.membershipId,
          status: "ACTIVE",
        },
      });
      await tx.projectRoleAssignment.create({
        data: { projectMembershipId: membership.id, roleId: coordinatorRole.id },
      });
      return { project, membership };
    });
    await this.audit.insert({
      organizationId,
      projectId: created.project.id,
      actorUserId: session.userId,
      eventType: "PROJECT_CREATED",
      resourceType: "project",
      resourceId: created.project.id,
      correlationId: currentCorrelationId(),
      payload: redactSecrets({ name: created.project.name }),
    });
    return created;
  }

  async listOrganization(session: RequestSession, organizationId: string) {
    const context = await this.authz.assert(session, "organization.read");
    denyExternalOrgWideAccess(context.membershipType, "org_project_list");
    if (session.activeOrganizationId !== organizationId) {
      throw new DenyByDefaultError("Path organizationId does not match session-bound Organization");
    }
    const projects = await this.prisma.project.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });
    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      organizationId: project.organizationId,
      archivedAt: project.archivedAt,
    }));
  }

  async listMine(session: RequestSession) {
    if (!session.activeOrganizationId) {
      throw new DenyByDefaultError("Session has no active Organization; org-switch required");
    }
    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: session.activeOrganizationId,
          userId: session.userId,
        },
      },
    });
    if (!membership || membership.status !== "ACTIVE") {
      throw new DenyByDefaultError("Organization membership is not ACTIVE");
    }
    const rows = await this.prisma.projectMembership.findMany({
      where: { organizationMembershipId: membership.id, status: "ACTIVE" },
      include: { project: true },
      orderBy: { createdAt: "asc" },
    });
    return rows
      .filter((row) => row.project.organizationId === session.activeOrganizationId)
      .map((row) => ({
        id: row.project.id,
        name: row.project.name,
        organizationId: row.project.organizationId,
        archivedAt: row.project.archivedAt,
        membershipId: row.id,
        status: row.status,
      }));
  }

  async get(session: RequestSession, projectId: string) {
    const context = await this.authz.assert(session, "project.read", projectId);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new DenyByDefaultError("Project is not bound to the authorized Organization");
    }
    return {
      id: project.id,
      name: project.name,
      organizationId: project.organizationId,
      archivedAt: project.archivedAt,
      membership: {
        id: context.projectMembershipId,
        status: context.projectMembershipStatus,
      },
      roles: context.grants
        .filter((grant) => grant.scope === "project" && grant.projectId === projectId)
        .map((grant) => ({ templateKey: grant.templateKey })),
      permissions: this.authz.permissionsOf(context),
    };
  }

  async update(session: RequestSession, projectId: string, input: { name: string }) {
    await this.authz.assert(session, "project.update", projectId);
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: { name: input.name.trim() },
    });
    return { id: project.id, name: project.name, organizationId: project.organizationId };
  }

  async archive(session: RequestSession, projectId: string) {
    await this.authz.assert(session, "project.archive", projectId);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.organizationId !== session.activeOrganizationId) {
      throw new DenyByDefaultError("Project is not bound to the authorized Organization");
    }
    const updated = await this.prisma.project.update({
      where: { id: project.id },
      data: { archivedAt: new Date() },
    });
    await this.audit.insert({
      organizationId: updated.organizationId,
      projectId: updated.id,
      actorUserId: session.userId,
      eventType: "PROJECT_ARCHIVED",
      resourceType: "project",
      resourceId: updated.id,
      correlationId: currentCorrelationId(),
      payload: redactSecrets({ name: updated.name }),
    });
    return { id: updated.id, archivedAt: updated.archivedAt };
  }
}
