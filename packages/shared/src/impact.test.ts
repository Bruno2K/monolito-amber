import { describe, expect, it } from "vitest";
import { CoordinationStateError } from "./errors.js";
import {
  assertCanAssessImpact,
  assertCanResolveImpact,
  assertImpactTransition,
  impactAnalysisChangeKey,
  parseCurrentRevisionChangedPayload,
} from "./impact.js";

describe("Impact Analysis state machine", () => {
  it("allows PENDING_ANALYSIS → IMPACTED | NOT_IMPACTED → RESOLVED only", () => {
    assertImpactTransition("PENDING_ANALYSIS", "IMPACTED");
    assertImpactTransition("PENDING_ANALYSIS", "NOT_IMPACTED");
    assertImpactTransition("IMPACTED", "RESOLVED");
    assertImpactTransition("NOT_IMPACTED", "RESOLVED");
    expect(() => assertImpactTransition("PENDING_ANALYSIS", "RESOLVED")).toThrow(CoordinationStateError);
    expect(() => assertImpactTransition("IMPACTED", "NOT_IMPACTED")).toThrow(CoordinationStateError);
    expect(() => assertImpactTransition("RESOLVED", "IMPACTED")).toThrow(CoordinationStateError);
  });

  it("requires explicit assessment from PENDING_ANALYSIS and resolve from an assessed result", () => {
    assertCanAssessImpact("PENDING_ANALYSIS");
    expect(() => assertCanAssessImpact("IMPACTED")).toThrow(CoordinationStateError);
    assertCanResolveImpact("IMPACTED");
    assertCanResolveImpact("NOT_IMPACTED");
    expect(() => assertCanResolveImpact("PENDING_ANALYSIS")).toThrow(CoordinationStateError);
  });

  it("builds a stable at-most-one change key shared by companion events", () => {
    const key = impactAnalysisChangeKey({
      correlationId: "corr-1",
      documentId: "doc-1",
      previousRevisionId: null,
      newRevisionId: "rev-2",
    });
    expect(key).toBe("impact-analysis:corr-1:doc-1:none:rev-2");
    expect(
      impactAnalysisChangeKey({
        correlationId: "corr-1",
        documentId: "doc-1",
        previousRevisionId: null,
        newRevisionId: "rev-2",
      }),
    ).toBe(key);
    expect(
      impactAnalysisChangeKey({
        correlationId: "corr-2",
        documentId: "doc-1",
        previousRevisionId: null,
        newRevisionId: "rev-2",
      }),
    ).not.toBe(key);
  });

  it("parses CurrentRevisionChanged identifiers without inventing assessment fields", () => {
    const parsed = parseCurrentRevisionChangedPayload({
      organizationId: "org",
      projectId: "proj",
      documentId: "doc",
      previousRevisionId: null,
      newRevisionId: "rev",
      actorUserId: "user",
      isRollback: false,
    });
    expect(parsed.newRevisionId).toBe("rev");
    expect(parsed).not.toHaveProperty("assessmentResult");
    expect(() => parseCurrentRevisionChangedPayload({ documentId: "doc" })).toThrow(CoordinationStateError);
  });
});
