import { Injectable } from "@nestjs/common";
import {
  CalendarStateError,
  OUTBOX_EVENT_TYPES,
  assertEventTimeBounds,
  calendarEditsMutateSourceLifecycle,
  formatAllDayDate,
  projectReferencedEvent,
  redactSecrets,
  resolveLocalWallTime,
  type CalendarEventKind,
  type CalendarReferenceType,
} from "@amber/shared";
import { AuditService } from "../audit/audit.service";
import type { RequestSession } from "../auth/session.types";
import { FoundationService } from "../foundation/foundation.service";
import { IdempotencyService } from "../foundation/idempotency.service";
import { currentCorrelationId } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { CalendarAccess, UUID_RE, type BoundCalendar } from "./calendar.access";

export interface EventWriteInput {
  kind?: string;
  title?: string;
  description?: string;
  allDay?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  timeZone?: string | null;
  allDayStartDate?: string | null;
  allDayEndDate?: string | null;
  localStartsAt?: string | null;
  localEndsAt?: string | null;
  chosenOffset?: string | null;
  linkedProjectId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  organizationId?: string;
  expectedVersion?: number;
}

interface ProjectedSource {
  exists: boolean;
  deletedOrArchived: boolean;
  authorized: boolean;
  liveTitle?: string;
  projectId?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CalendarAccess,
    private readonly audit: AuditService,
    private readonly foundation: FoundationService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(
    session: RequestSession,
    calendarId: string,
    query: { from?: string; to?: string; cursor?: string; limit?: string } = {},
  ) {
    const bound = await this.access.bind(session, calendarId, "read");
    const window = this.parseWindow(query.from, query.to);
    const limit = this.parseLimit(query.limit);
    const rows = await this.prisma.calendarEvent.findMany({
      where: {
        calendarId: bound.calendar.id,
        organizationId: bound.actor.organizationId,
        archivedAt: null,
      },
      orderBy: [{ startsAt: "asc" }, { allDayStartDate: "asc" }, { id: "asc" }],
    });
    const projected = [];
    for (const row of rows) {
      const dto = await this.projectEvent(session, bound, row);
      if (!dto) {
        continue;
      }
      if (!this.inWindow(dto, window)) {
        continue;
      }
      projected.push(dto);
    }
    return this.paginate(projected, query.cursor, limit);
  }

