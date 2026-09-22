import { Injectable } from "@nestjs/common";
import {
  DenyByDefaultError,
  assertMembershipTransition,
  assertRoleManagementSoD,
  grantsOutsideExistingAuthority,
  redactSecrets,
  type MembershipStatus,
  type RoleTemplateKey,
} from "@amber/shared";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import type { RequestSession } from "../auth/session.types";
import { AuthzService } from "../authz/authz.service";
import { currentCorrelationId } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { RolesService } from "./roles.service";

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly authz: AuthzService,
    private readonly roles: RolesService,
  ) {}

  async updateStatus(
    session: RequestSession,
    organizationId: string,
    membershipId: string,
    nextStatus: Extract<MembershipStatus, "ACTIVE" | "SUSPENDED" | "REMOVED">,
  ) {
    await this.authz.assert(session, "organization.manage_members");
    if (session.activeOrganizationId !== organizationId) {
      throw new DenyByDefaultError("Path organizationId does not match session-bound Organization");
    }
    const membership = await this.prisma.organizationMembership.findUnique({ where: { id: membershipId } });
    if (!membership || membership.organizationId !== organizationId) {
      throw new DenyByDefaultError("Membership not found in the authorized Organization");
    }
    assertMembershipTransition(membership.status as MembershipStatus, nextStatus);
    const updated = await this.prisma.organizationMembership.update({
      where: { id: membership.id },
      data: {
        status: nextStatus,
        deactivatedAt: nextStatus === "ACTIVE" ? null : new Date(),
      },
    });
    if (nextStatus === "SUSPENDED" || nextStatus === "REMOVED") {
      await this.auth.revokeSessionsForOrganization(membership.userId, organizationId, `membership_${nextStatus.toLowerCase()}`);
    }
    const eventType =
      nextStatus === "SUSPENDED"
        ? "MEMBERSHIP_SUSPENDED"
        : nextStatus === "REMOVED"
          ? "MEMBERSHIP_REMOVED"
          : "MEMBERSHIP_REACTIVATED";
    await this.audit.insert({
      organizationId,
      actorUserId: session.userId,
      eventType,
      resourceType: "membership",
      resourceId: membership.id,
      correlationId: currentCorrelationId(),
      payload: redactSecrets({ from: membership.status, to: nextStatus, targetUserId: membership.userId }),
    });
    return updated;
  }

  async assignRole(
    session: RequestSession,
    organizationId: string,
    membershipId: string,
    input: { templateKey?: RoleTemplateKey; roleId?: string },
  ) {
    const actor = await this.authz.assert(session, "organization.manage_roles");
    if (session.activeOrganizationId !== organizationId) {
      throw new DenyByDefaultError("Path organizationId does not match session-bound Organization");
    }
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { id: membershipId },
      include: { roleBindings: { include: { role: true } } },
    });
    if (!membership || membership.organizationId !== organizationId) {
      throw new DenyByDefaultError("Membership not found in the authorized Organization");
    }
    const role = await this.roles.requireOrgOwnedRole(organizationId, input);
    const actorHoldsOrgAdmin = actor.grants.some(
      (grant) => grant.scope === "organization" && grant.templateKey === "ORGANIZATION_ADMINISTRATOR",
    );
    const existingKeys = membership.roleBindings.map((binding) => binding.role.templateKey);
    const existingPermissions = actor.grants
      .filter((grant) => grant.scope === "organization")
      .flatMap((grant) => [...grant.permissions]);
    assertRoleManagementSoD({
      actorUserId: session.userId,
      targetUserId: membership.userId,
      actorHoldsOrgAdmin,
      grantsOutsideExistingAuthority: grantsOutsideExistingAuthority({
        existingTemplateKeys: existingKeys,
        existingPermissions,
        nextTemplateKey: role.templateKey,
        nextPermissions: role.rolePermissions.map((row) => row.permission.code as never),
      }),
    });

    const existing = await this.prisma.roleBinding.findUnique({
      where: { membershipId_roleId: { membershipId: membership.id, roleId: role.id } },
    });
    if (existing) {
      return existing;
    }
    const binding = await this.prisma.roleBinding.create({
      data: {
        membershipId: membership.id,
        roleId: role.id,
      },
    });
    await this.audit.insert({
      organizationId,
      actorUserId: session.userId,
      eventType: "ROLE_ASSIGNED",
      resourceType: "role_binding",
      resourceId: binding.id,
      correlationId: currentCorrelationId(),
      payload: redactSecrets({
        templateKey: role.templateKey,
        sourceTemplateKey: role.sourceTemplateKey,
        roleId: role.id,
        targetUserId: membership.userId,
      }),
    });
    return binding;
  }
}
