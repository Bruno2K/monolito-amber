import { Injectable } from "@nestjs/common";
import {
  CalendarStateError,
  DenyByDefaultError,
  OUTBOX_EVENT_TYPES,
  assertCalendarName,
  assertGrantPrincipalXor,
  assertIanaTimeZone,
  denyExternalOrgWideAccess,
  redactSecrets,
  type CalendarGrantPrincipalKind,
  type CalendarGrantRole,
} from "@amber/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { RequestSession } from "../auth/session.types";
import { FoundationService } from "../foundation/foundation.service";
import { IdempotencyService } from "../foundation/idempotency.service";
import { currentCorrelationId } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { CalendarAccess, UUID_RE, type ActorMembership, type BoundCalendar } from "./calendar.access";

@Injectable()
export class CalendarsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CalendarAccess,
    private readonly audit: AuditService,
    private readonly foundation: FoundationService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(session: RequestSession, query: { q?: string } = {}) {
    const actor = await this.access.requireActor(session);
    const ids = await this.access.authorizedCalendarIds(actor);
    if (ids.length === 0) {
      return { items: [], total: 0 };
    }
    const q = query.q?.trim();
    const rows = await this.prisma.calendar.findMany({
      where: {
        id: { in: ids },
        organizationId: actor.organizationId,
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      },
      include: { owner: true, grants: { include: { subjectTeam: true } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const items = [];
    for (const row of rows) {
      const grantPaths = await this.access.pathsForActor(actor, row.grants);
      items.push(
        this.toCalendarDto(row, actor, {
          actorIsOwner: actor.id === row.ownerOrganizationMembershipId,
          grantPaths,
        }),
      );
    }
    return { items, total: items.length };
  }

  async get(session: RequestSession, calendarId: string) {
    const bound = await this.access.bind(session, calendarId, "read");
    return this.toCalendarDto(bound.calendar, bound.actor, bound);
  }

  async create(
    session: RequestSession,
    idempotencyKey: string | undefined,
    input: { name: string; description?: string; timeZone: string; organizationId?: string },
  ) {
    const actor = await this.access.requireActor(session);
    if (actor.status !== "ACTIVE") {
      throw new DenyByDefaultError("ACTIVE Organization Membership is required");
    }
    this.access.rejectClientOrganization(input, actor.organizationId);
    assertCalendarName(input.name);
    assertIanaTimeZone(input.timeZone);
    const started = await this.idempotency.begin(actor.organizationId, idempotencyKey, {
      name: input.name.trim(),
      description: input.description ?? "",
      timeZone: input.timeZone.trim(),
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const calendar = await tx.calendar.create({
        data: {
          organizationId: actor.organizationId,
          ownerOrganizationMembershipId: actor.id,
          name: input.name.trim(),
          description: input.description?.trim() ?? "",
          timeZone: input.timeZone.trim(),
          status: "ACTIVE",
        },
      });
      await this.audit.insert(
        {
          organizationId: calendar.organizationId,
          actorUserId: session.userId,
          eventType: "CALENDAR_CREATED",
          resourceType: "calendar",
          resourceId: calendar.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            ownerOrganizationMembershipId: calendar.ownerOrganizationMembershipId,
            timeZone: calendar.timeZone,
          }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.CalendarCreated,
        { organizationId: calendar.organizationId, calendarId: calendar.id },
        currentCorrelationId(),
        tx,
      );
      const body = this.toCalendarDto(calendar, actor, { actorIsOwner: true, grantPaths: [] });
      await this.idempotency.commit(actor.organizationId, started.key, started.hash, 201, body, tx);
      return body;
    });
    return created;
  }

  async update(
    session: RequestSession,
    calendarId: string,
    input: { name?: string; description?: string; timeZone?: string; expectedVersion: number; organizationId?: string },
  ) {
    const bound = await this.access.bind(session, calendarId, "rename");
    this.access.rejectClientOrganization(input, bound.actor.organizationId);
    this.foundation.cas(bound.calendar, input.expectedVersion);
    if (input.name !== undefined) {
      assertCalendarName(input.name);
    }
    if (input.timeZone !== undefined) {
      assertIanaTimeZone(input.timeZone);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const calendar = await tx.calendar.update({
        where: { id: bound.calendar.id },
        data: {
          name: input.name?.trim() ?? bound.calendar.name,
          description: input.description !== undefined ? input.description.trim() : bound.calendar.description,
          timeZone: input.timeZone?.trim() ?? bound.calendar.timeZone,
          version: bound.calendar.version + 1,
        },
      });
      await this.audit.insert(
        {
          organizationId: calendar.organizationId,
          actorUserId: session.userId,
          eventType: "CALENDAR_UPDATED",
          resourceType: "calendar",
          resourceId: calendar.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ version: calendar.version }),
        },
        tx,
      );
      return this.toCalendarDto(calendar, bound.actor, bound);
    });
    return updated;
  }

  async archive(
    session: RequestSession,
    calendarId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion: number; organizationId?: string },
  ) {
    const bound = await this.access.bind(session, calendarId, "archive");
    this.access.rejectClientOrganization(input, bound.actor.organizationId);
    const started = await this.idempotency.begin(bound.actor.organizationId, idempotencyKey, {
      calendarId,
      expectedVersion: input.expectedVersion,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    this.foundation.cas(bound.calendar, input.expectedVersion);
    const archived = await this.prisma.$transaction(async (tx) => {
      const calendar = await tx.calendar.update({
        where: { id: bound.calendar.id },
        data: {
          status: "ARCHIVED",
          archivedAt: new Date(),
          version: bound.calendar.version + 1,
        },
      });
      await this.audit.insert(
        {
          organizationId: calendar.organizationId,
          actorUserId: session.userId,
          eventType: "CALENDAR_ARCHIVED",
          resourceType: "calendar",
          resourceId: calendar.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ version: calendar.version }),
        },
        tx,
      );
      const body = this.toCalendarDto(calendar, bound.actor, bound);
      await this.idempotency.commit(bound.actor.organizationId, started.key, started.hash, 200, body, tx);
      return body;
    });
    return archived;
  }

  async listGrants(session: RequestSession, calendarId: string) {
    const bound = await this.access.bind(session, calendarId, "read");
    const teamIds = new Set(
      (await this.access.activeTeamMemberships(bound.actor.id))
        .filter((row) => !row.team.archivedAt)
        .map((row) => row.teamId),
    );
    const rows = bound.actorIsOwner
      ? bound.grantRows
      : bound.grantRows.filter((row) => this.grantVisibleToActor(bound, row, teamIds));
    return { items: rows.map((row) => this.toGrantDto(row)), ownerIntrinsic: true };
  }

  async createGrant(
    session: RequestSession,
    calendarId: string,
    idempotencyKey: string | undefined,
    input: {
      principalKind: string;
      organizationMembershipId?: string | null;
      teamId?: string | null;
      role: string;
      organizationId?: string;
    },
  ) {
    const bound = await this.access.bind(session, calendarId, "admin_grant");
    this.access.rejectClientOrganization(input, bound.actor.organizationId);
    const principalKind = this.parsePrincipalKind(input.principalKind);
    const role = this.parseRole(input.role);
    assertGrantPrincipalXor({
      principalKind,
      organizationMembershipId: input.organizationMembershipId,
      teamId: input.teamId,
    });
    await this.assertGrantTarget(bound, principalKind, input.organizationMembershipId, input.teamId);
    const started = await this.idempotency.begin(bound.actor.organizationId, idempotencyKey, {
      calendarId,
      principalKind,
      organizationMembershipId: input.organizationMembershipId ?? null,
      teamId: input.teamId ?? null,
      role,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const grant = await tx.calendarAccessGrant.create({
          data: {
            organizationId: bound.calendar.organizationId,
            calendarId: bound.calendar.id,
            principalKind,
            organizationMembershipId: principalKind === "USER" ? input.organizationMembershipId : null,
            teamId: principalKind === "TEAM" ? input.teamId : null,
            role,
            createdByOrganizationMembershipId: bound.actor.id,
          },
        });
        await this.audit.insert(
          {
            organizationId: grant.organizationId,
            actorUserId: session.userId,
            eventType: "CALENDAR_SHARED",
            resourceType: "calendar_access_grant",
            resourceId: grant.id,
            correlationId: currentCorrelationId(),
            payload: redactSecrets({
              calendarId: grant.calendarId,
              principalKind: grant.principalKind,
              role: grant.role,
              organizationMembershipId: grant.organizationMembershipId,
              teamId: grant.teamId,
            }),
          },
          tx,
        );
        await this.foundation.appendOutbox(
          OUTBOX_EVENT_TYPES.CalendarShared,
          { organizationId: grant.organizationId, calendarId: grant.calendarId, grantId: grant.id, role },
          currentCorrelationId(),
          tx,
        );
        const body = this.toGrantDto(grant);
        await this.idempotency.commit(bound.actor.organizationId, started.key, started.hash, 201, body, tx);
        return body;
      });
      return created;
    } catch (error) {
      this.rethrowDuplicateGrant(error);
    }
  }

  async changeGrantRole(
    session: RequestSession,
    calendarId: string,
    grantId: string,
    input: { role: string; organizationId?: string },
  ) {
    const bound = await this.access.bind(session, calendarId, "admin_grant");
    this.access.rejectClientOrganization(input, bound.actor.organizationId);
    const grant = this.requireGrant(bound, grantId);
    if (grant.revokedAt) {
      throw new CalendarStateError("Revoked grant cannot change role");
    }
    const role = this.parseRole(input.role);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.calendarAccessGrant.update({
        where: { id: grant.id },
        data: { role },
      });
      await this.audit.insert(
        {
          organizationId: row.organizationId,
          actorUserId: session.userId,
          eventType: "CALENDAR_GRANT_ROLE_CHANGED",
          resourceType: "calendar_access_grant",
          resourceId: row.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ calendarId: row.calendarId, from: grant.role, to: role }),
        },
        tx,
      );
      return this.toGrantDto(row);
    });
    return updated;
  }

  async revokeGrant(
    session: RequestSession,
    calendarId: string,
    grantId: string,
    idempotencyKey: string | undefined,
  ) {
    const bound = await this.access.bind(session, calendarId, "admin_grant");
    const grant = this.requireGrant(bound, grantId);
    const started = await this.idempotency.begin(bound.actor.organizationId, idempotencyKey, {
      calendarId,
      grantId,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    const revokedAt = grant.revokedAt ?? new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = grant.revokedAt
        ? grant
        : await tx.calendarAccessGrant.update({
            where: { id: grant.id },
            data: { revokedAt },
          });
      if (!grant.revokedAt) {
        await this.audit.insert(
          {
            organizationId: row.organizationId,
            actorUserId: session.userId,
            eventType: "CALENDAR_ACCESS_REVOKED",
            resourceType: "calendar_access_grant",
            resourceId: row.id,
            correlationId: currentCorrelationId(),
            payload: redactSecrets({
              calendarId: row.calendarId,
              principalKind: row.principalKind,
              role: row.role,
              organizationMembershipId: row.organizationMembershipId,
              teamId: row.teamId,
            }),
          },
          tx,
        );
        await this.foundation.appendOutbox(
          OUTBOX_EVENT_TYPES.CalendarAccessRevoked,
          { organizationId: row.organizationId, calendarId: row.calendarId, grantId: row.id },
          currentCorrelationId(),
          tx,
        );
      }
      const body = this.toGrantDto(row);
      await this.idempotency.commit(bound.actor.organizationId, started.key, started.hash, 200, body, tx);
      return body;
    });
    return updated;
  }

  async shareTargets(session: RequestSession, calendarId: string, query: { q?: string } = {}) {
    const bound = await this.access.bind(session, calendarId, "admin_grant");
    const q = query.q?.trim().toLowerCase() ?? "";
    const take = 20;
    if (bound.actor.type === "EXTERNAL") {
      return this.externalShareTargets(bound, q, take);
    }
    denyExternalOrgWideAccess(bound.actor.type, "org_directory");
    const [members, teams] = await Promise.all([
      this.prisma.organizationMembership.findMany({
        where: {
          organizationId: bound.actor.organizationId,
          status: "ACTIVE",
          id: { not: bound.calendar.ownerOrganizationMembershipId },
          ...(q
            ? {
                user: {
                  OR: [
                    { displayName: { contains: q, mode: "insensitive" } },
                    { email: { contains: q, mode: "insensitive" } },
                  ],
                },
              }
            : {}),
        },
        include: { user: true },
        orderBy: { createdAt: "asc" },
        take,
      }),
      this.prisma.team.findMany({
        where: {
          organizationId: bound.actor.organizationId,
          archivedAt: null,
          ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take,
      }),
    ]);
    return {
      items: [
        ...members.map((row) => ({
          principalKind: "USER" as const,
          organizationMembershipId: row.id,
          teamId: null,
          displayName: row.user.displayName,
          email: row.user.email,
        })),
        ...teams.map((row) => ({
          principalKind: "TEAM" as const,
          organizationMembershipId: null,
          teamId: row.id,
          displayName: row.name,
          email: null,
        })),
      ],
    };
  }

  private async externalShareTargets(bound: BoundCalendar, q: string, take: number) {
    const teamMemberships = await this.access.activeTeamMemberships(bound.actor.id);
    const eligibleTeams = teamMemberships.filter((row) => !row.team.archivedAt).map((row) => row.team);
    const projectMemberships = await this.prisma.projectMembership.findMany({
      where: { organizationMembershipId: bound.actor.id, status: "ACTIVE" },
      select: { projectId: true },
    });
    const projectIds = projectMemberships.map((row) => row.projectId);
    const peerMemberships =
      projectIds.length === 0
        ? []
        : await this.prisma.projectMembership.findMany({
            where: {
              projectId: { in: projectIds },
              status: "ACTIVE",
              organizationMembership: {
                organizationId: bound.actor.organizationId,
                status: "ACTIVE",
                id: { not: bound.calendar.ownerOrganizationMembershipId },
              },
            },
            include: { organizationMembership: { include: { user: true } } },
          });
    const users = new Map<
      string,
      { id: string; displayName: string; email: string }
    >();
    for (const row of peerMemberships) {
      const membership = row.organizationMembership;
      if (!users.has(membership.id) && membership.id !== bound.actor.id) {
        users.set(membership.id, {
          id: membership.id,
          displayName: membership.user.displayName,
          email: membership.user.email,
        });
      }
    }
    const filteredUsers = [...users.values()].filter((row) => {
      if (!q) {
        return true;
      }
      return row.displayName.toLowerCase().includes(q) || row.email.toLowerCase().includes(q);
    });
    const filteredTeams = eligibleTeams.filter((row) => !q || row.name.toLowerCase().includes(q));
    return {
      items: [
        ...filteredUsers.slice(0, take).map((row) => ({
          principalKind: "USER" as const,
          organizationMembershipId: row.id,
          teamId: null,
          displayName: row.displayName,
          email: row.email,
        })),
        ...filteredTeams.slice(0, take).map((row) => ({
          principalKind: "TEAM" as const,
          organizationMembershipId: null,
          teamId: row.id,
          displayName: row.name,
          email: null,
        })),
      ],
    };
  }

  private async assertGrantTarget(
    bound: BoundCalendar,
    principalKind: CalendarGrantPrincipalKind,
    organizationMembershipId?: string | null,
    teamId?: string | null,
  ): Promise<void> {
    if (principalKind === "USER") {
      if (!organizationMembershipId || !UUID_RE.test(organizationMembershipId)) {
        throw new CalendarStateError("Grant target principal is not an active same-Organization member");
      }
      if (organizationMembershipId === bound.calendar.ownerOrganizationMembershipId) {
        throw new CalendarStateError("Owner access is intrinsic and cannot be granted");
      }
      const target = await this.prisma.organizationMembership.findUnique({
        where: { id: organizationMembershipId },
      });
      if (!target || target.organizationId !== bound.actor.organizationId || target.status !== "ACTIVE") {
        throw new CalendarStateError("Grant target principal is not an active same-Organization member");
      }
      return;
    }
    if (!teamId || !UUID_RE.test(teamId)) {
      throw new CalendarStateError("Grant target Team is not an active same-Organization Team");
    }
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.organizationId !== bound.actor.organizationId || team.archivedAt) {
      throw new CalendarStateError("Grant target Team is not an active same-Organization Team");
    }
  }

  private requireGrant(bound: BoundCalendar, grantId: string) {
    if (!UUID_RE.test(grantId)) {
      throw new DenyByDefaultError("Calendar grant is not available to the authenticated principal");
    }
    const grant = bound.grantRows.find((row) => row.id === grantId);
    if (!grant || grant.calendarId !== bound.calendar.id) {
      throw new DenyByDefaultError("Calendar grant is not available to the authenticated principal");
    }
    return grant;
  }

  private grantVisibleToActor(
    bound: BoundCalendar,
    grant: BoundCalendar["grantRows"][number],
    actorTeamIds: Set<string>,
  ): boolean {
    if (grant.principalKind === "USER") {
      return grant.organizationMembershipId === bound.actor.id;
    }
    return Boolean(grant.teamId && actorTeamIds.has(grant.teamId) && !grant.revokedAt);
  }

  private parsePrincipalKind(value: string): CalendarGrantPrincipalKind {
    if (value === "USER" || value === "TEAM") {
      return value;
    }
    throw new CalendarStateError("Grant principalKind must be USER or TEAM");
  }

  private parseRole(value: string): CalendarGrantRole {
    if (value === "VIEWER" || value === "EDITOR") {
      return value;
    }
    throw new CalendarStateError("Grant role must be VIEWER or EDITOR");
  }

  private rethrowDuplicateGrant(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CalendarStateError("Duplicate active grant for this principal");
    }
    throw error;
  }

  toCalendarDto(
    calendar: {
      id: string;
      organizationId: string;
      ownerOrganizationMembershipId: string;
      name: string;
      description: string;
      timeZone: string;
      status: string;
      archivedAt: Date | null;
      version: number;
      createdAt: Date;
      updatedAt: Date;
    },
    actor: ActorMembership,
    bound: { actorIsOwner: boolean; grantPaths: BoundCalendar["grantPaths"] },
  ) {
    const effective = bound.actorIsOwner && actor.status === "ACTIVE" ? "OWNER" : bound.grantPaths.length
      ? (bound.grantPaths.some((path) => path.active && !path.revoked && !path.archivedTeam && path.role === "EDITOR")
          ? "EDITOR"
          : "VIEWER")
      : null;
    return {
      id: calendar.id,
      organizationId: calendar.organizationId,
      ownerOrganizationMembershipId: calendar.ownerOrganizationMembershipId,
      name: calendar.name,
      description: calendar.description,
      timeZone: calendar.timeZone,
      status: calendar.status,
      archivedAt: calendar.archivedAt,
      version: calendar.version,
      createdAt: calendar.createdAt,
      updatedAt: calendar.updatedAt,
      effectiveRole: effective,
      accessPaths: bound.grantPaths
        .filter((path) => path.active && !path.revoked && !path.archivedTeam)
        .map((path) => ({ kind: path.kind, role: path.role })),
    };
  }

  toGrantDto(row: {
    id: string;
    organizationId: string;
    calendarId: string;
    principalKind: string;
    organizationMembershipId: string | null;
    teamId: string | null;
    role: string;
    revokedAt: Date | null;
    createdByOrganizationMembershipId: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      calendarId: row.calendarId,
      principalKind: row.principalKind,
      organizationMembershipId: row.organizationMembershipId,
      teamId: row.teamId,
      role: row.role,
      revokedAt: row.revokedAt,
      createdByOrganizationMembershipId: row.createdByOrganizationMembershipId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
