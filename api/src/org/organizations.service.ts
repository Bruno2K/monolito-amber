import { Injectable } from "@nestjs/common";
import {
  DenyByDefaultError,
  denyExternalOrgWideAccess,
  normalizeEmail,
  redactSecrets,
} from "@amber/shared";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import type { RequestSession } from "../auth/session.types";
import { currentCorrelationId } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { RolesService } from "./roles.service";

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly roles: RolesService,
  ) {}

  async create(session: RequestSession, input: { name: string; slug?: string }) {
    const slug = await this.uniqueSlug(input.slug ?? input.name);
    const created = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: input.name.trim(), slug },
      });
      await this.roles.instantiateForOrganization(tx, organization.id);
      const adminRole = await tx.roleDefinition.findFirst({
        where: {
          organizationId: organization.id,
          templateKey: "ORGANIZATION_ADMINISTRATOR",
          isSystemTemplate: false,
        },
      });
      if (!adminRole) {
        throw new Error("Organization-owned ORGANIZATION_ADMINISTRATOR was not instantiated");
      }
      const membership = await tx.organizationMembership.create({
        data: {
          organizationId: organization.id,
          userId: session.userId,
          type: "ADMINISTRATIVE",
          status: "ACTIVE",
        },
      });
      await tx.roleBinding.create({
        data: { membershipId: membership.id, roleId: adminRole.id },
      });
      await tx.session.update({
        where: { id: session.id },
        data: { activeOrganizationId: organization.id, lastSeenAt: new Date() },
      });
      return { organization, membership };
    });
    await this.audit.insert({
      organizationId: created.organization.id,
      actorUserId: session.userId,
      eventType: "ORG_CREATED",
      resourceType: "organization",
      resourceId: created.organization.id,
      correlationId: currentCorrelationId(),
      payload: redactSecrets({ slug, name: created.organization.name }),
    });
    return created;
  }

  async listMine(session: RequestSession) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId: session.userId, status: { in: ["ACTIVE", "INVITED", "SUSPENDED"] } },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });
    return memberships.map((row) => ({
      id: row.organization.id,
      name: row.organization.name,
      slug: row.organization.slug,
      membershipId: row.id,
      status: row.status,
      type: row.type,
      active: session.activeOrganizationId === row.organization.id,
    }));
  }

  async get(session: RequestSession, organizationId: string) {
    if (session.activeOrganizationId !== organizationId) {
      throw new DenyByDefaultError("Path organizationId does not match session-bound Organization");
    }
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId: session.userId } },
    });
    if (!membership || membership.status !== "ACTIVE") {
      throw new DenyByDefaultError("Organization membership is not ACTIVE");
    }
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      throw new DenyByDefaultError("Organization not found");
    }
    return { organization, membership };
  }

  async listMembers(session: RequestSession, organizationId: string) {
    const { membership } = await this.get(session, organizationId);
    denyExternalOrgWideAccess(membership.type as "INTERNAL" | "EXTERNAL" | "ADMINISTRATIVE", "org_directory");
    const rows = await this.prisma.organizationMembership.findMany({
      where: { organizationId },
      include: {
        user: true,
        roleBindings: { include: { role: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      email: row.user.email,
      displayName: row.user.displayName,
      status: row.status,
      type: row.type,
      roles: row.roleBindings.map((binding) => ({
        id: binding.id,
        roleId: binding.role.id,
        templateKey: binding.role.templateKey,
        sourceTemplateKey: binding.role.sourceTemplateKey,
        name: binding.role.name,
        organizationId: binding.role.organizationId,
      })),
    }));
  }

  private async uniqueSlug(source: string): Promise<string> {
    const base = source
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "org";
    let slug = base;
    let n = 1;
    while (await this.prisma.organization.findUnique({ where: { slug } })) {
      n += 1;
      slug = `${base}-${n}`;
    }
    return slug;
  }

  normalize(email: string): string {
    return normalizeEmail(email);
  }
}
