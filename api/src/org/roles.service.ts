import { Injectable } from "@nestjs/common";
import {
  DenyByDefaultError,
  ROLE_TEMPLATES,
  assertClosedCatalog,
  assertOperationalRoleDefinition,
  denyExternalOrgWideAccess,
  redactSecrets,
  type PermissionCode,
} from "@amber/shared";
import type { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { RequestSession } from "../auth/session.types";
import { AuthzService } from "../authz/authz.service";
import { currentCorrelationId } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authz: AuthzService,
  ) {}

  async instantiateForOrganization(
    tx: Prisma.TransactionClient | PrismaService,
    organizationId: string,
  ): Promise<void> {
    const templates = await tx.roleDefinition.findMany({
      where: { organizationId: null, isSystemTemplate: true },
      include: { rolePermissions: true },
    });
    if (templates.length !== ROLE_TEMPLATES.length) {
      throw new Error("Amber Role Templates are not fully seeded");
    }
    for (const template of templates) {
      const existing = await tx.roleDefinition.findFirst({
        where: { organizationId, templateKey: template.templateKey },
      });
      if (existing) {
        continue;
      }
      await tx.roleDefinition.create({
        data: {
          organizationId,
          templateKey: template.templateKey,
          sourceTemplateKey: template.sourceTemplateKey || template.templateKey,
          name: template.name,
          description: template.description,
          isSystemTemplate: false,
          rolePermissions: {
            create: template.rolePermissions.map((row) => ({ permissionId: row.permissionId })),
          },
        },
      });
    }
  }

  async requireOrgOwnedRole(organizationId: string, input: { roleId?: string; templateKey?: string }) {
    if (!input.roleId && !input.templateKey) {
      throw new DenyByDefaultError("roleId or templateKey is required");
    }
    const role = input.roleId
      ? await this.prisma.roleDefinition.findUnique({
          where: { id: input.roleId },
          include: { rolePermissions: { include: { permission: true } } },
        })
      : await this.prisma.roleDefinition.findFirst({
          where: { organizationId, templateKey: input.templateKey, isSystemTemplate: false },
          include: { rolePermissions: { include: { permission: true } } },
        });
    if (!role) {
      throw new DenyByDefaultError("Organization-owned RoleDefinition not found");
    }
    assertOperationalRoleDefinition({
      roleOrganizationId: role.organizationId,
      authorizedOrganizationId: organizationId,
      isSystemTemplate: role.isSystemTemplate,
    });
    return role;
  }

  async list(session: RequestSession, organizationId: string) {
    const context = await this.authz.assert(session, "organization.read");
    denyExternalOrgWideAccess(context.membershipType, "org_directory");
    if (session.activeOrganizationId !== organizationId) {
      throw new DenyByDefaultError("Path organizationId does not match session-bound Organization");
    }
    const roles = await this.prisma.roleDefinition.findMany({
      where: { organizationId, isSystemTemplate: false },
      include: { rolePermissions: { include: { permission: true } } },
      orderBy: { templateKey: "asc" },
    });
    return roles.map((role) => ({
      id: role.id,
      organizationId: role.organizationId,
      templateKey: role.templateKey,
      sourceTemplateKey: role.sourceTemplateKey,
      name: role.name,
      description: role.description,
      isSystemTemplate: role.isSystemTemplate,
      permissions: role.rolePermissions.map((row) => row.permission.code),
    }));
  }

  async update(
    session: RequestSession,
    organizationId: string,
    roleId: string,
    input: { name?: string; description?: string; permissions?: PermissionCode[] },
  ) {
    await this.authz.assert(session, "organization.manage_roles");
    if (session.activeOrganizationId !== organizationId) {
      throw new DenyByDefaultError("Path organizationId does not match session-bound Organization");
    }
    const role = await this.requireOrgOwnedRole(organizationId, { roleId });
    const nextPermissions = input.permissions ?? role.rolePermissions.map((row) => row.permission.code as PermissionCode);
    for (const code of nextPermissions) {
      assertClosedCatalog(code);
    }
    const permissionRows = await this.prisma.permissionDefinition.findMany({
      where: { code: { in: nextPermissions } },
    });
    if (permissionRows.length !== nextPermissions.length) {
      throw new DenyByDefaultError("Role permissions must stay inside the closed 0.2A catalog");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.roleDefinition.update({
        where: { id: role.id },
        data: {
          name: input.name?.trim() || role.name,
          description: input.description?.trim() || role.description,
        },
      });
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({
        data: permissionRows.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      });
      return next;
    });
    await this.audit.insert({
      organizationId,
      actorUserId: session.userId,
      eventType: "ORG_ROLE_UPDATED",
      resourceType: "role_definition",
      resourceId: role.id,
      correlationId: currentCorrelationId(),
      payload: redactSecrets({
        templateKey: role.templateKey,
        sourceTemplateKey: role.sourceTemplateKey,
        permissions: nextPermissions,
      }),
    });
    return {
      id: updated.id,
      templateKey: updated.templateKey,
      sourceTemplateKey: updated.sourceTemplateKey,
      name: updated.name,
      description: updated.description,
      permissions: nextPermissions,
    };
  }
}
