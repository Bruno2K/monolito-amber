import { Injectable } from "@nestjs/common";
import {
  DenyByDefaultError,
  ReauthenticationRequiredError,
  assertOperationalRoleDefinition,
  assertPermission,
  assertRecentAuthentication,
  isHighRiskPermission,
  isProjectScopedPermission,
  mfaRequirementSatisfied,
  resolveAuthorizedProject,
  resolvePermissions,
  type AuthzContext,
  type MembershipStatus,
  type MembershipType,
  type PermissionCode,
  type ProjectMembershipStatus,
  type RoleGrant,
} from "@amber/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestSession } from "../auth/session.types";

export interface LoadedAuthzContext extends AuthzContext {
  membershipId: string;
  projectMembershipId?: string | null;
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

    const orgGrants: RoleGrant[] = [];
    for (const binding of membership.roleBindings) {
      if (!binding.role.organizationId || binding.role.isSystemTemplate) {
        continue;
      }
      try {
        assertOperationalRoleDefinition({
          roleOrganizationId: binding.role.organizationId,
          authorizedOrganizationId: membership.organizationId,
          isSystemTemplate: binding.role.isSystemTemplate,
        });
      } catch {
        continue;
      }
      orgGrants.push({
        templateKey: binding.role.templateKey,
        scope: "organization",
        projectId: null,
        permissions: binding.role.rolePermissions.map((rp) => rp.permission.code as PermissionCode),
      });
    }

    let authorizedProjectId: string | null = null;
    let projectMembershipStatus: ProjectMembershipStatus | null = null;
    let projectMembershipId: string | null = null;
    const projectGrants: RoleGrant[] = [];

    if (projectId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
        throw new DenyByDefaultError("Client projectId is not authoritative and does not match the authorized Project");
      }
      const project = await this.prisma.project.findUnique({ where: { id: projectId } });
      authorizedProjectId = resolveAuthorizedProject({
        projectId,
        projectOrganizationId: project?.organizationId,
        authorizedOrganizationId: membership.organizationId,
        pathProjectId: projectId,
      });
      const projectMembership = await this.prisma.projectMembership.findUnique({
        where: {
          projectId_organizationMembershipId: {
            projectId: authorizedProjectId,
            organizationMembershipId: membership.id,
          },
        },
        include: {
          roleAssignments: {
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
      projectMembershipStatus = (projectMembership?.status as ProjectMembershipStatus | undefined) ?? null;
      projectMembershipId = projectMembership?.id ?? null;
      if (projectMembership?.status === "ACTIVE") {
        for (const assignment of projectMembership.roleAssignments) {
          if (!assignment.role.organizationId || assignment.role.isSystemTemplate) {
            continue;
          }
          try {
            assertOperationalRoleDefinition({
              roleOrganizationId: assignment.role.organizationId,
              authorizedOrganizationId: membership.organizationId,
              isSystemTemplate: assignment.role.isSystemTemplate,
            });
          } catch {
            continue;
          }
          projectGrants.push({
            templateKey: assignment.role.templateKey,
            scope: "project",
            projectId: authorizedProjectId,
            permissions: assignment.role.rolePermissions.map((rp) => rp.permission.code as PermissionCode),
          });
        }
      }
    }

    const grants = [...orgGrants, ...projectGrants];
    const enrolled = await this.isMfaEnrolled(session.userId);
    return {
      membershipId: membership.id,
      projectMembershipId,
      userId: session.userId,
      organizationId: membership.organizationId,
      membershipStatus: membership.status as MembershipStatus,
      membershipType: membership.type as MembershipType,
      grants,
      projectId: authorizedProjectId,
      projectMembershipStatus,
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
    if (isProjectScopedPermission(permission) && !projectId) {
      throw new DenyByDefaultError("Project context is required for project-scoped authorization");
    }
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
        projectMemberships: {
          where: { status: "ACTIVE" },
          include: { roleAssignments: { include: { role: true } } },
        },
      },
    });
    const keys = new Set<string>();
    for (const membership of memberships) {
      for (const binding of membership.roleBindings) {
        if (binding.role.organizationId && !binding.role.isSystemTemplate) {
          keys.add(binding.role.templateKey);
        }
      }
      for (const projectMembership of membership.projectMemberships) {
        for (const assignment of projectMembership.roleAssignments) {
          if (assignment.role.organizationId && !assignment.role.isSystemTemplate) {
            keys.add(assignment.role.templateKey);
          }
        }
      }
    }
    return [...keys];
  }

  async isMfaEnrolled(userId: string): Promise<boolean> {
    const row = await this.prisma.mfaTotpCredential.findUnique({ where: { userId } });
    return Boolean(row?.verifiedAt);
  }
}