  async create(
    session: RequestSession,
    calendarId: string,
    idempotencyKey: string | undefined,
    input: EventWriteInput,
  ) {
    const bound = await this.access.bind(session, calendarId, "mutate_manual_event");
    this.access.rejectClientOrganization(input, bound.actor.organizationId);
    const kind = this.parseKind(input.kind ?? "MANUAL");
    const times = this.resolveTimes(input);
    const title = (input.title ?? "").trim();
    if (!title) {
      throw new CalendarStateError("Event title is required");
    }
    const reference = await this.resolveReference(session, bound, kind, input);
    const started = await this.idempotency.begin(bound.actor.organizationId, idempotencyKey, {
      calendarId,
      kind,
      title,
      allDay: times.allDay,
      startsAt: times.startsAt?.toISOString() ?? null,
      endsAt: times.endsAt?.toISOString() ?? null,
      timeZone: times.timeZone,
      allDayStartDate: times.allDayStartDate,
      allDayEndDate: times.allDayEndDate,
      referenceType: reference.referenceType,
      referenceId: reference.referenceId,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    if (calendarEditsMutateSourceLifecycle()) {
      throw new CalendarStateError("Calendar edits must not mutate source lifecycle");
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const event = await tx.calendarEvent.create({
        data: {
          organizationId: bound.calendar.organizationId,
          calendarId: bound.calendar.id,
          kind,
          title,
          description: input.description?.trim() ?? "",
          allDay: times.allDay,
          startsAt: times.startsAt,
          endsAt: times.endsAt,
          timeZone: times.timeZone,
          allDayStartDate: times.allDayStartDate ? new Date(`${times.allDayStartDate}T00:00:00.000Z`) : null,
          allDayEndDate: times.allDayEndDate ? new Date(`${times.allDayEndDate}T00:00:00.000Z`) : null,
          linkedProjectId: reference.linkedProjectId,
          referenceType: reference.referenceType,
          referenceId: reference.referenceId,
          createdByOrganizationMembershipId: bound.actor.id,
        },
      });
      await this.audit.insert(
        {
          organizationId: event.organizationId,
          actorUserId: session.userId,
          eventType: "CALENDAR_EVENT_CREATED",
          resourceType: "calendar_event",
          resourceId: event.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            calendarId: event.calendarId,
            kind: event.kind,
            allDay: event.allDay,
            referenceType: event.referenceType,
            referenceId: event.referenceId,
          }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.CalendarEventCreated,
        { organizationId: event.organizationId, calendarId: event.calendarId, eventId: event.id, kind },
        currentCorrelationId(),
        tx,
      );
      const body = await this.projectEvent(session, bound, event);
      await this.idempotency.commit(bound.actor.organizationId, started.key, started.hash, 201, body, tx);
      return body;
    });
    return created;
  }

  async update(
    session: RequestSession,
    calendarId: string,
    eventId: string,
    input: EventWriteInput,
  ) {
    const bound = await this.access.bind(session, calendarId, "mutate_manual_event");
    this.access.rejectClientOrganization(input, bound.actor.organizationId);
    const event = await this.requireEvent(bound, eventId);
    if (event.kind !== "MANUAL") {
      throw new CalendarStateError("Referenced events cannot be mutated as source objects");
    }
    if (input.expectedVersion === undefined) {
      throw new CalendarStateError("expectedVersion is required");
    }
    this.foundation.cas(event, input.expectedVersion);
    const times = this.resolveTimes({
      allDay: input.allDay ?? event.allDay,
      startsAt: input.startsAt === undefined ? event.startsAt?.toISOString() : input.startsAt,
      endsAt: input.endsAt === undefined ? event.endsAt?.toISOString() : input.endsAt,
      timeZone: input.timeZone === undefined ? event.timeZone : input.timeZone,
      allDayStartDate:
        input.allDayStartDate === undefined
          ? event.allDayStartDate
            ? formatAllDayDate(event.allDayStartDate)
            : null
          : input.allDayStartDate,
      allDayEndDate:
        input.allDayEndDate === undefined
          ? event.allDayEndDate
            ? formatAllDayDate(event.allDayEndDate)
            : null
          : input.allDayEndDate,
      localStartsAt: input.localStartsAt,
      localEndsAt: input.localEndsAt,
      chosenOffset: input.chosenOffset,
    });
    const title = input.title !== undefined ? input.title.trim() : event.title;
    if (!title) {
      throw new CalendarStateError("Event title is required");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.calendarEvent.update({
        where: { id: event.id },
        data: {
          title,
          description: input.description !== undefined ? input.description.trim() : event.description,
          allDay: times.allDay,
          startsAt: times.startsAt,
          endsAt: times.endsAt,
          timeZone: times.timeZone,
          allDayStartDate: times.allDayStartDate ? new Date(`${times.allDayStartDate}T00:00:00.000Z`) : null,
          allDayEndDate: times.allDayEndDate ? new Date(`${times.allDayEndDate}T00:00:00.000Z`) : null,
          version: event.version + 1,
        },
      });
      await this.audit.insert(
        {
          organizationId: row.organizationId,
          actorUserId: session.userId,
          eventType: "CALENDAR_EVENT_UPDATED",
          resourceType: "calendar_event",
          resourceId: row.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ calendarId: row.calendarId, kind: row.kind, version: row.version }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.CalendarEventUpdated,
        { organizationId: row.organizationId, calendarId: row.calendarId, eventId: row.id },
        currentCorrelationId(),
        tx,
      );
      return this.projectEvent(session, bound, row);
    });
    return updated;
  }

