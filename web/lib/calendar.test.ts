import { describe, expect, it } from "vitest";
import {
  canAdminGrants,
  canMutateManualEvents,
  canRenameOrArchive,
  classifyCalendarHttp,
  eventAccessibleName,
  eventOverlapsDate,
  inheritedGrantNotEditable,
  monthGridDays,
  parseCalendarView,
  parseScheduleToggles,
  provenanceKind,
  provenanceLabel,
  referencedSourceHref,
  revokeEffectCopy,
  scheduleQueryFromToggles,
  viewerEditorCapabilityCopy,
  weekDays,
  type CalendarEventRecord,
  type CalendarGrantRecord,
  type CalendarRecord,
} from "./calendar";

function calendar(partial: Partial<CalendarRecord> = {}): CalendarRecord {
  return {
    id: "cal-1",
    organizationId: "org-1",
    ownerOrganizationMembershipId: "mem-1",
    name: "Privado",
    description: "",
    timeZone: "America/Sao_Paulo",
    status: "ACTIVE",
    archivedAt: null,
    version: 1,
    effectiveRole: "OWNER",
    accessPaths: [],
    ...partial,
  };
}

function event(partial: Partial<CalendarEventRecord> = {}): CalendarEventRecord {
  return {
    id: "evt-1",
    calendarId: "cal-1",
    kind: "MANUAL",
    title: "Manual timed",
    description: "",
    allDay: false,
    startsAt: "2026-10-02T18:00:00.000Z",
    endsAt: "2026-10-02T19:00:00.000Z",
    timeZone: "America/Sao_Paulo",
    allDayStartDate: null,
    allDayEndDate: null,
    linkedProjectId: null,
    referenceType: null,
    referenceId: null,
    version: 1,
    ...partial,
  };
}

describe("calendar UX helpers", () => {
  it("parses views and keeps agenda as a first-class projection", () => {
    expect(parseCalendarView("week")).toBe("week");
    expect(parseCalendarView("agenda")).toBe("agenda");
    expect(parseCalendarView("unknown")).toBe("month");
  });

  it("labels owned, direct and team provenance without leaking unauthorized names", () => {
    expect(provenanceKind(calendar())).toBe("owned");
    expect(provenanceLabel(calendar())).toBe("Proprietário");
    expect(
      provenanceLabel(
        calendar({
          effectiveRole: "EDITOR",
          accessPaths: [{ kind: "USER", role: "EDITOR" }],
        }),
      ),
    ).toContain("direto");
    expect(
      provenanceLabel(
        calendar({
          effectiveRole: "VIEWER",
          accessPaths: [{ kind: "TEAM", role: "VIEWER" }],
        }),
      ),
    ).toContain("herdado via equipe");
  });

  it("keeps EDITOR from grant/archive and freezes archived calendars", () => {
    const editor = calendar({ effectiveRole: "EDITOR" });
    expect(canMutateManualEvents(editor)).toBe(true);
    expect(canAdminGrants(editor)).toBe(false);
    expect(canRenameOrArchive(editor)).toBe(false);
    const archived = calendar({ status: "ARCHIVED", archivedAt: "2026-10-01T00:00:00.000Z" });
    expect(canMutateManualEvents(archived)).toBe(false);
    expect(canAdminGrants(archived)).toBe(false);
  });

  it("marks inherited and non-owner grant rows as not directly editable", () => {
    const grant: CalendarGrantRecord = {
      id: "g1",
      organizationId: "org",
      calendarId: "cal",
      principalKind: "TEAM",
      organizationMembershipId: null,
      teamId: "team",
      role: "VIEWER",
      revokedAt: null,
      createdByOrganizationMembershipId: "owner",
    };
    expect(inheritedGrantNotEditable({ actorIsOwner: true, grant })).toBe(false);
    expect(inheritedGrantNotEditable({ actorIsOwner: false, grant })).toBe(true);
  });

  it("explains viewer/editor capabilities and revoke remaining paths", () => {
    expect(viewerEditorCapabilityCopy("EDITOR")).toMatch(/não pode compartilhar/i);
    expect(revokeEffectCopy({ remainingRole: null, principalLabel: "Ana" })).toMatch(/deixa de ver/);
    expect(revokeEffectCopy({ remainingRole: "VIEWER", principalLabel: "Ana" })).toMatch(/outro caminho/);
  });

  it("links referenced events to authorized source flows and never mutates them here", () => {
    expect(
      referencedSourceHref({
        kind: "REFERENCED",
        linkedProjectId: "p1",
        referenceType: "TASK",
        referenceId: "t1",
      }),
    ).toBe("/projects/p1/planner?inspect=t1");
    expect(
      referencedSourceHref({
        kind: "MANUAL",
        linkedProjectId: "p1",
        referenceType: null,
        referenceId: null,
      }),
    ).toBeNull();
  });

  it("treats schedule toggles as preference query flags, defaulting to include", () => {
    expect(parseScheduleToggles({ includeOwned: false }).includeOwned).toBe(false);
    expect(parseScheduleToggles({}).includeProjectDates).toBe(true);
    expect(scheduleQueryFromToggles(parseScheduleToggles({ includeTeam: false }))).toContain("includeTeam=false");
  });

  it("classifies stale deep links as revoked/no-permission without using the URL as a title", () => {
    expect(classifyCalendarHttp(403)).toBe("no-permission");
    expect(classifyCalendarHttp(404)).toBe("revoked");
    expect(classifyCalendarHttp(403, { status: 403, code: "DENIED", title: "x", detail: "owner inactive freeze" })).toBe(
      "inactive",
    );
  });

  it("builds Monday-first month/week grids and names events with date and kind", () => {
    expect(weekDays("2026-10-02")[0]).toBe("2026-09-28");
    expect(monthGridDays("2026-10-02")).toHaveLength(42);
    expect(monthGridDays("2026-10-02")[0]).toBe("2026-09-28");
    expect(eventOverlapsDate(event(), "2026-10-02", "America/Sao_Paulo")).toBe(true);
    expect(eventAccessibleName(event(), "America/Sao_Paulo")).toMatch(/Manual timed/);
    expect(eventAccessibleName(event({ kind: "REFERENCED", referenceType: "TASK" }), "UTC")).toMatch(/Tarefa/);
  });
});
