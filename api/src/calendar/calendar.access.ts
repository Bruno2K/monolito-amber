import { Injectable } from "@nestjs/common";
import {
  CalendarStateError,
  DenyByDefaultError,
  assertCalendarActionAllowed,
  calendarActionAllowed,
  effectiveCalendarRole,
  hasPermission,
  type CalendarGrantPath,
  type CalendarGrantRole,
  type CalendarMutationAction,
  type MembershipStatus,
} from "@amber/shared";
import type { Calendar, CalendarAccessGrant, OrganizationMembership, Team, TeamMembership } from "@prisma/client";
import type { RequestSession } from "../auth/session.types";
import { AuthzService } from "../authz/authz.service";
import { PrismaService } from "../prisma/prisma.service";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CalendarRow = Calendar;
export type GrantRow = CalendarAccessGrant & {
  subjectUser?: OrganizationMembership | null;
  subjectTeam?: Team | null;
};

export interface ActorMembership {
  id: string;
  userId: string;
  organizationId: string;
  status: MembershipStatus;
  type: "INTERNAL" | "EXTERNAL" | "ADMINISTRATIVE";
}

export interface BoundCalendar {
  calendar: CalendarRow;
  actor: ActorMembership;
  owner: OrganizationMembership;
  grantRows: GrantRow[];
  grantPaths: CalendarGrantPath[];
  effectiveRole: CalendarGrantRole | null;
  actorIsOwner: boolean;
}

