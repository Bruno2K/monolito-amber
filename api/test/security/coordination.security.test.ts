import { describe, expect, it } from "vitest";
import {
  CoordinationStateError,
  assertCanAssessImpact,
  assertCanResolveImpact,
  assertIssueTransition,
  impactAnalysisChangeKey,
  isImpactBlockingIssueStatus,
  isIssueOrigin,
  isIssuePriority,
  isIssueSeverity,
} from "@amber/shared";

describe("PF-1.4 Coordination security floors (fail closed)", () => {
  it("auto-create cannot skip to IMPACTED and cannot invent Issues", () => {
    expect(() => assertCanAssessImpact("IMPACTED")).toThrow(CoordinationStateError);
    expect(() => assertCanResolveImpact("PENDING_ANALYSIS")).toThrow(CoordinationStateError);
    expect(() => assertIssueTransition("OPEN", "CLOSED")).toThrow(CoordinationStateError);
    expect(isIssueOrigin("IMPACT")).toBe(true);
    expect(isIssueOrigin("AUTO")).toBe(false);
  });

  it("companion outbox events share one change key and keep Severity ≠ Priority", () => {
    const key = impactAnalysisChangeKey({
      correlationId: "c",
      documentId: "d",
      previousRevisionId: null,
      newRevisionId: "r",
    });
    expect(
      impactAnalysisChangeKey({
        correlationId: "c",
        documentId: "d",
        previousRevisionId: null,
        newRevisionId: "r",
      }),
    ).toBe(key);
    expect(isIssueSeverity("BLOCKER")).toBe(true);
    expect(isIssuePriority("BLOCKER")).toBe(false);
    expect(isImpactBlockingIssueStatus("RESOLVED")).toBe(true);
    expect(isImpactBlockingIssueStatus("CLOSED")).toBe(false);
  });
});
