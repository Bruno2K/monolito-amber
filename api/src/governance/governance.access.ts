import { Injectable } from "@nestjs/common";
import { DenyByDefaultError, type PermissionCode } from "@amber/shared";
import type { RequestSession } from "../auth/session.types";
import { AuthzService } from "../authz/authz.service";
import { PrismaService } from "../prisma/prisma.service";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class GovernanceAccess {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  async requireProject(session: RequestSession, permission: PermissionCode, projectId: string) {
    const context = await this.authz.assert(session, permission, projectId);
    if (!UUID_RE.test(projectId)) {
      throw new DenyByDefaultError("Client projectId is not authoritative");
    }
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.organizationId !== context.organizationId) {
      throw new DenyByDefaultError("Project is not bound to the authorized Organization");
    }
    return { project, organizationId: context.organizationId, context };
  }

  rejectClientAuthority(
    input: { organizationId?: string; projectId?: string },
    organizationId: string,
    projectId: string,
  ) {
    if (input.organizationId && input.organizationId !== organizationId) {
      throw new DenyByDefaultError("Client organizationId is not authoritative");
    }
    if (input.projectId && input.projectId !== projectId) {
      throw new DenyByDefaultError("Client projectId is not authoritative");
    }
  }
}
