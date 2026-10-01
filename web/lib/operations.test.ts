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
  canCompleteWorkPackage,
  canCreateWorkPackage,
  canUpdateWorkPackage,
  deliverableStatusLabel,
  deliverablesDeepLink,
  formatPhaseDate,
  formatProgress,
  phaseStatusLabel,
  structureDeepLink,
  workPackageStatusLabel,
  workPackagesDeepLink,
  withReturnPath,
  safeReturnTo,
  canLinkDeliverableDocument,
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

describe("work package helpers", () => {
  it("builds a stable WorkPackage deep link", () => {
    expect(workPackagesDeepLink("abc")).toBe("/projects/abc/work-packages");
    expect(workPackagesDeepLink("abc", "wp-1")).toBe("/projects/abc/work-packages?inspect=wp-1");
  });

  it("gates mutations on work_package.* while reads stay on project.read", () => {
    expect(canCreateWorkPackage(["project.read"])).toBe(false);
    expect(canUpdateWorkPackage(["work_package.update"])).toBe(true);
    expect(canCompleteWorkPackage(["work_package.complete"])).toBe(true);
    expect(workPackageStatusLabel("BLOCKED")).toBe("Bloqueado");
    expect(workPackageStatusLabel("DONE")).toBe("Concluído");
  });

  it("preserves a same-project return path and refuses off-project URLs", () => {
    expect(withReturnPath("/projects/abc/work-packages?inspect=wp-1", "/projects/abc/deliverables?inspect=d1")).toBe(
      "/projects/abc/work-packages?inspect=wp-1&returnTo=%2Fprojects%2Fabc%2Fdeliverables%3Finspect%3Dd1",
    );
    expect(safeReturnTo("/projects/abc/deliverables?inspect=d1", "abc")).toBe("/projects/abc/deliverables?inspect=d1");
    expect(safeReturnTo("https://evil.example/projects/abc/deliverables", "abc")).toBeNull();
    expect(canLinkDeliverableDocument(["deliverable.update"])).toBe(false);
    expect(canLinkDeliverableDocument(["deliverable.update", "document.read"])).toBe(true);
  });
});
