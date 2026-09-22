import { describe, expect, it } from "vitest";
import { FORBIDDEN_PERMISSIONS, PERMISSIONS } from "./permissions.js";
import { HIGH_RISK_PERMISSIONS } from "./authz.js";
import { IDEMPOTENCY_REQUIRED_OPERATIONS } from "./idempotency.js";
import { ROLE_TEMPLATES } from "./role-templates.js";
import {
  assertCanRelease,
  deriveEvaluationOutcome,
  deriveReleaseKind,
  nextGateStatusAfterEvaluation,
} from "./governance.js";

describe("PF-1.6 governance security floors (fail closed)", () => {
  it("never invents gate.override / forceRelease and keeps the closed catalog", () => {
    expect(PERMISSIONS).not.toContain("gate.override");
    expect(FORBIDDEN_PERMISSIONS).toContain("gate.override");
    expect(PERMISSIONS).toContain("gate.evaluate");
    expect(PERMISSIONS).toContain("gate.release");
    expect(PERMISSIONS).toContain("exception.request");
    expect(ROLE_TEMPLATES.every((template) => !template.permissions.includes("gate.override" as never))).toBe(
      true,
    );
  });

  it("requires MFA recent-auth on exception decisions and gate.release", () => {
    expect(HIGH_RISK_PERMISSIONS).toEqual(
      expect.arrayContaining([
        "exception.approve",
        "exception.reject",
        "exception.revoke",
        "gate.release",
      ]),
    );
    expect(IDEMPOTENCY_REQUIRED_OPERATIONS).toEqual(
      expect.arrayContaining(["exception.request", "exception.approve", "exception.reject", "gate.release"]),
    );
  });

  it("READY ≠ RELEASED and exception coverage cannot silently satisfy", () => {
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
    expect(
      nextGateStatusAfterEvaluation({
        currentStatus: "NOT_READY",
        outcome: "READY",
        evaluations: [],
      }),
    ).toBe("READY");
    expect(() => assertCanRelease({ currentStatus: "READY", kind: "NORMAL" })).not.toThrow();
  });
});
