import { describe, expect, it } from "vitest";
import { CoordinationStateError } from "./errors.js";
import { assertCanAssessImpact, assertCanResolveImpact, impactAnalysisChangeKey } from "./impact.js";
import {
  assertIssueTransition,
  isImpactBlockingIssueStatus,
  isIssueOrigin,
  isIssuePriority,
  isIssueSeverity,
} from "./issue.js";
import { PERMISSIONS } from "./permissions.js";

describe("Coordination security floors (fail closed)", () => {
  it("never invents impact.* permissions; uses closed issue.* catalog", () => {
    expect(PERMISSIONS.some((code) => code.startsWith("impact."))).toBe(false);
    expect(PERMISSIONS).toContain("issue.create");
    expect(PERMISSIONS).toContain("issue.update");
    expect(PERMISSIONS).toContain("issue.resolve");
    expect(PERMISSIONS).not.toContain("gate.override");
  });

  it("auto-create stays PENDING_ANALYSIS — assessment and resolve are explicit transitions", () => {
    expect(() => assertCanAssessImpact("IMPACTED")).toThrow(CoordinationStateError);
    expect(() => assertCanResolveImpact("PENDING_ANALYSIS")).toThrow(CoordinationStateError);
    expect(() => assertIssueTransition("OPEN", "CLOSED")).toThrow(CoordinationStateError);
  });

  it("keeps origin / severity / priority / discipline-vs-assignee as distinct facts", () => {
    expect(isIssueOrigin("IMPACT")).toBe(true);
    expect(isIssueOrigin("MANUAL")).toBe(true);
    expect(isIssueOrigin("AUTO")).toBe(false);
    expect(isIssueSeverity("HIGH")).toBe(true);
    expect(isIssuePriority("HIGH")).toBe(true);
    expect(isIssueSeverity("URGENT")).toBe(false);
    expect(isIssuePriority("BLOCKER")).toBe(false);
  });

  it("uses a change-event key so companion outbox events cannot create a second case", () => {
    const a = impactAnalysisChangeKey({
      correlationId: "same",
      documentId: "d",
      previousRevisionId: "r0",
      newRevisionId: "r1",
    });
    const b = impactAnalysisChangeKey({
      correlationId: "same",
      documentId: "d",
      previousRevisionId: "r0",
      newRevisionId: "r1",
    });
    expect(a).toBe(b);
    expect(isImpactBlockingIssueStatus("OPEN")).toBe(true);
  });
});
