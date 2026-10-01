import { describe, expect, it } from "vitest";
import { DELIVERABLE_STATUSES } from "./operations.js";
import {
  HUB_SIGNAL_CATALOG,
  HUB_SIGNAL_KEYS,
  clampHubListLimit,
  decodeHubCursor,
  encodeHubCursor,
  hubInventedHealthStatus,
  hubMutatesDomainSources,
  isDeliverableOverdueSignal,
  isHubStale,
  isOwnerGap,
  isWorkPackageLateSignal,
  overdueIsDeliverableStatus,
  relatedSourcePermission,
  selectCurrentPhase,
  zeroFilledDeliverableCounts,
} from "./hub.js";

describe("M3.6 hub derivation", () => {
  it("treats overdue as a dueAt signal and never as a Deliverable status", () => {
    expect(overdueIsDeliverableStatus()).toBe(false);
    expect(DELIVERABLE_STATUSES).not.toContain("OVERDUE");
    expect(
      isDeliverableOverdueSignal({
        dueAt: new Date("2020-01-01T00:00:00.000Z"),
        status: "IN_PROGRESS",
        now: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ).toBe(true);
    expect(
      isDeliverableOverdueSignal({
        dueAt: new Date("2020-01-01T00:00:00.000Z"),
        status: "DELIVERED",
        now: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ).toBe(false);
    expect(
      isDeliverableOverdueSignal({
        dueAt: new Date("2020-01-01T00:00:00.000Z"),
        status: "PLANNED",
        archivedAt: new Date("2026-01-01T00:00:00.000Z"),
        now: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ).toBe(false);
    expect(isDeliverableOverdueSignal({ dueAt: null, status: "PLANNED" })).toBe(false);
  });

  it("derives late WorkPackages from dueAt without inventing OVERDUE status", () => {
    expect(
      isWorkPackageLateSignal({
        dueAt: new Date("2020-01-01T00:00:00.000Z"),
        status: "ACTIVE",
        now: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ).toBe(true);
    expect(
      isWorkPackageLateSignal({
        dueAt: new Date("2020-01-01T00:00:00.000Z"),
        status: "DONE",
        now: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ).toBe(false);
    expect(
      isWorkPackageLateSignal({
        dueAt: new Date("2020-01-01T00:00:00.000Z"),
        status: "BLOCKED",
        archivedAt: new Date(),
        now: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("treats missing XOR ownership as a gap signal", () => {
    expect(isOwnerGap({})).toBe(true);
    expect(isOwnerGap({ ownerProjectMembershipId: null, ownerTeamId: null })).toBe(true);
    expect(isOwnerGap({ ownerProjectMembershipId: "pm-1" })).toBe(false);
    expect(isOwnerGap({ ownerTeamId: "team-1" })).toBe(false);
  });

  it("selects the lowest-sequence ACTIVE Phase as current", () => {
    expect(
      selectCurrentPhase([
        { status: "PLANNED", sequence: 0 },
        { status: "ACTIVE", sequence: 2 },
        { status: "ACTIVE", sequence: 1 },
        { status: "COMPLETED", sequence: 0 },
      ])?.sequence,
    ).toBe(1);
    expect(selectCurrentPhase([{ status: "PLANNED", sequence: 0, archivedAt: null }])).toBeNull();
    expect(selectCurrentPhase([{ status: "ACTIVE", sequence: 1, archivedAt: new Date() }])).toBeNull();
  });

  it("zero-fills authorized Deliverable status counts and never adds OVERDUE", () => {
    const counts = zeroFilledDeliverableCounts([
      { status: "PLANNED", count: 2 },
      { status: "OVERDUE", count: 9 },
    ]);
    expect(counts.PLANNED).toBe(2);
    expect(counts.IN_PROGRESS).toBe(0);
    expect(counts.DELIVERED).toBe(0);
    expect(Object.keys(counts)).toEqual([...DELIVERABLE_STATUSES]);
    expect("OVERDUE" in counts).toBe(false);
  });

  it("marks stale only when a cached snapshot lags source facts", () => {
    const generatedAt = new Date("2026-10-01T12:00:00.000Z");
    const later = new Date("2026-10-01T12:00:05.000Z");
    expect(isHubStale({ generatedAt, sourceMaxUpdatedAt: later, servedFromCache: true })).toBe(true);
    expect(isHubStale({ generatedAt, sourceMaxUpdatedAt: later, servedFromCache: false })).toBe(false);
    expect(isHubStale({ generatedAt, sourceMaxUpdatedAt: generatedAt, servedFromCache: true })).toBe(false);
  });

  it("documents origin + derivation for every hub signal and stays read-only", () => {
    for (const key of HUB_SIGNAL_KEYS) {
      expect(HUB_SIGNAL_CATALOG[key].origin.length).toBeGreaterThan(3);
      expect(HUB_SIGNAL_CATALOG[key].derivation.length).toBeGreaterThan(20);
    }
    expect(hubMutatesDomainSources()).toBe(false);
    expect(hubInventedHealthStatus()).toBe(false);
    expect(relatedSourcePermission("documents")).toBe("document.read");
    expect(relatedSourcePermission("gates")).toBe("gate.read");
    expect(relatedSourcePermission("activity")).toBe("organization.read_audit");
    expect(clampHubListLimit(999)).toBe(50);
    expect(clampHubListLimit(undefined)).toBe(20);
    const cursor = encodeHubCursor({ id: "abc", dueAt: "2026-01-01" });
    expect(decodeHubCursor(cursor)).toEqual({ id: "abc", dueAt: "2026-01-01" });
  });
});
