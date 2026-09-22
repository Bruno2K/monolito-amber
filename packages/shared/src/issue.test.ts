import { describe, expect, it } from "vitest";
import { CoordinationStateError } from "./errors.js";
import {
  IMPACT_BLOCKING_ISSUE_STATUSES,
  ISSUE_PRIORITIES,
  ISSUE_SEVERITIES,
  assertIssueTransition,
  isImpactBlockingIssueStatus,
  isIssuePriority,
  isIssueSeverity,
  issueStatusRequiresClosePermission,
  issueStatusRequiresReopenPermission,
  issueStatusRequiresResolvePermission,
} from "./issue.js";

describe("Issue state machine", () => {
  it("encodes OPEN → IN_ANALYSIS → IN_PROGRESS → READY_FOR_REVIEW → RESOLVED → CLOSED", () => {
    assertIssueTransition("OPEN", "IN_ANALYSIS");
    assertIssueTransition("IN_ANALYSIS", "IN_PROGRESS");
    assertIssueTransition("IN_PROGRESS", "READY_FOR_REVIEW");
    assertIssueTransition("READY_FOR_REVIEW", "RESOLVED");
    assertIssueTransition("RESOLVED", "CLOSED");
    expect(() => assertIssueTransition("OPEN", "RESOLVED")).toThrow(CoordinationStateError);
    expect(() => assertIssueTransition("RESOLVED", "OPEN")).toThrow(CoordinationStateError);
    expect(() => assertIssueTransition("CLOSED", "RESOLVED")).toThrow(CoordinationStateError);
  });

  it("keeps RESOLVED distinct from CLOSED and allows CLOSED → REOPENED", () => {
    expect(issueStatusRequiresResolvePermission("RESOLVED")).toBe(true);
    expect(issueStatusRequiresClosePermission("CLOSED")).toBe(true);
    expect(issueStatusRequiresClosePermission("RESOLVED")).toBe(false);
    expect(issueStatusRequiresReopenPermission("REOPENED")).toBe(true);
    assertIssueTransition("CLOSED", "REOPENED");
    assertIssueTransition("REOPENED", "IN_PROGRESS");
    assertIssueTransition("READY_FOR_REVIEW", "IN_PROGRESS");
  });

  it("keeps Severity and Priority as separate catalogs", () => {
    expect(ISSUE_SEVERITIES).toEqual(["LOW", "MEDIUM", "HIGH", "BLOCKER"]);
    expect(ISSUE_PRIORITIES).toEqual(["LOW", "NORMAL", "HIGH", "URGENT"]);
    expect(isIssueSeverity("BLOCKER")).toBe(true);
    expect(isIssuePriority("BLOCKER")).toBe(false);
    expect(isIssuePriority("URGENT")).toBe(true);
    expect(isIssueSeverity("URGENT")).toBe(false);
  });

  it("treats RESOLVED Issues as still blocking Impact resolve", () => {
    expect(IMPACT_BLOCKING_ISSUE_STATUSES).toContain("RESOLVED");
    expect(isImpactBlockingIssueStatus("RESOLVED")).toBe(true);
    expect(isImpactBlockingIssueStatus("CLOSED")).toBe(false);
    expect(isImpactBlockingIssueStatus("CANCELLED")).toBe(false);
    expect(isImpactBlockingIssueStatus("REJECTED")).toBe(false);
  });
});
