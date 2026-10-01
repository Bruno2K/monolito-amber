import { describe, expect, it } from "vitest";
import {
  canCompletePhase,
  canCreatePhase,
  canUpdatePhase,
  formatPhaseDate,
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
