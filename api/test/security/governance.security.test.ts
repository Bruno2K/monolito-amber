import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_PERMISSIONS,
  GovernanceStateError,
  HIGH_RISK_PERMISSIONS,
  PERMISSIONS,
  assertCanRelease,
  deriveEvaluationOutcome,
  deriveReleaseKind,
} from "@amber/shared";

describe("PF-1.6 Governance security floors (fail closed)", () => {
  it("refuses gate.override / forceRelease and keeps READY ≠ RELEASED", () => {
    expect(PERMISSIONS).not.toContain("gate.override");
    expect(FORBIDDEN_PERMISSIONS).toContain("gate.override");
    expect(deriveEvaluationOutcome([])).toBe("READY");
    expect(() => assertCanRelease({ currentStatus: "NOT_READY", kind: "NORMAL" })).toThrow(
      GovernanceStateError,
    );
  });

  it("keeps exception coverage from producing READY or silent satisfaction", () => {
    const covered = [
      {
        requirementId: "r1",
        type: "MANUAL_APPROVAL" as const,
        mandatory: true,
        satisfaction: "UNSATISFIED" as const,
        coveredByException: true,
        coveringExceptionId: "ex1",
      },
    ];
    expect(deriveEvaluationOutcome(covered)).toBe("BLOCKED");
    expect(deriveReleaseKind(covered)).toBe("WITH_EXCEPTION");
    expect(HIGH_RISK_PERMISSIONS).toContain("gate.release");
    expect(HIGH_RISK_PERMISSIONS).toContain("exception.approve");
  });
});
