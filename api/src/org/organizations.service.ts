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

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  async create(session: RequestSession, input: { name: string; slug?: string }) {
    const slug = await this.uniqueSlug(input.slug ?? input.name);
    const adminRole = await this.prisma.roleDefinition.findFirst({
      where: { organizationId: null, templateKey: "ORGANIZATION_ADMINISTRATOR" },
    });
    if (!adminRole) {
      throw new Error("System role template ORGANIZATION_ADMINISTRATOR is not seeded");
    }

    const organization = await this.prisma.organization.create({
      data: { name: input.name.trim(), slug },
    });
    const membership = await this.prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: session.userId,
        type: "ADMINISTRATIVE",
        status: "ACTIVE",
      },
    });
    await this.prisma.roleBinding.create({
      data: { membershipId: membership.id, roleId: adminRole.id },
    });
    await this.prisma.session.update({
      where: { id: session.id },
      data: { activeOrganizationId: organization.id, lastSeenAt: new Date() },
    });
    await this.audit.insert({
      organizationId: organization.id,
      actorUserId: session.userId,
      eventType: "ORG_CREATED",
      resourceType: "organization",
      resourceId: organization.id,
      correlationId: currentCorrelationId(),
      payload: redactSecrets({ slug, name: organization.name }),
    });
    return { organization, membership };
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
        templateKey: binding.role.templateKey,
        name: binding.role.name,
        projectId: binding.projectId,
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
