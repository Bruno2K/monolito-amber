import { describe, expect, it } from "vitest";
import {
  canCompletePhase,
  canCreatePhase,
  canUpdatePhase,
  canApproveDeliverable,
  canAssignDeliverable,
  canCreateDeliverable,
  canDeliverDeliverable,
  canUpdateDeliverable,
  deliverableStatusLabel,
  deliverablesDeepLink,
  formatPhaseDate,
  formatProgress,
  phaseStatusLabel,
  structureDeepLink,
} from "./operations";

describe("structure helpers", () => {
  it("builds a stable Phase deep link", () => {
    expect(structureDeepLink("abc")).toBe("/projects/abc/structure");
    expect(structureDeepLink("abc", "phase-1")).toBe("/projects/abc/structure?phase=phase-1");
  });

  it("gates mutations on phase.* while reads stay on project.read", () => {
    expect(canCreatePhase(["project.read"])).toBe(false);
    expect(canUpdatePhase(["project.read", "phase.update"])).toBe(true);
    expect(canCompletePhase(["phase.complete"])).toBe(true);
    expect(phaseStatusLabel("COMPLETED")).toBe("Concluída");
    expect(formatPhaseDate(null)).toBe("—");
  });
});

describe("deliverable helpers", () => {
  it("builds a stable Entregas deep link", () => {
    expect(deliverablesDeepLink("abc")).toBe("/projects/abc/deliverables");
    expect(deliverablesDeepLink("abc", "del-1")).toBe("/projects/abc/deliverables?inspect=del-1");
  });

  it("gates mutations on deliverable.* while reads stay on project.read", () => {
    expect(canCreateDeliverable(["project.read"])).toBe(false);
    expect(canUpdateDeliverable(["deliverable.update"])).toBe(true);
    expect(canAssignDeliverable(["deliverable.assign"])).toBe(true);
    expect(canApproveDeliverable(["deliverable.create"])).toBe(false);
    expect(canDeliverDeliverable(["deliverable.deliver"])).toBe(true);
    expect(deliverableStatusLabel("IN_REVIEW")).toBe("Em revisão");
    expect(formatProgress(72)).toBe("72%");
    expect(formatProgress(null)).toBe("—");
  });
});
