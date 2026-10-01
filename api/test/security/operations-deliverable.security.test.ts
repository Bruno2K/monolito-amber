import { describe, expect, it } from "vitest";
import {
  OperationsStateError,
  assertDeliverableCanBeDelivered,
  assertDeliverableTransition,
  assertOwnershipXor,
  deliverableDatesTransitStatus,
  deliverableStatusRequiresApprovePermission,
  deliverableStatusRequiresDeliverPermission,
  hardDeleteDeliverableAllowed,
  ownerOrDisciplineGrantsProjectAccess,
  progressPercentTransitsDeliverableStatus,
  teamMembershipImpliesProjectMembership,
  teamOwnerGrantsProjectAccess,
} from "@amber/shared";

describe("M3.4 Deliverable security floors", () => {
  it("refuses skip-to-DELIVERED, date/progress-driven status, and hard-delete", () => {
    expect(() => assertDeliverableTransition("IN_PROGRESS", "DELIVERED")).toThrow(OperationsStateError);
    expect(() => assertDeliverableTransition("IN_REVIEW", "DELIVERED")).toThrow(OperationsStateError);
    expect(deliverableDatesTransitStatus()).toBe(false);
    expect(progressPercentTransitsDeliverableStatus()).toBe(false);
    expect(deliverableStatusRequiresApprovePermission("APPROVED")).toBe(true);
    expect(deliverableStatusRequiresDeliverPermission("DELIVERED")).toBe(true);
    expect(hardDeleteDeliverableAllowed()).toBe(false);
  });

  it("does not treat Team, owner, or Discipline as Project access", () => {
    expect(teamMembershipImpliesProjectMembership()).toBe(false);
    expect(teamOwnerGrantsProjectAccess()).toBe(false);
    expect(ownerOrDisciplineGrantsProjectAccess()).toBe(false);
    expect(() =>
      assertOwnershipXor({ ownerProjectMembershipId: "pm", ownerTeamId: "team" }),
    ).toThrow(/XOR/);
  });

  it("allows deliver with zero linked WorkPackages and blocks non-DONE linked WPs", () => {
    expect(() => assertDeliverableCanBeDelivered([])).not.toThrow();
    expect(() =>
      assertDeliverableCanBeDelivered([{ status: "CANCELLED", associated: true }]),
    ).toThrow(OperationsStateError);
  });
});
