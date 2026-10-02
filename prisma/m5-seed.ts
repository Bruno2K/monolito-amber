import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  M3_SEED_ORGANIZATIONS,
  M5_SEED_CALENDARS,
  M5_SEED_EVENTS,
  M5_SEED_GRANTS,
} from "../packages/shared/src/index.ts";

function seedUuid(namespace: string, key: string): string {
  const digest = createHash("sha256").update(`${namespace}${key}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(
    20,
    32,
  )}`;
}

function m3Id(key: string): string {
  return seedUuid("amber.m3.seed.", key);
}

function m5Id(key: string): string {
  return seedUuid("amber.m5.seed.", key);
}

export async function seedM5CalendarDataset(prisma: PrismaClient): Promise<void> {
  const calendarIds = new Map<string, string>();

  for (const calendar of M5_SEED_CALENDARS) {
    const organization = M3_SEED_ORGANIZATIONS.find((row) => row.key === calendar.orgKey);
    if (!organization) {
      throw new Error(`M5 seed missing org ${calendar.orgKey}`);
    }
    const organizationId = m3Id(`org:${calendar.orgKey}`);
    const ownerOrganizationMembershipId = m3Id(`orgmem:${calendar.orgKey}:${calendar.ownerUserKey}`);
    const id = m5Id(`cal:${calendar.key}`);
    const existing = await prisma.calendar.findUnique({ where: { id } });
    const row =
      existing ??
      (await prisma.calendar.create({
        data: {
          id,
          organizationId,
          ownerOrganizationMembershipId,
          name: calendar.name,
          description: "",
          timeZone: calendar.timeZone,
          status: calendar.status,
          archivedAt: calendar.status === "ARCHIVED" ? new Date("2026-10-01T00:00:00.000Z") : null,
        },
      }));
    if (existing && (existing.name !== calendar.name || existing.timeZone !== calendar.timeZone)) {
      await prisma.calendar.update({
        where: { id },
        data: { name: calendar.name, timeZone: calendar.timeZone },
      });
    }
    calendarIds.set(calendar.key, row.id);
  }

  for (const grant of M5_SEED_GRANTS) {
    const calendarId = calendarIds.get(grant.calendarKey);
    const calendar = M5_SEED_CALENDARS.find((row) => row.key === grant.calendarKey);
    if (!calendarId || !calendar) {
      throw new Error(`M5 seed missing calendar ${grant.calendarKey}`);
    }
    const organizationId = m3Id(`org:${calendar.orgKey}`);
    const createdByOrganizationMembershipId = m3Id(`orgmem:${calendar.orgKey}:${calendar.ownerUserKey}`);
    const organizationMembershipId =
      grant.principalKind === "USER" && grant.userKey
        ? m3Id(`orgmem:${calendar.orgKey}:${grant.userKey}`)
        : null;
    const teamId = grant.principalKind === "TEAM" && grant.teamKey ? m3Id(`team:${grant.teamKey}`) : null;
    const id = m5Id(
      `grant:${grant.calendarKey}:${grant.principalKind}:${grant.userKey ?? grant.teamKey ?? "unknown"}`,
    );
    const existing = await prisma.calendarAccessGrant.findUnique({ where: { id } });
    if (!existing) {
      await prisma.calendarAccessGrant.create({
        data: {
          id,
          organizationId,
          calendarId,
          principalKind: grant.principalKind,
          organizationMembershipId,
          teamId,
          role: grant.role,
          revokedAt: grant.revoked ? new Date("2026-10-01T00:00:00.000Z") : null,
          createdByOrganizationMembershipId,
        },
      });
    }
  }

  for (const event of M5_SEED_EVENTS) {
    const calendarId = calendarIds.get(event.calendarKey);
    const calendar = M5_SEED_CALENDARS.find((row) => row.key === event.calendarKey);
    if (!calendarId || !calendar) {
      throw new Error(`M5 seed missing calendar ${event.calendarKey}`);
    }
    const organizationId = m3Id(`org:${calendar.orgKey}`);
    const createdByOrganizationMembershipId = m3Id(`orgmem:${calendar.orgKey}:${calendar.ownerUserKey}`);
    const id = m5Id(`evt:${event.key}`);
    const existing = await prisma.calendarEvent.findUnique({ where: { id } });
    if (existing) {
      continue;
    }
    if (event.kind === "REFERENCED") {
      const referenceId = event.referenceKey ? m3Id(`task:${event.referenceKey}`) : null;
      await prisma.calendarEvent.create({
        data: {
          id,
          organizationId,
          calendarId,
          kind: "REFERENCED",
          title: event.title,
          description: "",
          allDay: false,
          startsAt: new Date("2026-10-06T00:00:00.000Z"),
          endsAt: new Date("2099-02-01T00:00:00.000Z"),
          timeZone: "UTC",
          linkedProjectId: m3Id("project:project-a1"),
          referenceType: event.referenceType ?? "TASK",
          referenceId,
          createdByOrganizationMembershipId,
        },
      });
      continue;
    }
    if (event.allDay) {
      await prisma.calendarEvent.create({
        data: {
          id,
          organizationId,
          calendarId,
          kind: "MANUAL",
          title: event.title,
          description: "",
          allDay: true,
          allDayStartDate: new Date("2026-10-02T00:00:00.000Z"),
          allDayEndDate: new Date("2026-10-02T00:00:00.000Z"),
          createdByOrganizationMembershipId,
        },
      });
      continue;
    }
    await prisma.calendarEvent.create({
      data: {
        id,
        organizationId,
        calendarId,
        kind: "MANUAL",
        title: event.title,
        description: "",
        allDay: false,
        startsAt: new Date("2026-10-02T18:00:00.000Z"),
        endsAt: new Date("2026-10-02T19:00:00.000Z"),
        timeZone: calendar.timeZone,
        createdByOrganizationMembershipId,
      },
    });
  }
}
