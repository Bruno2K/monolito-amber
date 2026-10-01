import { Injectable } from "@nestjs/common";
import { DenyByDefaultError } from "@amber/shared";
import type { RequestSession } from "../auth/session.types";
import { AuthzService } from "../authz/authz.service";
import { PrismaService } from "../prisma/prisma.service";
import { OperationsAccess } from "./operations.access";

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OperationsAccess,
    private readonly authz: AuthzService,
  ) {}

  async list(session: RequestSession, organizationId: string, query: { projectId?: string }) {
    this.access.requirePathOrganization(session, organizationId);
    if (query.projectId) {
      await this.access.requireProject(session, "project.read", query.projectId);
    } else {
      await this.assertCatalogVisible(session, organizationId);
    }
    const rows = await this.prisma.team.findMany({
      where: { organizationId: session.activeOrganizationId!, archivedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        name: row.name,
        version: row.version,
        archivedAt: row.archivedAt,
      })),
    };
  }

  private async assertCatalogVisible(session: RequestSession, organizationId: string) {
    try {
      await this.authz.assert(session, "organization.manage_catalogs");
      return;
    } catch {
      // fall through to project.read in this Organization
    }
    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: { organizationId, userId: session.userId },
      },
    });
    if (!membership || membership.status !== "ACTIVE") {
      throw new DenyByDefaultError("ACTIVE membership is required");
    }
    const projectMembership = await this.prisma.projectMembership.findFirst({
      where: {
        organizationMembershipId: membership.id,
        status: "ACTIVE",
        project: { organizationId },
      },
      include: {
        roleAssignments: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } },
      },
    });
    const hasRead = projectMembership?.roleAssignments.some((assignment) =>
      assignment.role.rolePermissions.some((row) => row.permission.code === "project.read"),
    );
    if (!hasRead) {
      throw new DenyByDefaultError("Missing permission project.read");
    }
  }
}
