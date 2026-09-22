import { Injectable } from "@nestjs/common";
import {
  DenyByDefaultError,
  assertActiveProjectMembership,
  resolveAuthorizedOrganization,
  resolveAuthorizedProject,
  type ProjectMembershipStatus,
} from "@amber/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestSession } from "../auth/session.types";

@Injectable()
export class TenancyService {
  constructor(private readonly prisma: PrismaService) {}

  async authorizeOrganization(input: {
    session: RequestSession | null;
    pathOrganizationId?: string;
    clientOrganizationId?: string;
  }): Promise<string> {
    if (!input.session) {
      throw new DenyByDefaultError("Authentication required");
    }
    const membership = input.session.activeOrganizationId
      ? await this.prisma.organizationMembership.findUnique({
          where: {
            organizationId_userId: {
              organizationId: input.session.activeOrganizationId,
              userId: input.session.userId,
            },
          },
        })
      : null;
    return resolveAuthorizedOrganization({
      session: input.session,
      membership: membership
        ? {
            userId: membership.userId,
            organizationId: membership.organizationId,
            status: membership.status as "INVITED" | "ACTIVE" | "SUSPENDED" | "REMOVED",
            type: membership.type as "INTERNAL" | "EXTERNAL" | "ADMINISTRATIVE",
          }
        : null,
      pathOrganizationId: input.pathOrganizationId,
      clientOrganizationId: input.clientOrganizationId,
    });
  }

  async authorizeProject(input: {
    session: RequestSession | null;
    projectId: string;
    pathOrganizationId?: string;
    clientProjectId?: string;
    requireActiveMembership?: boolean;
  }): Promise<{ organizationId: string; projectId: string; projectMembershipId?: string }> {
    const organizationId = await this.authorizeOrganization({
      session: input.session,
      pathOrganizationId: input.pathOrganizationId,
    });
    const project = await this.prisma.project.findUnique({ where: { id: input.projectId } });
    const projectId = resolveAuthorizedProject({
      projectId: input.projectId,
      projectOrganizationId: project?.organizationId,
      authorizedOrganizationId: organizationId,
      clientProjectId: input.clientProjectId,
      pathProjectId: input.projectId,
    });
    if (!input.requireActiveMembership || !input.session) {
      return { organizationId, projectId };
    }
    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: input.session.userId,
        },
      },
    });
    if (!membership) {
      throw new DenyByDefaultError("No membership for the authenticated principal");
    }
    const projectMembership = await this.prisma.projectMembership.findUnique({
      where: {
        projectId_organizationMembershipId: {
          projectId,
          organizationMembershipId: membership.id,
        },
      },
    });
    assertActiveProjectMembership(projectMembership?.status as ProjectMembershipStatus | undefined);
    return { organizationId, projectId, projectMembershipId: projectMembership?.id };
  }
}