@Injectable()
export class CalendarAccess {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  async requireActor(session: RequestSession): Promise<ActorMembership> {
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
    });
    if (!membership) {
      throw new DenyByDefaultError("No membership for the authenticated principal");
    }
    return {
      id: membership.id,
      userId: membership.userId,
      organizationId: membership.organizationId,
      status: membership.status as MembershipStatus,
      type: membership.type as ActorMembership["type"],
    };
  }

  rejectClientOrganization(input: { organizationId?: string }, organizationId: string): void {
    if (input.organizationId && input.organizationId !== organizationId) {
      throw new DenyByDefaultError("Client organizationId is not authoritative");
    }
  }

  denyInaccessible(): never {
    throw new DenyByDefaultError("Calendar is not available to the authenticated principal");
  }

  rejectArchivedCalendar(calendar: CalendarRow, action = "Calendar mutations"): void {
    if (calendar.status === "ARCHIVED" || calendar.archivedAt) {
      throw new CalendarStateError(`${action} are unavailable on an archived Calendar`);
    }
  }

  async bind(session: RequestSession, calendarId: string, action: CalendarMutationAction): Promise<BoundCalendar> {
    const actor = await this.requireActor(session);
    if (!UUID_RE.test(calendarId)) {
      this.denyInaccessible();
    }
    const calendar = await this.prisma.calendar.findUnique({
      where: { id: calendarId },
      include: { owner: true },
    });
    if (!calendar || calendar.organizationId !== actor.organizationId) {
      this.denyInaccessible();
    }
    const grantRows = await this.prisma.calendarAccessGrant.findMany({
      where: { calendarId: calendar.id, organizationId: actor.organizationId },
      include: { subjectTeam: true },
    });
    const grantPaths = await this.pathsForActor(actor, grantRows);
    const bound: BoundCalendar = {
      calendar,
      actor,
      owner: calendar.owner,
      grantRows,
      grantPaths,
      effectiveRole: effectiveCalendarRole(grantPaths),
      actorIsOwner: actor.id === calendar.ownerOrganizationMembershipId,
    };
    assertCalendarActionAllowed({
      actorMembershipId: actor.id,
      actorMembershipStatus: actor.status,
      owner: {
        ownerMembershipId: calendar.ownerOrganizationMembershipId,
        ownerMembershipStatus: calendar.owner.status as MembershipStatus,
      },
      grantPaths,
      action,
    });
    if (action !== "read") {
      this.rejectArchivedCalendar(calendar);
    }
    return bound;
  }

  async pathsForActor(actor: ActorMembership, grants: GrantRow[]): Promise<CalendarGrantPath[]> {
    const teamIds = [
      ...new Set(grants.filter((row) => row.principalKind === "TEAM" && row.teamId).map((row) => row.teamId!)),
    ];
    const memberships =
      teamIds.length === 0
        ? []
        : await this.prisma.teamMembership.findMany({
            where: {
              organizationMembershipId: actor.id,
              teamId: { in: teamIds },
            },
            include: { team: true },
          });
    const byTeam = new Map(memberships.map((row) => [row.teamId, row]));
    const paths: CalendarGrantPath[] = [];
    for (const grant of grants) {
      if (grant.revokedAt) {
        continue;
      }
      if (grant.principalKind === "USER" && grant.organizationMembershipId === actor.id) {
        paths.push({
          kind: "USER",
          role: grant.role as CalendarGrantRole,
          active: actor.status === "ACTIVE",
          revoked: false,
        });
        continue;
      }
      if (grant.principalKind === "TEAM" && grant.teamId) {
        const membership = byTeam.get(grant.teamId);
        const team = membership?.team ?? grant.subjectTeam;
        paths.push({
          kind: "TEAM",
          role: grant.role as CalendarGrantRole,
          active: actor.status === "ACTIVE" && membership?.status === "ACTIVE",
          revoked: false,
          archivedTeam: Boolean(team?.archivedAt),
        });
      }
    }
    return paths;
  }

  async authorizedCalendarIds(actor: ActorMembership): Promise<string[]> {
    if (actor.status !== "ACTIVE") {
      return [];
    }
    const teamMemberships = await this.prisma.teamMembership.findMany({
      where: { organizationMembershipId: actor.id, status: "ACTIVE" },
      include: { team: true },
    });
    const activeTeamIds = teamMemberships.filter((row) => !row.team.archivedAt).map((row) => row.teamId);
    const [owned, userGrants, teamGrants] = await Promise.all([
      this.prisma.calendar.findMany({
        where: {
          organizationId: actor.organizationId,
          ownerOrganizationMembershipId: actor.id,
        },
        select: { id: true },
      }),
      this.prisma.calendarAccessGrant.findMany({
        where: {
          organizationId: actor.organizationId,
          principalKind: "USER",
          organizationMembershipId: actor.id,
          revokedAt: null,
        },
        select: { calendarId: true },
      }),
      activeTeamIds.length === 0
        ? Promise.resolve([] as Array<{ calendarId: string }>)
        : this.prisma.calendarAccessGrant.findMany({
            where: {
              organizationId: actor.organizationId,
              principalKind: "TEAM",
              teamId: { in: activeTeamIds },
              revokedAt: null,
            },
            select: { calendarId: true },
          }),
    ]);
    return [...new Set([...owned, ...userGrants, ...teamGrants].map((row) => ("id" in row ? row.id : row.calendarId)))];
  }

  canRead(bound: BoundCalendar): boolean {
    return calendarActionAllowed({
      actorMembershipId: bound.actor.id,
      actorMembershipStatus: bound.actor.status,
      owner: {
        ownerMembershipId: bound.calendar.ownerOrganizationMembershipId,
        ownerMembershipStatus: bound.owner.status as MembershipStatus,
      },
      grantPaths: bound.grantPaths,
      action: "read",
    });
  }

  async hasProjectRead(session: RequestSession, projectId: string | null | undefined): Promise<boolean> {
    if (!projectId || !UUID_RE.test(projectId)) {
      return false;
    }
    try {
      const context = await this.authz.loadContext(session, projectId);
      return hasPermission(context, "project.read");
    } catch {
      return false;
    }
  }

  async activeTeamMemberships(actorId: string): Promise<Array<TeamMembership & { team: Team }>> {
    return this.prisma.teamMembership.findMany({
      where: { organizationMembershipId: actorId, status: "ACTIVE" },
      include: { team: true },
    });
  }
}
