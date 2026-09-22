import { CoordinationStateError } from "./errors.js";

/**
 * Issue lifecycle — APPROVED 0.4.
 * RESOLVED ≠ CLOSED. Severity ≠ Priority. Discipline ≠ assignee.
 * Side states REJECTED / CANCELLED / REOPENED are explicit, not inferred.
 */
export const ISSUE_STATUSES = [
  "OPEN",
  "IN_ANALYSIS",
  "IN_PROGRESS",
  "READY_FOR_REVIEW",
  "RESOLVED",
  "CLOSED",
  "REJECTED",
  "CANCELLED",
  "REOPENED",
] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_ORIGINS = ["IMPACT", "MANUAL"] as const;
export type IssueOrigin = (typeof ISSUE_ORIGINS)[number];

export const ISSUE_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "BLOCKER"] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const ISSUE_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

/**
 * Statuses that keep Impact resolve blocked (0.4 §10).
 * RESOLVED still counts as open coordination work until CLOSED.
 */
export const IMPACT_BLOCKING_ISSUE_STATUSES = [
  "OPEN",
  "IN_ANALYSIS",
  "IN_PROGRESS",
  "READY_FOR_REVIEW",
  "RESOLVED",
  "REOPENED",
] as const;

export type ImpactBlockingIssueStatus = (typeof IMPACT_BLOCKING_ISSUE_STATUSES)[number];

const ISSUE_TRANSITIONS: Record<IssueStatus, readonly IssueStatus[]> = {
  OPEN: ["IN_ANALYSIS", "REJECTED", "CANCELLED"],
  IN_ANALYSIS: ["IN_PROGRESS", "REJECTED", "CANCELLED"],
  IN_PROGRESS: ["READY_FOR_REVIEW", "CANCELLED"],
  READY_FOR_REVIEW: ["RESOLVED", "IN_PROGRESS", "CANCELLED"],
  RESOLVED: ["CLOSED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_ANALYSIS", "IN_PROGRESS"],
  REJECTED: [],
  CANCELLED: [],
};

export function isIssueStatus(value: string): value is IssueStatus {
  return (ISSUE_STATUSES as readonly string[]).includes(value);
}

export function isIssueOrigin(value: string): value is IssueOrigin {
  return (ISSUE_ORIGINS as readonly string[]).includes(value);
}

export function isIssueSeverity(value: string): value is IssueSeverity {
  return (ISSUE_SEVERITIES as readonly string[]).includes(value);
}

export function isIssuePriority(value: string): value is IssuePriority {
  return (ISSUE_PRIORITIES as readonly string[]).includes(value);
}

export function assertIssueTransition(from: IssueStatus, to: IssueStatus): void {
  if (!ISSUE_TRANSITIONS[from].includes(to)) {
    throw new CoordinationStateError(`Issue cannot transition from ${from} to ${to}`);
  }
}

export function isImpactBlockingIssueStatus(status: string): boolean {
  return (IMPACT_BLOCKING_ISSUE_STATUSES as readonly string[]).includes(status);
}

export function issueStatusRequiresResolvePermission(to: IssueStatus): boolean {
  return to === "RESOLVED";
}

export function issueStatusRequiresClosePermission(to: IssueStatus): boolean {
  return to === "CLOSED";
}

export function issueStatusRequiresReopenPermission(to: IssueStatus): boolean {
  return to === "REOPENED";
}
