import { Injectable } from "@nestjs/common";
import {
  DenyByDefaultError,
  assertProjectAssignRolesSoD,
  assertProjectMembershipTransition,
  grantsOutsideExistingAuthority,
  isUsableMembership,
  redactSecrets,
  type MembershipStatus,
  type PermissionCode,
  type ProjectMembershipStatus,
  type RoleTemplateKey,
} from "@amber/shared";
import { AuditService } from "../audit/audit.service";
import type { RequestSession } from "../auth/session.types";
import { AuthzService } from "../authz/authz.service";
import { currentCorrelationId } from "../observability/request-context";
import { RolesService } from "../org/roles.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ProjectMembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authz: AuthzService,
    private readonly roles: RolesService,
  ) {}

  async list(session: RequestSession, projectId: string) {
    await this.authz.assert(session, "project.read", projectId);
    const rows = await this.prisma.projectMembership.findMany({
      where: { projectId },
      include: {
        organizationMembership: { include: { user: true } },
        roleAssignments: { include: { role: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      organizationMembershipId: row.organizationMembershipId,
      userId: row.organizationMembership.userId,
      email: row.organizationMembership.user.email,
      displayName: row.organizationMembership.user.displayName,
      membershipType: row.organizationMembership.type,
      roles: row.roleAssignments.map((assignment) => ({
        id: assignment.id,
        roleId: assignment.role.id,
        templateKey: assignment.role.templateKey,
        sourceTemplateKey: assignment.role.sourceTemplateKey,
        name: assignment.role.name,
      })),
    }));
  }

  async add(session: RequestSession, projectId: string, organizationMembershipId: string) {
    const actor = await this.authz.assert(session, "project.manage_members", projectId);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.organizationId !== actor.organizationId) {
      throw new DenyByDefaultError("Project is not bound to the authorized Organization");
    }
    const orgMembership = await this.prisma.organizationMembership.findUnique({
      where: { id: organizationMembershipId },
    });
    if (!orgMembership || orgMembership.organizationId !== project.organizationId) {
      throw new DenyByDefaultError("Project Coordinator may add only existing Organization members");
    }
    if (!isUsableMembership(orgMembership.status as MembershipStatus)) {
      throw new DenyByDefaultError("ACTIVE Organization Membership is required before ACTIVE ProjectMembership");
    }
    const existing = await this.prisma.projectMembership.findUnique({
      where: {
        projectId_organizationMembershipId: {
          projectId,
          organizationMembershipId: orgMembership.id,
        },
      },
    });
    const membership = existing
      ? await this.reactivate(existing.status as ProjectMembershipStatus, existing.id)
      : await this.prisma.projectMembership.create({
          data: {
            projectId,
            organizationMembershipId: orgMembership.id,
            status: "ACTIVE",
          },
        });
    await this.audit.insert({
      organizationId: project.organizationId,
      projectId,
      actorUserId: session.userId,
      eventType: existing ? "PROJECT_MEMBERSHIP_REACTIVATED" : "PROJECT_MEMBERSHIP_ADDED",
      resourceType: "project_membership",
      resourceId: membership.id,
      correlationId: currentCorrelationId(),
      payload: redactSecrets({
        targetUserId: orgMembership.userId,
        organizationMembershipId: orgMembership.id,
      }),
    });
    return membership;
  }

  async updateStatus(
    session: RequestSession,
    projectId: string,
    membershipId: string,
    nextStatus: ProjectMembershipStatus,
  ) {
    const actor = await this.authz.assert(session, "project.manage_members", projectId);
    const membership = await this.prisma.projectMembership.findUnique({
      where: { id: membershipId },
      include: { project: true, organizationMembership: true },
    });
    if (!membership || membership.projectId !== projectId || membership.project.organizationId !== actor.organizationId) {
      throw new DenyByDefaultError("Project membership not found in the authorized Project");
    }
    assertProjectMembershipTransition(membership.status as ProjectMembershipStatus, nextStatus);
    if (nextStatus === "ACTIVE" && !isUsableMembership(membership.organizationMembership.status as MembershipStatus)) {
      throw new DenyByDefaultError("ACTIVE Organization Membership is required before ACTIVE ProjectMembership");
    }
    const updated = await this.prisma.projectMembership.update({
      where: { id: membership.id },
      data: {
        status: nextStatus,
        deactivatedAt: nextStatus === "ACTIVE" ? null : new Date(),
      },
    });
    const eventType =
      nextStatus === "SUSPENDED"
        ? "PROJECT_MEMBERSHIP_SUSPENDED"
        : nextStatus === "REMOVED"
          ? "PROJECT_MEMBERSHIP_REMOVED"
          : "PROJECT_MEMBERSHIP_REACTIVATED";
    await this.audit.insert({
      organizationId: membership.project.organizationId,
      projectId,
      actorUserId: session.userId,
      eventType,
      resourceType: "project_membership",
      resourceId: membership.id,
      correlationId: currentCorrelationId(),
      payload: redactSecrets({
        from: membership.status,
        to: nextStatus,
        targetUserId: membership.organizationMembership.userId,
      }),
    });
    return updated;
  }

  async assignRole(
    session: RequestSession,
    projectId: string,
    membershipId: string,
    input: { templateKey?: RoleTemplateKey; roleId?: string },
  ) {
    const actor = await this.authz.assert(session, "project.assign_roles", projectId);
    const membership = await this.prisma.projectMembership.findUnique({
      where: { id: membershipId },
      include: {
        project: true,
        organizationMembership: true,
        roleAssignments: { include: { role: true } },
      },
    });
    if (!membership || membership.projectId !== projectId || membership.project.organizationId !== actor.organizationId) {
      throw new DenyByDefaultError("Project membership not found in the authorized Project");
    }
    if (membership.status !== "ACTIVE") {
      throw new DenyByDefaultError("Project role assignment requires an ACTIVE ProjectMembership");
    }
    if (!isUsableMembership(membership.organizationMembership.status as MembershipStatus)) {
      throw new DenyByDefaultError("ACTIVE Organization Membership is required before project role assignment");
    }
    const role = await this.roles.requireOrgOwnedRole(actor.organizationId, input);
    const existingKeys = membership.roleAssignments.map((assignment) => assignment.role.templateKey);
    const existingPermissions = actor.grants
      .filter((grant) => grant.scope === "project" && grant.projectId === projectId)
      .flatMap((grant) => [...grant.permissions]) as PermissionCode[];
    const nextPermissions = role.rolePermissions.map((row) => row.permission.code as PermissionCode);
    assertProjectAssignRolesSoD({
      actorUserId: session.userId,
      targetUserId: membership.organizationMembership.userId,
      grantsOutsideExistingAuthority: grantsOutsideExistingAuthority({
        existingTemplateKeys: existingKeys,
        existingPermissions,
        nextTemplateKey: role.templateKey,
        nextPermissions,
      }),
    });
    const existing = await this.prisma.projectRoleAssignment.findUnique({
      where: { projectMembershipId_roleId: { projectMembershipId: membership.id, roleId: role.id } },
    });
    if (existing) {
      return existing;
    }
    const assignment = await this.prisma.projectRoleAssignment.create({
      data: { projectMembershipId: membership.id, roleId: role.id },
    });
    await this.audit.insert({
      organizationId: actor.organizationId,
      projectId,
      actorUserId: session.userId,
      eventType: "PROJECT_ROLE_ASSIGNED",
      resourceType: "project_role_assignment",
      resourceId: assignment.id,
      correlationId: currentCorrelationId(),
      payload: redactSecrets({
        templateKey: role.templateKey,
        sourceTemplateKey: role.sourceTemplateKey,
        roleId: role.id,
        targetUserId: membership.organizationMembership.userId,
      }),
    });
    return assignment;
  }

  private async reactivate(from: ProjectMembershipStatus, id: string) {
    if (from === "ACTIVE") {
      return this.prisma.projectMembership.findUniqueOrThrow({ where: { id } });
    }
    assertProjectMembershipTransition(from, "ACTIVE");
    return this.prisma.projectMembership.update({
      where: { id },
      data: { status: "ACTIVE", deactivatedAt: null },
    });
  }
}
