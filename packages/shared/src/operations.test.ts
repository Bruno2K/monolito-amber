import { describe, expect, it } from "vitest";
import { OperationsStateError } from "./errors.js";
import {
  DELIVERABLE_FIELDS,
  DISCIPLINE_FIELDS,
  PHASE_FIELDS,
  PHASE_TERMINAL_STATUSES,
  REQUIRED_DELIVERABLE_RELATIONS,
  REQUIRED_WORK_PACKAGE_RELATIONS,
  WORK_PACKAGE_FIELDS,
  assertBlockedReason,
  assertDeliverableCanBeDelivered,
  assertDeliverableTransition,
  assertOwnershipXor,
  assertPhaseTransition,
  assertUniqueAmongNonArchived,
  assertUniquePhaseSequence,
  assertUserOwnerRequiresActiveProjectMembership,
  assertWorkPackageTransition,
  cancelledLinkedWorkPackageBlocksDelivery,
  deliverableStatusRequiresApprovePermission,
  deliverableStatusRequiresDeliverPermission,
  incidentalTasksBlockWorkPackageDone,
  leavingBlockedClearsReason,
  nextBlockedReason,
  ownerOrDisciplineGrantsProjectAccess,
  phaseDatesTransitStatus,
  phaseStatusRequiresCompletePermission,
  phasesMayOverlap,
  teamMembershipImpliesProjectMembership,
  teamOwnerGrantsProjectAccess,
  workPackageStatusRequiresBlockedReason,
  workPackageStatusRequiresCompletePermission,
} from "./operations.js";

describe("Phase state machine", () => {
  it("encodes PLANNED → ACTIVE → COMPLETED with CANCELLED from PLANNED/ACTIVE", () => {
    assertPhaseTransition("PLANNED", "ACTIVE");
    assertPhaseTransition("PLANNED", "CANCELLED");
    assertPhaseTransition("ACTIVE", "COMPLETED");
    assertPhaseTransition("ACTIVE", "CANCELLED");
    expect(() => assertPhaseTransition("PLANNED", "COMPLETED")).toThrow(OperationsStateError);
    expect(() => assertPhaseTransition("COMPLETED", "ACTIVE")).toThrow(OperationsStateError);
    expect(() => assertPhaseTransition("CANCELLED", "PLANNED")).toThrow(OperationsStateError);
    expect(PHASE_TERMINAL_STATUSES).toEqual(["COMPLETED", "CANCELLED"]);
    expect(phaseStatusRequiresCompletePermission("COMPLETED")).toBe(true);
    expect(phaseStatusRequiresCompletePermission("ACTIVE")).toBe(false);
  });

  it("does not let dates transit status and allows overlap", () => {
    expect(phaseDatesTransitStatus()).toBe(false);
    expect(phasesMayOverlap()).toBe(true);
  });

  it("requires unique sequence among non-archived Phases", () => {
    const existing = [
      { sequence: 1, archived: false },
      { sequence: 2, archived: true },
    ];
    expect(() => assertUniquePhaseSequence(existing, 1)).toThrow(/unique/);
    expect(() => assertUniquePhaseSequence(existing, 2)).not.toThrow();
    expect(() => assertUniquePhaseSequence(existing, 3)).not.toThrow();
  });
});

describe("Deliverable state machine", () => {
  it("is linear PLANNED → IN_PROGRESS → IN_REVIEW → APPROVED → DELIVERED with CANCELLED before DELIVERED", () => {
    assertDeliverableTransition("PLANNED", "IN_PROGRESS");
    assertDeliverableTransition("IN_PROGRESS", "IN_REVIEW");
    assertDeliverableTransition("IN_REVIEW", "APPROVED");
    assertDeliverableTransition("APPROVED", "DELIVERED");
    assertDeliverableTransition("APPROVED", "CANCELLED");
    assertDeliverableTransition("IN_REVIEW", "CANCELLED");
    expect(() => assertDeliverableTransition("IN_REVIEW", "DELIVERED")).toThrow(OperationsStateError);
    expect(() => assertDeliverableTransition("PLANNED", "APPROVED")).toThrow(OperationsStateError);
    expect(() => assertDeliverableTransition("DELIVERED", "CANCELLED")).toThrow(OperationsStateError);
    expect(deliverableStatusRequiresApprovePermission("APPROVED")).toBe(true);
    expect(deliverableStatusRequiresDeliverPermission("DELIVERED")).toBe(true);
  });

  it("requires phaseId and disciplineId and unique case-insensitive code among non-archived", () => {
    expect(REQUIRED_DELIVERABLE_RELATIONS).toEqual(["phaseId", "disciplineId"]);
    const existing = [
      { code: "DEL-A", archived: false },
      { code: "old", archived: true },
    ];
    expect(() => assertUniqueAmongNonArchived(existing, "del-a")).toThrow(/unique/);
    expect(() => assertUniqueAmongNonArchived(existing, "OLD")).not.toThrow();
  });
});

