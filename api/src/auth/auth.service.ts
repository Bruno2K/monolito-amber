import { Injectable } from "@nestjs/common";
import {
  DenyByDefaultError,
  SessionExpiredError,
  SessionRevokedError,
  assertSessionUsable,
  evaluateOrgSwitch,
} from "@amber/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestSession } from "./session.types";

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async loadSession(tokenHash: string | undefined): Promise<RequestSession | null> {
    if (!tokenHash) {
      return null;
    }
    const row = await this.prisma.session.findUnique({ where: { tokenHash } });
    if (!row) {
      return null;
    }
    const session: RequestSession = {
      id: row.id,
      userId: row.userId,
      activeOrganizationId: row.activeOrganizationId,
      createdAt: row.createdAt,
      lastSeenAt: row.lastSeenAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    };
    try {
      assertSessionUsable(session);
    } catch (error) {
      if (error instanceof SessionRevokedError || error instanceof SessionExpiredError) {
        throw error;
      }
      throw error;
    }
    return session;
  }

  async switchOrganization(input: {
    session: RequestSession;
    targetOrganizationId: string;
  }): Promise<{ activeOrganizationId: string }> {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.targetOrganizationId,
          userId: input.session.userId,
        },
      },
    });
    const result = evaluateOrgSwitch({
      session: input.session,
      targetOrganizationId: input.targetOrganizationId,
      membership: membership
        ? {
            userId: membership.userId,
            organizationId: membership.organizationId,
            status: membership.status as "INVITED" | "ACTIVE" | "SUSPENDED" | "REMOVED",
            type: membership.type as "INTERNAL" | "EXTERNAL" | "ADMINISTRATIVE",
          }
        : null,
    });
    await this.prisma.session.update({
      where: { id: input.session.id },
      data: { activeOrganizationId: result.nextActiveOrganizationId, lastSeenAt: new Date() },
    });
    await this.prisma.auditEvent.create({
      data: {
        organizationId: result.nextActiveOrganizationId,
        actorUserId: input.session.userId,
        eventType: "ORG_SWITCHED",
        resourceType: "organization",
        resourceId: result.nextActiveOrganizationId,
        correlationId: "org-switch",
        payload: { from: input.session.activeOrganizationId, to: result.nextActiveOrganizationId },
      },
    });
    return { activeOrganizationId: result.nextActiveOrganizationId };
  }

  requireSession(session: RequestSession | null): RequestSession {
    if (!session) {
      throw new DenyByDefaultError("Authentication required");
    }
    return session;
  }
}
