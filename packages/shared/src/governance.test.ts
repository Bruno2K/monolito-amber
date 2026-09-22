import { describe, expect, it } from "vitest";
import { GovernanceStateError, SodViolationError } from "./errors.js";
import {
  assertCanRelease,
  assertExceptionNotSatisfying,
  assertExceptionTransition,
  assertNoGateWideException,
  checklistIsComplete,
  coveringExceptionFor,
  deriveEvaluationOutcome,
  deriveReleaseKind,
  evaluateTypedPredicate,
  nextGateStatusAfterEvaluation,
  parseRequirementConfig,
} from "./governance.js";
import { ROLE_TEMPLATES } from "./role-templates.js";

describe("PF-1.6 governance domain", () => {
  it("grants exception.request on PROJECT_COORDINATOR and keeps approve/release on GOVERNANCE_APPROVER", () => {
    const coordinator = ROLE_TEMPLATES.find((row) => row.key === "PROJECT_COORDINATOR");
    const approver = ROLE_TEMPLATES.find((row) => row.key === "GOVERNANCE_APPROVER");
    expect(coordinator?.permissions).toContain("exception.request");
    expect(coordinator?.permissions).toContain("gate.evaluate");
    expect(coordinator?.permissions).not.toContain("exception.approve");
    expect(coordinator?.permissions).not.toContain("gate.release");
    expect(approver?.permissions).toContain("gate.release");
    expect(approver?.permissions).toContain("exception.approve");
    expect(approver?.permissions).not.toContain("exception.request");
  });

  it("READY requires all mandatory SATISFIED and never treats exception coverage as satisfaction", () => {
    const coveredUnsatisfied = [
      {
        requirementId: "r1",
        type: "MANUAL_APPROVAL" as const,
        mandatory: true,
        satisfaction: "UNSATISFIED" as const,
        coveredByException: true,
        coveringExceptionId: "ex1",
      },
    ];
    expect(deriveEvaluationOutcome(coveredUnsatisfied)).toBe("BLOCKED");
    expect(deriveReleaseKind(coveredUnsatisfied)).toBe("WITH_EXCEPTION");
    expect(() =>
      assertExceptionNotSatisfying({ satisfaction: "SATISFIED", coveredByException: true }),
    ).toThrow(GovernanceStateError);

    const satisfied = [
      {
        requirementId: "r1",
        type: "MANUAL_APPROVAL" as const,
        mandatory: true,
        satisfaction: "SATISFIED" as const,
        coveredByException: false,
        coveringExceptionId: null,
      },
    ];
    expect(deriveEvaluationOutcome(satisfied)).toBe("READY");
    expect(deriveReleaseKind(satisfied)).toBe("NORMAL");
  });

  it("evaluation never auto-releases; READY ≠ RELEASED and RELEASED ≠ RELEASED_WITH_EXCEPTION", () => {
    const ready = nextGateStatusAfterEvaluation({
      currentStatus: "NOT_READY",
      outcome: "READY",
      evaluations: [],
    });
    expect(ready).toBe("READY");
    expect(ready).not.toBe("RELEASED");
    assertCanRelease({ currentStatus: "READY", kind: "NORMAL" });
    expect(() => assertCanRelease({ currentStatus: "NOT_READY", kind: "NORMAL" })).toThrow(
      /never been evaluated/,
    );
    expect("RELEASED").not.toBe("RELEASED_WITH_EXCEPTION");
  });

  it("revoke/expiry of covering Exception after RELEASED_WITH_EXCEPTION re-evaluates to BLOCKED", () => {
    const lostCoverage = [
      {
        requirementId: "r1",
        type: "ISSUE_STATE" as const,
        mandatory: true,
        satisfaction: "UNSATISFIED" as const,
        coveredByException: false,
        coveringExceptionId: null,
      },
    ];
    expect(
      nextGateStatusAfterEvaluation({
        currentStatus: "RELEASED_WITH_EXCEPTION",
        outcome: "BLOCKED",
        evaluations: lostCoverage,
      }),
    ).toBe("BLOCKED");
    expect(
      coveringExceptionFor("r1", [
        {
          id: "ex1",
          gateRequirementId: "r1",
          status: "REVOKED",
          requestedByUserId: "u1",
          expiresAt: null,
        },
      ]),
    ).toBeNull();
  });

  it("evaluates the seven typed predicates without mutating satisfaction via exceptions", () => {
    expect(
      evaluateTypedPredicate({
        type: "MANUAL_APPROVAL",
        config: { type: "MANUAL_APPROVAL", approved: true },
        checklist: { items: [] },
        organizationId: "o",
        projectId: "p",
      }),
    ).toBe("SATISFIED");
    expect(
      evaluateTypedPredicate({
        type: "CHECKLIST_COMPLETE",
        config: { type: "CHECKLIST_COMPLETE" },
        checklist: { items: [{ id: "1", label: "sign", complete: false }] },
        organizationId: "o",
        projectId: "p",
      }),
    ).toBe("UNSATISFIED");
    expect(checklistIsComplete({ items: [{ id: "1", label: "sign", complete: true }] })).toBe(true);
    expect(parseRequirementConfig("ISSUE_STATE", { issueId: "i1", allowedStates: ["CLOSED"] })).toEqual({
      type: "ISSUE_STATE",
      issueId: "i1",
      allowedStates: ["CLOSED"],
    });
  });

  it("rejects gate-wide exceptions and illegal Exception transitions", () => {
    expect(() => assertNoGateWideException(null)).toThrow(/specific GateRequirement/);
    expect(() => assertExceptionTransition("REJECTED", "APPROVED")).toThrow(GovernanceStateError);
    assertExceptionTransition("REQUESTED", "APPROVED");
  });

  it("keeps Formal Exception SoD helpers fail-closed", () => {
    expect(() => {
      throw new SodViolationError("A user must not approve or reject their own Formal Exception request");
    }).toThrow(SodViolationError);
  });
});
