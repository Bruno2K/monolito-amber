import { describe, expect, it } from "vitest";
import {
  OperationsStateError,
  assertBlockedReason,
  assertBlockedReasonPersistsWhileBlocked,
  assertOwnershipXor,
  assertWorkPackageTransition,
  hardDeleteWorkPackageAllowed,
  incidentalTasksBlockWorkPackageDone,
  ownerOrDisciplineGrantsProjectAccess,
  teamMembershipImpliesProjectMembership,
  teamOwnerGrantsProjectAccess,
  workPackageCompleteCascadesToDeliverable,
  workPackageCompleteCascadesToMilestone,
  workPackageCompleteCascadesToTask,
  workPackageDatesTransitStatus,
} from "@amber/shared";

describe("M3.5 WorkPackage security floors", () => {
  it("refuses skip-to-DONE, date-driven status, cascade complete, and hard-delete", () => {
    expect(() => assertWorkPackageTransition("PLANNED", "DONE")).toThrow(OperationsStateError);
    expect(() => assertWorkPackageTransition("BLOCKED", "DONE")).toThrow(OperationsStateError);
    expect(workPackageDatesTransitStatus()).toBe(false);
    expect(incidentalTasksBlockWorkPackageDone()).toBe(false);
    expect(workPackageCompleteCascadesToTask()).toBe(false);
    expect(workPackageCompleteCascadesToDeliverable()).toBe(false);
    expect(workPackageCompleteCascadesToMilestone()).toBe(false);
    expect(hardDeleteWorkPackageAllowed()).toBe(false);
  });

  it("requires blockedReason and forbids clearing it while BLOCKED", () => {
    expect(() => assertBlockedReason("BLOCKED", "")).toThrow(OperationsStateError);
    expect(() => assertBlockedReasonPersistsWhileBlocked("BLOCKED", null)).toThrow(OperationsStateError);
  });

  it("does not treat Team, owner, or Discipline as Project access", () => {
    expect(teamMembershipImpliesProjectMembership()).toBe(false);
    expect(teamOwnerGrantsProjectAccess()).toBe(false);
    expect(ownerOrDisciplineGrantsProjectAccess()).toBe(false);
    expect(() =>
      assertOwnershipXor({ ownerProjectMembershipId: "pm", ownerTeamId: "team" }),
    ).toThrow(/XOR/);
  });
});
