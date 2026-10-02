import { Injectable } from "@nestjs/common";
import {
  CalendarStateError,
  dedupeScheduleItemsBySourceIdentity,
  formatAllDayDate,
  myScheduleIncludesSource,
  type MyScheduleSourceKind,
} from "@amber/shared";
import type { RequestSession } from "../auth/session.types";
import { PrismaService } from "../prisma/prisma.service";
import { CalendarAccess } from "./calendar.access";
import { EventsService } from "./events.service";

@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CalendarAccess,
    private readonly events: EventsService,
  ) {}

  async get(
    session: RequestSession,
    query: {
      from?: string;
      to?: string;
      cursor?: string;
      limit?: string;
      includeOwned?: string;
      includeDirect?: string;
      includeTeam?: string;
      includeProjectDates?: string;
    },
  ) {
    const actor = await this.access.requireActor(session);
    if (actor.status !== "ACTIVE") {
      throw new CalendarStateError("ACTIVE Organization Membership is required");
    }
    const window = this.parseWindow(query.from, query.to);
    const limit = this.parseLimit(query.limit);
    const toggles = {
      OWNED_CALENDAR: this.flag(query.includeOwned, true),
      DIRECT_GRANT: this.flag(query.includeDirect, true),
      TEAM_GRANT: this.flag(query.includeTeam, true),
      AUTHORIZED_PROJECT_DATE: this.flag(query.includeProjectDates, true),
    };
    const calendarIds = await this.access.authorizedCalendarIds(actor);
    const rows =
      calendarIds.length === 0
        ? []
        : await this.prisma.calendar.findMany({
            where: { id: { in: calendarIds }, organizationId: actor.organizationId },
            include: { owner: true, grants: { include: { subjectTeam: true } }, events: true },
          });
    const items: Array<{
      sourceKind: MyScheduleSourceKind;
      sourceIdentity: string;
      calendarId: string | null;
      title: string;
      allDay: boolean;
      startsAt: Date | null;
      endsAt: Date | null;
      timeZone: string | null;
      allDayStartDate: string | null;
      allDayEndDate: string | null;
      linkedProjectId: string | null;
      referenceType: string | null;
      referenceId: string | null;
    }> = [];

    for (const calendar of rows) {
      const grantPaths = await this.access.pathsForActor(actor, calendar.grants);
      const actorIsOwner = actor.id === calendar.ownerOrganizationMembershipId;
      const sourceKind: MyScheduleSourceKind = actorIsOwner
        ? "OWNED_CALENDAR"
        : grantPaths.some((path) => path.kind === "USER" && path.active && !path.revoked)
          ? "DIRECT_GRANT"
          : "TEAM_GRANT";
      if (
        !myScheduleIncludesSource({
          sourceKind,
          calendarAuthorized: true,
          projectAuthorized: false,
          sourceToggleEnabled: toggles[sourceKind],
        })
      ) {
        continue;
      }
      const bound = {
        calendar,
        actor,
        owner: calendar.owner,
        grantRows: calendar.grants,
        grantPaths,
        effectiveRole: null,
        actorIsOwner,
      };
      for (const event of calendar.events) {
        const dto = await this.events.projectEvent(session, bound, event);
        if (!dto) {
          continue;
        }
        if (!this.inWindow(dto, window)) {
          continue;
        }
        items.push({
          sourceKind,
          sourceIdentity:
            dto.kind === "REFERENCED" && dto.referenceType && dto.referenceId
              ? `${dto.referenceType}:${dto.referenceId}`
              : `manual:${dto.id}`,
          calendarId: calendar.id,
          title: dto.title,
          allDay: dto.allDay,
          startsAt: dto.startsAt,
          endsAt: dto.endsAt,
          timeZone: dto.timeZone,
          allDayStartDate: dto.allDayStartDate,
          allDayEndDate: dto.allDayEndDate,
          linkedProjectId: dto.linkedProjectId,
          referenceType: dto.referenceType,
          referenceId: dto.referenceId,
        });
      }
    }

    if (
      myScheduleIncludesSource({
        sourceKind: "AUTHORIZED_PROJECT_DATE",
        calendarAuthorized: false,
        projectAuthorized: true,
        sourceToggleEnabled: toggles.AUTHORIZED_PROJECT_DATE,
      })
    ) {
      items.push(...(await this.projectDates(session, actor.organizationId, actor.id, window)));
    }

    const deduped = dedupeScheduleItemsBySourceIdentity(items);
    return this.events.paginate(deduped, query.cursor, limit);
  }

  private async projectDates(
    session: RequestSession,
    organizationId: string,
    actorMembershipId: string,
    window: { from: Date; to: Date },
  ) {
    const memberships = await this.prisma.projectMembership.findMany({
      where: { organizationMembershipId: actorMembershipId, status: "ACTIVE" },
      select: { projectId: true },
    });
    const items: Array<{
      sourceKind: MyScheduleSourceKind;
      sourceIdentity: string;
      calendarId: string | null;
      title: string;
      allDay: boolean;
      startsAt: Date | null;
      endsAt: Date | null;
      timeZone: string | null;
      allDayStartDate: string | null;
      allDayEndDate: string | null;
      linkedProjectId: string | null;
      referenceType: string | null;
      referenceId: string | null;
    }> = [];
    for (const membership of memberships) {
      if (!(await this.access.hasProjectRead(session, membership.projectId))) {
        continue;
      }
      const [tasks, milestones] = await Promise.all([
        this.prisma.task.findMany({
          where: { organizationId, projectId: membership.projectId, status: { not: "CANCELLED" } },
        }),
        this.prisma.milestone.findMany({
          where: { organizationId, projectId: membership.projectId, status: { not: "CANCELLED" } },
        }),
      ]);
      for (const task of tasks) {
        const startsAt = task.plannedStartAt ?? task.dueDate;
        const endsAt = task.dueDate ?? task.plannedStartAt ?? startsAt;
        if (!startsAt || !endsAt || !this.instantInWindow(startsAt, endsAt, window)) {
          continue;
        }
        items.push({
          sourceKind: "AUTHORIZED_PROJECT_DATE",
          sourceIdentity: `TASK:${task.id}`,
          calendarId: null,
          title: task.title,
          allDay: false,
          startsAt,
          endsAt,
          timeZone: "UTC",
          allDayStartDate: null,
          allDayEndDate: null,
          linkedProjectId: task.projectId,
          referenceType: "TASK",
          referenceId: task.id,
        });
      }
      for (const milestone of milestones) {
        if (!milestone.targetDate || !this.instantInWindow(milestone.targetDate, milestone.targetDate, window)) {
          continue;
        }
        items.push({
          sourceKind: "AUTHORIZED_PROJECT_DATE",
          sourceIdentity: `MILESTONE:${milestone.id}`,
          calendarId: null,
          title: milestone.title,
          allDay: false,
          startsAt: milestone.targetDate,
          endsAt: milestone.targetDate,
          timeZone: "UTC",
          allDayStartDate: null,
          allDayEndDate: null,
          linkedProjectId: milestone.projectId,
          referenceType: "MILESTONE",
          referenceId: milestone.id,
        });
      }
    }
    return items;
  }

  private parseWindow(from?: string, to?: string): { from: Date; to: Date } {
    const now = Date.now();
    const start = from ? new Date(from) : new Date(now - 31 * 24 * 3600_000);
    const end = to ? new Date(to) : new Date(now + 400 * 24 * 3600_000);
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

  private flag(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) {
      return fallback;
    }
    return value !== "false" && value !== "0";
  }

  private inWindow(
    item: {
      allDay: boolean;
      startsAt: Date | null;
      endsAt: Date | null;
      allDayStartDate: string | null;
      allDayEndDate: string | null;
    },
    window: { from: Date; to: Date },
  ): boolean {
    if (item.allDay) {
      const start = item.allDayStartDate ?? "";
      const end = item.allDayEndDate ?? start;
      return Boolean(start) && end >= formatAllDayDate(window.from) && start <= formatAllDayDate(window.to);
    }
    if (!item.startsAt) {
      return false;
    }
    return this.instantInWindow(item.startsAt, item.endsAt ?? item.startsAt, window);
  }

  private instantInWindow(start: Date, end: Date, window: { from: Date; to: Date }): boolean {
    return end.getTime() >= window.from.getTime() && start.getTime() <= window.to.getTime();
  }
}