  async remove(
    session: RequestSession,
    calendarId: string,
    eventId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion: number; organizationId?: string },
  ) {
    const bound = await this.access.bind(session, calendarId, "mutate_manual_event");
    this.access.rejectClientOrganization(input, bound.actor.organizationId);
    const event = await this.requireEvent(bound, eventId);
    if (event.kind !== "MANUAL" && !bound.actorIsOwner) {
      throw new CalendarStateError("EDITOR may delete only manual events");
    }
    const started = await this.idempotency.begin(bound.actor.organizationId, idempotencyKey, {
      calendarId,
      eventId,
      expectedVersion: input.expectedVersion,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    this.foundation.cas(event, input.expectedVersion);
    if (calendarEditsMutateSourceLifecycle()) {
      throw new CalendarStateError("Calendar edits must not mutate source lifecycle");
    }
    const deleted = await this.prisma.$transaction(async (tx) => {
      const row = await tx.calendarEvent.update({
        where: { id: event.id },
        data: { archivedAt: new Date(), version: event.version + 1 },
      });
      await this.audit.insert(
        {
          organizationId: row.organizationId,
          actorUserId: session.userId,
          eventType: "CALENDAR_EVENT_DELETED",
          resourceType: "calendar_event",
          resourceId: row.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            calendarId: row.calendarId,
            kind: row.kind,
            referenceType: row.referenceType,
            referenceId: row.referenceId,
          }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.CalendarEventDeleted,
        { organizationId: row.organizationId, calendarId: row.calendarId, eventId: row.id },
        currentCorrelationId(),
        tx,
      );
      const body = { id: row.id, archivedAt: row.archivedAt, version: row.version };
      await this.idempotency.commit(bound.actor.organizationId, started.key, started.hash, 200, body, tx);
      return body;
    });
    return deleted;
  }

  async projectEvent(
    session: RequestSession,
    bound: BoundCalendar,
    event: {
      id: string;
      organizationId: string;
      calendarId: string;
      kind: string;
      title: string;
      description: string;
      allDay: boolean;
      startsAt: Date | null;
      endsAt: Date | null;
      timeZone: string | null;
      allDayStartDate: Date | null;
      allDayEndDate: Date | null;
      linkedProjectId: string | null;
      referenceType: string | null;
      referenceId: string | null;
      createdByOrganizationMembershipId: string;
      version: number;
      archivedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    },
  ) {
    if (event.archivedAt) {
      return null;
    }
    let title = event.title;
    let description = event.description;
    if (event.kind === "REFERENCED" && event.referenceType && event.referenceId) {
      const source = await this.loadSource(
        session,
        bound.actor.organizationId,
        event.referenceType as CalendarReferenceType,
        event.referenceId,
      );
      const projected = projectReferencedEvent({
        hasCalendarAccess: true,
        sourceExists: source.exists,
        sourceDeletedOrArchived: source.deletedOrArchived,
        sourceAuthorized: source.authorized,
        persistedSnapshotTitle: event.title,
        liveSourceTitle: source.liveTitle,
      });
      if (projected.omit) {
        return null;
      }
      title = projected.title ?? source.liveTitle ?? event.title;
      description = "";
    }
    return {
      id: event.id,
      organizationId: event.organizationId,
      calendarId: event.calendarId,
      kind: event.kind,
      title,
      description,
      allDay: event.allDay,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timeZone: event.timeZone,
      allDayStartDate: event.allDayStartDate ? formatAllDayDate(event.allDayStartDate) : null,
      allDayEndDate: event.allDayEndDate ? formatAllDayDate(event.allDayEndDate) : null,
      linkedProjectId: event.linkedProjectId,
      referenceType: event.referenceType,
      referenceId: event.referenceId,
      createdByOrganizationMembershipId: event.createdByOrganizationMembershipId,
      version: event.version,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }

  private async requireEvent(bound: BoundCalendar, eventId: string) {
    if (!UUID_RE.test(eventId)) {
      this.access.denyInaccessible();
    }
    const event = await this.prisma.calendarEvent.findUnique({ where: { id: eventId } });
    if (
      !event ||
      event.calendarId !== bound.calendar.id ||
      event.organizationId !== bound.actor.organizationId ||
      event.archivedAt
    ) {
      this.access.denyInaccessible();
    }
    return event;
  }

  private resolveTimes(input: EventWriteInput) {
    const allDay = Boolean(input.allDay);
    let startsAt = input.startsAt ? new Date(input.startsAt) : null;
    let endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (!allDay && input.localStartsAt) {
      startsAt = resolveLocalWallTime({
        localDateTime: input.localStartsAt,
        timeZone: input.timeZone ?? "",
        chosenOffset: input.chosenOffset,
      }).instant;
    }
    if (!allDay && input.localEndsAt) {
      endsAt = resolveLocalWallTime({
        localDateTime: input.localEndsAt,
        timeZone: input.timeZone ?? "",
        chosenOffset: input.chosenOffset,
      }).instant;
    }
    if (!allDay && startsAt && Number.isNaN(startsAt.getTime())) {
      throw new CalendarStateError("Invalid event instant");
    }
    if (!allDay && endsAt && Number.isNaN(endsAt.getTime())) {
      throw new CalendarStateError("Invalid event instant");
    }
    const times = {
      allDay,
      startsAt: allDay ? null : startsAt,
      endsAt: allDay ? null : endsAt,
      timeZone: allDay ? null : input.timeZone?.trim() ?? null,
      allDayStartDate: allDay ? input.allDayStartDate ?? null : null,
      allDayEndDate: allDay ? input.allDayEndDate ?? null : null,
    };
    assertEventTimeBounds(times);
    return times;
  }

  private parseKind(value: string): CalendarEventKind {
    if (value === "MANUAL" || value === "REFERENCED") {
      return value;
    }
    throw new CalendarStateError("Event kind must be MANUAL or REFERENCED");
  }

  private async resolveReference(
    session: RequestSession,
    bound: BoundCalendar,
    kind: CalendarEventKind,
    input: EventWriteInput,
  ) {
    if (kind === "MANUAL") {
      if (input.referenceType || input.referenceId) {
        throw new CalendarStateError("Manual events must not reference Planning sources");
      }
      return {
        linkedProjectId: await this.optionalSameOrgProject(bound.actor.organizationId, input.linkedProjectId),
        referenceType: null,
        referenceId: null,
      };
    }
    const referenceType = this.parseReferenceType(input.referenceType);
    if (!input.referenceId || !UUID_RE.test(input.referenceId)) {
      throw new CalendarStateError("Referenced events require referenceType and referenceId");
    }
    const source = await this.loadSource(session, bound.actor.organizationId, referenceType, input.referenceId);
    if (!source.exists) {
      throw new CalendarStateError("Referenced source not found");
    }
    const linkedProjectId =
      (await this.optionalSameOrgProject(bound.actor.organizationId, input.linkedProjectId)) ??
      source.projectId ??
      null;
    return { linkedProjectId, referenceType, referenceId: input.referenceId };
  }

  private parseReferenceType(value?: string | null): CalendarReferenceType {
    if (value === "TASK" || value === "MILESTONE" || value === "DELIVERABLE" || value === "GATE") {
      return value;
    }
    throw new CalendarStateError("referenceType must be TASK, MILESTONE, DELIVERABLE, or GATE");
  }

  private async optionalSameOrgProject(organizationId: string, projectId?: string | null) {
    if (!projectId) {
      return null;
    }
    if (!UUID_RE.test(projectId)) {
      throw new CalendarStateError("linkedProjectId is not a valid Project");
    }
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.organizationId !== organizationId) {
      throw new CalendarStateError("linkedProjectId is not a valid Project");
    }
    return project.id;
  }

  async loadSource(
    session: RequestSession,
    organizationId: string,
    type: CalendarReferenceType,
    id: string,
  ): Promise<ProjectedSource> {
    if (!UUID_RE.test(id)) {
      return { exists: false, deletedOrArchived: false, authorized: false };
    }
    if (type === "TASK") {
      const row = await this.prisma.task.findUnique({ where: { id } });
      if (!row || row.organizationId !== organizationId) {
        return { exists: false, deletedOrArchived: false, authorized: false };
      }
      return {
        exists: true,
        deletedOrArchived: row.status === "CANCELLED",
        authorized: await this.access.hasProjectRead(session, row.projectId),
        liveTitle: row.title,
        projectId: row.projectId,
        startsAt: row.plannedStartAt,
        endsAt: row.dueDate,
      };
    }
    if (type === "MILESTONE") {
      const row = await this.prisma.milestone.findUnique({ where: { id } });
      if (!row || row.organizationId !== organizationId) {
        return { exists: false, deletedOrArchived: false, authorized: false };
      }
      return {
        exists: true,
        deletedOrArchived: row.status === "CANCELLED",
        authorized: await this.access.hasProjectRead(session, row.projectId),
        liveTitle: row.title,
        projectId: row.projectId,
        startsAt: row.targetDate,
        endsAt: row.targetDate,
      };
    }
    if (type === "DELIVERABLE") {
      const row = await this.prisma.deliverable.findUnique({ where: { id } });
      if (!row || row.organizationId !== organizationId) {
        return { exists: false, deletedOrArchived: false, authorized: false };
      }
      return {
        exists: true,
        deletedOrArchived: Boolean(row.archivedAt) || row.status === "CANCELLED",
        authorized: await this.access.hasProjectRead(session, row.projectId),
        liveTitle: row.title,
        projectId: row.projectId,
      };
    }
    const row = await this.prisma.gate.findUnique({ where: { id } });
    if (!row || row.organizationId !== organizationId) {
      return { exists: false, deletedOrArchived: false, authorized: false };
    }
    return {
      exists: true,
      deletedOrArchived: false,
      authorized: await this.access.hasProjectRead(session, row.projectId),
      liveTitle: row.name,
      projectId: row.projectId,
    };
  }

  private parseWindow(from?: string, to?: string): { from: Date; to: Date } {
    const now = Date.now();
    const start = from ? new Date(from) : new Date(now - 31 * 24 * 3600_000);
    const end = to ? new Date(to) : new Date(now + 31 * 24 * 3600_000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw new CalendarStateError("Schedule window from/to is invalid");
    }
    return { from: start, to: end };
  }

  private parseLimit(value?: string): number {
    const parsed = Number.parseInt(value ?? "50", 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return 50;
    }
    return Math.min(parsed, 100);
  }

  private inWindow(
    item: { allDay: boolean; startsAt: Date | null; endsAt: Date | null; allDayStartDate: string | null; allDayEndDate: string | null },
    window: { from: Date; to: Date },
  ): boolean {
    if (item.allDay) {
      const start = item.allDayStartDate ?? "";
      const end = item.allDayEndDate ?? start;
      const from = formatAllDayDate(window.from);
      const to = formatAllDayDate(window.to);
      return Boolean(start) && end >= from && start <= to;
    }
    const start = item.startsAt?.getTime();
    if (start === undefined) {
      return false;
    }
    const end = item.endsAt?.getTime() ?? start;
    return end >= window.from.getTime() && start <= window.to.getTime();
  }

  paginate<T extends { id?: string; sourceIdentity?: string; startsAt?: Date | null; allDayStartDate?: string | null }>(
    items: T[],
    cursor: string | undefined,
    limit: number,
  ): { items: T[]; nextCursor: string | null } {
    const identity = (item: T): string => item.id ?? item.sourceIdentity ?? "";
    const sorted = [...items].sort((a, b) => {
      const left = this.sortKey(a);
      const right = this.sortKey(b);
      return left < right ? -1 : left > right ? 1 : identity(a).localeCompare(identity(b));
    });
    let start = 0;
    if (cursor) {
      const decoded = this.decodeCursor(cursor);
      start = sorted.findIndex((item) => {
        const key = this.sortKey(item);
        return key > decoded.t || (key === decoded.t && identity(item) > decoded.id);
      });
      if (start < 0) {
        start = sorted.length;
      }
    }
    const page = sorted.slice(start, start + limit);
    const last = page.at(-1);
    return {
      items: page,
      nextCursor: page.length === limit && last ? this.encodeCursor(this.sortKey(last), identity(last)) : null,
    };
  }

  sortKey(item: { startsAt?: Date | null; allDayStartDate?: string | null }): string {
    if (item.startsAt) {
      return item.startsAt.toISOString();
    }
    return `${item.allDayStartDate ?? "9999-12-31"}T00:00:00.000Z`;
  }

  encodeCursor(t: string, id: string): string {
    return Buffer.from(JSON.stringify({ t, id }), "utf8").toString("base64url");
  }

  decodeCursor(cursor: string): { t: string; id: string } {
    try {
      const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { t?: string; id?: string };
      if (!parsed.t || !parsed.id) {
        throw new Error("bad");
      }
      return { t: parsed.t, id: parsed.id };
    } catch {
      throw new CalendarStateError("Invalid cursor");
    }
  }
}