describe("WorkPackage state machine", () => {
  it("encodes PLANNED → ACTIVE, ACTIVE ↔ BLOCKED, ACTIVE → DONE, CANCELLED from non-terminal", () => {
    assertWorkPackageTransition("PLANNED", "ACTIVE");
    assertWorkPackageTransition("PLANNED", "CANCELLED");
    assertWorkPackageTransition("ACTIVE", "BLOCKED");
    assertWorkPackageTransition("BLOCKED", "ACTIVE");
    assertWorkPackageTransition("ACTIVE", "DONE");
    assertWorkPackageTransition("ACTIVE", "CANCELLED");
    assertWorkPackageTransition("BLOCKED", "CANCELLED");
    expect(() => assertWorkPackageTransition("PLANNED", "DONE")).toThrow(OperationsStateError);
    expect(() => assertWorkPackageTransition("BLOCKED", "DONE")).toThrow(OperationsStateError);
    expect(() => assertWorkPackageTransition("DONE", "ACTIVE")).toThrow(OperationsStateError);
    expect(workPackageStatusRequiresCompletePermission("DONE")).toBe(true);
    expect(workPackageStatusRequiresBlockedReason("BLOCKED")).toBe(true);
  });

  it("requires blockedReason on BLOCKED and clears it when leaving BLOCKED", () => {
    expect(() => assertBlockedReason("BLOCKED", "")).toThrow(/blockedReason/);
    expect(() => assertBlockedReason("BLOCKED", "grid freeze")).not.toThrow();
    expect(leavingBlockedClearsReason("BLOCKED", "ACTIVE")).toBe(true);
    expect(nextBlockedReason("BLOCKED", "ACTIVE", "grid freeze")).toBeNull();
    expect(nextBlockedReason("ACTIVE", "BLOCKED", "grid freeze")).toBe("grid freeze");
  });

  it("does not let incidental Task links block DONE", () => {
    expect(incidentalTasksBlockWorkPackageDone()).toBe(false);
    expect(REQUIRED_WORK_PACKAGE_RELATIONS).toEqual(["phaseId"]);
  });
});

describe("Ownership XOR and tenancy invariants", () => {
  it("allows none or exactly one owner and rejects user+Team", () => {
    expect(() => assertOwnershipXor({})).not.toThrow();
    expect(() => assertOwnershipXor({ ownerProjectMembershipId: "pm-1" })).not.toThrow();
    expect(() => assertOwnershipXor({ ownerTeamId: "team-1" })).not.toThrow();
    expect(() =>
      assertOwnershipXor({ ownerProjectMembershipId: "pm-1", ownerTeamId: "team-1" }),
    ).toThrow(/XOR/);
  });

  it("requires ACTIVE ProjectMembership for a user owner and never grants access via owner/Team/Discipline", () => {
    expect(() => assertUserOwnerRequiresActiveProjectMembership("pm-1", "ACTIVE")).not.toThrow();
    expect(() => assertUserOwnerRequiresActiveProjectMembership("pm-1", "SUSPENDED")).toThrow(
      OperationsStateError,
    );
    expect(() => assertUserOwnerRequiresActiveProjectMembership(null, "REMOVED")).not.toThrow();
    expect(teamOwnerGrantsProjectAccess()).toBe(false);
    expect(ownerOrDisciplineGrantsProjectAccess()).toBe(false);
    expect(teamMembershipImpliesProjectMembership()).toBe(false);
  });
});

describe("Deliverable delivery rule", () => {
  it("requires every still-linked WorkPackage to be DONE and blocks on linked CANCELLED", () => {
    expect(() =>
      assertDeliverableCanBeDelivered([
        { status: "DONE", associated: true },
        { status: "CANCELLED", associated: false },
      ]),
    ).not.toThrow();
    expect(() =>
      assertDeliverableCanBeDelivered([{ status: "ACTIVE", associated: true }]),
    ).toThrow(/cannot be DELIVERED/);
    expect(
      cancelledLinkedWorkPackageBlocksDelivery([{ status: "CANCELLED", associated: true }]),
    ).toBe(true);
    expect(
      cancelledLinkedWorkPackageBlocksDelivery([{ status: "CANCELLED", associated: false }]),
    ).toBe(false);
  });
});

describe("Contract field tables", () => {
  it("lists the binding fields including implied archive/timestamps", () => {
    expect(PHASE_FIELDS).toEqual(
      expect.arrayContaining(["organizationId", "projectId", "sequence", "status", "createdBy", "version"]),
    );
    expect(DISCIPLINE_FIELDS).toEqual(
      expect.arrayContaining(["organizationId", "code", "name", "active"]),
    );
    expect(DELIVERABLE_FIELDS).toEqual(
      expect.arrayContaining(["phaseId", "disciplineId", "code", "ownerProjectMembershipId", "ownerTeamId"]),
    );
    expect(WORK_PACKAGE_FIELDS).toEqual(
      expect.arrayContaining(["phaseId", "deliverableId", "blockedReason", "ownerProjectMembershipId"]),
    );
  });
});
