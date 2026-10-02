import { describe, expect, it } from "vitest";
import { CalendarStateError, DenyByDefaultError } from "./errors.js";
import {
  assertAllDayLocalDate,
  assertAuthoritativeInstant,
  assertCalendarActionAllowed,
  assertEventTimeBounds,
  assertGrantPrincipalXor,
  assertIanaTimeZone,
  calendarAccessGrantsProjectAccess,
  calendarActionAllowed,
  calendarEditsMutateSourceLifecycle,
  dedupeScheduleItemsBySourceIdentity,
  effectiveCalendarRole,
  inactiveOwnerAutoTransfers,
  myScheduleIncludesSource,
  orgMembershipAloneExposesPrivateCalendar,
  projectReferencedEvent,
  referencedEventUsesStaleSnapshot,
  remainingCalendarRoleAfterRevoke,
  teamMembershipGrantsProjectAccess,
} from "./calendar.js";

describe("M5.1 Calendar contract", () => {
  it("validates IANA zones and all-day local dates", () => {
    expect(() => assertIanaTimeZone("America/Sao_Paulo")).not.toThrow();
    expect(() => assertIanaTimeZone("UTC")).not.toThrow();
    expect(() => assertIanaTimeZone("EST")).toThrow(CalendarStateError);
    expect(() => assertIanaTimeZone("local")).toThrow(CalendarStateError);
    expect(() => assertAllDayLocalDate("2026-10-02")).not.toThrow();
    expect(() => assertAllDayLocalDate("10/02/2026")).toThrow(CalendarStateError);
  });

  it("rejects invalid or undisambiguated DST and inverted bounds", () => {
    expect(() => assertAuthoritativeInstant({ resolution: "INVALID" })).toThrow(CalendarStateError);
    expect(() => assertAuthoritativeInstant({ resolution: "AMBIGUOUS" })).toThrow(CalendarStateError);
    expect(() =>
      assertAuthoritativeInstant({ resolution: "AMBIGUOUS", chosenOffset: "-03:00" }),
    ).not.toThrow();
    expect(() =>
      assertEventTimeBounds({
        allDay: false,
        startsAt: "2026-10-02T18:00:00.000Z",
        endsAt: "2026-10-02T17:00:00.000Z",
        timeZone: "America/Sao_Paulo",
      }),
    ).toThrow(CalendarStateError);
    expect(() =>
      assertEventTimeBounds({
        allDay: true,
        allDayStartDate: "2026-10-03",
        allDayEndDate: "2026-10-02",
      }),
    ).toThrow(CalendarStateError);
  });

  it("enforces USER/TEAM grant XOR and overlapping max-role", () => {
    expect(() =>
      assertGrantPrincipalXor({
        principalKind: "USER",
        organizationMembershipId: "m1",
        teamId: null,
      }),
    ).not.toThrow();
    expect(() =>
      assertGrantPrincipalXor({ principalKind: "USER", organizationMembershipId: "m1", teamId: "t1" }),
    ).toThrow(CalendarStateError);
    const paths = [
      { kind: "USER" as const, role: "VIEWER" as const, active: true },
      { kind: "TEAM" as const, role: "EDITOR" as const, active: true },
    ];
    expect(effectiveCalendarRole(paths)).toBe("EDITOR");
    expect(remainingCalendarRoleAfterRevoke(paths, 1)).toBe("VIEWER");
    expect(effectiveCalendarRole([{ kind: "TEAM", role: "EDITOR", active: true, archivedTeam: true }])).toBeNull();
  });

  it("freezes inactive owner mutations while grantees may read", () => {
    const owner = { ownerMembershipId: "owner", ownerMembershipStatus: "SUSPENDED" as const };
    const grants = [{ kind: "USER" as const, role: "EDITOR" as const, active: true }];
    expect(
      calendarActionAllowed({
        actorMembershipId: "owner",
        actorMembershipStatus: "SUSPENDED",
        owner,
        grantPaths: grants,
        action: "read",
      }),
    ).toBe(false);
    expect(
      calendarActionAllowed({
        actorMembershipId: "grantee",
        actorMembershipStatus: "ACTIVE",
        owner,
        grantPaths: grants,
        action: "read",
      }),
    ).toBe(true);
    expect(
      calendarActionAllowed({
        actorMembershipId: "grantee",
        actorMembershipStatus: "ACTIVE",
        owner,
        grantPaths: grants,
        action: "mutate_manual_event",
      }),
    ).toBe(false);
    expect(
      calendarActionAllowed({
        actorMembershipId: "grantee",
        actorMembershipStatus: "ACTIVE",
        owner,
        grantPaths: grants,
        action: "admin_grant",
      }),
    ).toBe(false);
    expect(inactiveOwnerAutoTransfers()).toBe(false);
    expect(() =>
      assertCalendarActionAllowed({
        actorMembershipId: "grantee",
        actorMembershipStatus: "ACTIVE",
        owner: { ownerMembershipId: "owner", ownerMembershipStatus: "ACTIVE" },
        grantPaths: [{ kind: "USER", role: "VIEWER", active: true }],
        action: "mutate_manual_event",
      }),
    ).toThrow(DenyByDefaultError);
  });

  it("omits unauthorized referenced projections and never serves stale snapshots", () => {
    const omitted = projectReferencedEvent({
      hasCalendarAccess: true,
      sourceExists: true,
      sourceDeletedOrArchived: false,
      sourceAuthorized: false,
      persistedSnapshotTitle: "secret",
      liveSourceTitle: "live",
    });
    expect(omitted).toEqual({ omit: true });
    const live = projectReferencedEvent({
      hasCalendarAccess: true,
      sourceExists: true,
      sourceDeletedOrArchived: false,
      sourceAuthorized: true,
      persistedSnapshotTitle: "stale",
      liveSourceTitle: "current title",
    });
    expect(live).toEqual({ omit: false, title: "current title" });
    expect(
      referencedEventUsesStaleSnapshot({
        projectedTitle: "stale",
        persistedSnapshotTitle: "stale",
        liveSourceTitle: "current title",
      }),
    ).toBe(true);
  });

  it("merges My Schedule only from authorized toggled sources and dedupes identity", () => {
    expect(
      myScheduleIncludesSource({
        sourceKind: "AUTHORIZED_PROJECT_DATE",
        calendarAuthorized: true,
        projectAuthorized: false,
        sourceToggleEnabled: true,
      }),
    ).toBe(false);
    expect(
      myScheduleIncludesSource({
        sourceKind: "TEAM_GRANT",
        calendarAuthorized: true,
        projectAuthorized: false,
        sourceToggleEnabled: false,
      }),
    ).toBe(false);
    expect(
      dedupeScheduleItemsBySourceIdentity([
        { sourceIdentity: "task:1" },
        { sourceIdentity: "task:1" },
        { sourceIdentity: "manual:2" },
      ]),
    ).toHaveLength(2);
  });

  it("preserves access isolation floors", () => {
    expect(orgMembershipAloneExposesPrivateCalendar()).toBe(false);
    expect(calendarAccessGrantsProjectAccess()).toBe(false);
    expect(teamMembershipGrantsProjectAccess()).toBe(false);
    expect(calendarEditsMutateSourceLifecycle()).toBe(false);
  });
});
