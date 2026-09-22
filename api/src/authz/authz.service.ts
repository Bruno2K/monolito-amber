import { Injectable } from "@nestjs/common";
import {
  DenyByDefaultError,
  ReauthenticationRequiredError,
  assertPermission,
  assertRecentAuthentication,
  isHighRiskPermission,
  mfaRequirementSatisfied,
  resolvePermissions,
  type AuthzContext,
  type MembershipStatus,
  type MembershipType,
  type PermissionCode,
  type RoleGrant,
} from "@amber/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestSession } from "../auth/session.types";

export interface LoadedAuthzContext extends AuthzContext {
  membershipId: string;
}

@Injectable()
export class AuthzService {
  constructor(private readonly prisma: PrismaService) {}

  async loadContext(session: RequestSession, projectId?: string | null): Promise<LoadedAuthzContext> {
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
      include: {
        roleBindings: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
    if (!membership) {
      throw new DenyByDefaultError("No membership for the authenticated principal");
    }
    const grants: RoleGrant[] = membership.roleBindings.map((binding) => ({
      templateKey: binding.role.templateKey,
      projectId: binding.projectId,
      permissions: binding.role.rolePermissions.map((rp) => rp.permission.code as PermissionCode),
    }));
    const enrolled = await this.isMfaEnrolled(session.userId);
    return {
      membershipId: membership.id,
      userId: session.userId,
      organizationId: membership.organizationId,
      membershipStatus: membership.status as MembershipStatus,
      membershipType: membership.type as MembershipType,
      grants,
      projectId: projectId ?? null,
      mfaSatisfied: mfaRequirementSatisfied({
        templateKeys: grants.map((grant) => grant.templateKey),
        enrolled,
      }),
    };
  }

  permissionsOf(context: AuthzContext): PermissionCode[] {
    return resolvePermissions(context);
  }

  async assert(session: RequestSession, permission: PermissionCode, projectId?: string | null): Promise<LoadedAuthzContext> {
    const context = await this.loadContext(session, projectId);
    assertPermission(context, permission);
    if (isHighRiskPermission(permission)) {
      try {
        assertRecentAuthentication(session);
      } catch (error) {
        if (error instanceof ReauthenticationRequiredError) {
          throw error;
        }
        throw error;
      }
    }
    return context;
  }

  async templateKeysForUser(userId: string): Promise<string[]> {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId, status: "ACTIVE" },
      include: {
        roleBindings: { include: { role: true } },
      },
    });
    return memberships.flatMap((membership) => membership.roleBindings.map((binding) => binding.role.templateKey));
  }

  async isMfaEnrolled(userId: string): Promise<boolean> {
    const row = await this.prisma.mfaTotpCredential.findUnique({ where: { userId } });
    return Boolean(row?.verifiedAt);
  }
}
