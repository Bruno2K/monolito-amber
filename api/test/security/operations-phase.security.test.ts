import { describe, expect, it } from "vitest";
import {
  OperationsStateError,
  assertPhaseTransition,
  hardDeletePhaseAllowed,
  historicalDisciplineIdentifierPreserved,
  ownerOrDisciplineGrantsProjectAccess,
  phaseDatesTransitStatus,
  phaseStatusRequiresCompletePermission,
  teamMembershipImpliesProjectMembership,
} from "@amber/shared";

describe("M3.3 Phase / Discipline security floors", () => {
  it("refuses skip-to-COMPLETED, date-driven status, and hard-delete", () => {
    expect(() => assertPhaseTransition("PLANNED", "COMPLETED")).toThrow(OperationsStateError);
    expect(phaseDatesTransitStatus()).toBe(false);
    expect(phaseStatusRequiresCompletePermission("COMPLETED")).toBe(true);
    expect(hardDeletePhaseAllowed()).toBe(false);
    expect(historicalDisciplineIdentifierPreserved()).toBe(true);
  });

  it("does not treat Team, owner, or Discipline as Project access", () => {
    expect(teamMembershipImpliesProjectMembership()).toBe(false);
    expect(ownerOrDisciplineGrantsProjectAccess()).toBe(false);
  });
});
