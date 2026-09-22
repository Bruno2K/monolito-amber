import { GovernanceStateError } from "./errors.js";
import { isIssueStatus } from "./issue.js";
import {
  deriveMilestoneStatus,
  isMilestoneRecordedStatus,
  isMilestoneStatus,
  isTaskStatus,
} from "./planning.js";
import { assertExceptionDecisionSoD, assertExceptionReleaseSoD } from "./sod.js";

/**
 * Gate current states — APPROVED 0.5 / PF-1.6.
 * NOT_READY = never evaluated.
 * BLOCKED = evaluated with at least one unsatisfied mandatory (coverage does not satisfy).
 * READY = all mandatory SATISFIED only. Exception coverage never produces READY.
 * RELEASED ≠ RELEASED_WITH_EXCEPTION. Evaluation never auto-releases.
 */
export const GATE_STATUSES = [
  "NOT_READY",
  "BLOCKED",
  "READY",
  "RELEASED",
  "RELEASED_WITH_EXCEPTION",
] as const;
export type GateStatus = (typeof GATE_STATUSES)[number];

export const GATE_REQUIREMENT_TYPES = [
  "DOCUMENT_REQUIRED",
  "REVISION_APPROVED",
  "ISSUE_STATE",
  "TASK_STATE",
  "MILESTONE_STATE",
  "MANUAL_APPROVAL",
  "CHECKLIST_COMPLETE",
] as const;
export type GateRequirementType = (typeof GATE_REQUIREMENT_TYPES)[number];

export const SATISFACTION_STATES = ["SATISFIED", "UNSATISFIED"] as const;
export type SatisfactionState = (typeof SATISFACTION_STATES)[number];

export const EXCEPTION_STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "REVOKED"] as const;
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];

export const RELEASE_KINDS = ["NORMAL", "WITH_EXCEPTION"] as const;
export type ReleaseKind = (typeof RELEASE_KINDS)[number];

export interface ChecklistItem {
  id: string;
  label: string;
  complete: boolean;
}

export interface RequirementChecklist {
  items: ChecklistItem[];
}

export type RequirementConfig =
  | { type: "DOCUMENT_REQUIRED"; documentId?: string; documentCode?: string }
  | { type: "REVISION_APPROVED"; documentId: string; revisionId?: string }
  | { type: "ISSUE_STATE"; issueId: string; allowedStates: string[] }
  | { type: "TASK_STATE"; taskId: string; allowedStates: string[] }
  | { type: "MILESTONE_STATE"; milestoneId: string; allowedStates: string[] }
  | { type: "MANUAL_APPROVAL"; approved?: boolean }
  | { type: "CHECKLIST_COMPLETE" };

export interface DocumentSnapshot {
  id: string;
  organizationId: string;
  projectId: string;
  code: string;
  status: string;
  archivedAt: Date | null;
  currentRevisionId: string | null;
}

export interface RevisionSnapshot {
  id: string;
  organizationId: string;
  projectId: string;
  documentId: string;
  status: string;
}

export interface IssueSnapshot {
  id: string;
  organizationId: string;
  projectId: string;
  status: string;
}

export interface TaskSnapshot {
  id: string;
  organizationId: string;
  projectId: string;
  status: string;
}

export interface MilestoneSnapshot {
  id: string;
  organizationId: string;
  projectId: string;
  recordedStatus: string;
  targetDate: Date | null;
  linkedTasksLate: boolean;
}

export interface FormalExceptionSnapshot {
  id: string;
  gateRequirementId: string;
  status: ExceptionStatus;
  requestedByUserId: string;
  expiresAt: Date | null;
}

export interface RequirementEvaluation {
  requirementId: string;
  type: GateRequirementType;
  mandatory: boolean;
  satisfaction: SatisfactionState;
  coveredByException: boolean;
  coveringExceptionId: string | null;
}

export function isGateStatus(value: string): value is GateStatus {
  return (GATE_STATUSES as readonly string[]).includes(value);
}

export function isGateRequirementType(value: string): value is GateRequirementType {
  return (GATE_REQUIREMENT_TYPES as readonly string[]).includes(value);
}

export function isSatisfactionState(value: string): value is SatisfactionState {
  return (SATISFACTION_STATES as readonly string[]).includes(value);
}

export function isExceptionStatus(value: string): value is ExceptionStatus {
  return (EXCEPTION_STATUSES as readonly string[]).includes(value);
}

export function isReleaseKind(value: string): value is ReleaseKind {
  return (RELEASE_KINDS as readonly string[]).includes(value);
}

export function emptyChecklist(): RequirementChecklist {
  return { items: [] };
}

export function parseChecklist(value: unknown): RequirementChecklist {
  if (!value || typeof value !== "object") {
    return emptyChecklist();
  }
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return emptyChecklist();
  }
  return {
    items: items
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item, index) => ({
        id: typeof item.id === "string" && item.id.trim() ? item.id : `item-${index + 1}`,
        label: typeof item.label === "string" ? item.label : "",
        complete: item.complete === true,
      })),
  };
}

export function checklistIsComplete(checklist: RequirementChecklist): boolean {
  return checklist.items.length > 0 && checklist.items.every((item) => item.complete === true);
}

export function parseRequirementConfig(type: GateRequirementType, raw: unknown): RequirementConfig {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  switch (type) {
    case "DOCUMENT_REQUIRED": {
      const documentId = typeof value.documentId === "string" ? value.documentId : undefined;
      const documentCode = typeof value.documentCode === "string" ? value.documentCode : undefined;
      if (!documentId && !documentCode) {
        throw new GovernanceStateError("DOCUMENT_REQUIRED requires documentId or documentCode");
      }
      return { type, documentId, documentCode };
    }
    case "REVISION_APPROVED": {
      if (typeof value.documentId !== "string" || !value.documentId) {
        throw new GovernanceStateError("REVISION_APPROVED requires documentId");
      }
      return {
        type,
        documentId: value.documentId,
        revisionId: typeof value.revisionId === "string" ? value.revisionId : undefined,
      };
    }
    case "ISSUE_STATE": {
      if (typeof value.issueId !== "string" || !value.issueId) {
        throw new GovernanceStateError("ISSUE_STATE requires issueId");
      }
      const allowedStates = Array.isArray(value.allowedStates)
        ? value.allowedStates.filter((state): state is string => typeof state === "string")
        : [];
      if (allowedStates.length === 0 || allowedStates.some((state) => !isIssueStatus(state))) {
        throw new GovernanceStateError("ISSUE_STATE allowedStates must be known Issue statuses");
      }
      return { type, issueId: value.issueId, allowedStates };
    }
    case "TASK_STATE": {
      if (typeof value.taskId !== "string" || !value.taskId) {
        throw new GovernanceStateError("TASK_STATE requires taskId");
      }
      const allowedStates = Array.isArray(value.allowedStates)
        ? value.allowedStates.filter((state): state is string => typeof state === "string")
        : [];
      if (allowedStates.length === 0 || allowedStates.some((state) => !isTaskStatus(state))) {
        throw new GovernanceStateError("TASK_STATE allowedStates must be known Task statuses");
      }
      return { type, taskId: value.taskId, allowedStates };
    }
    case "MILESTONE_STATE": {
      if (typeof value.milestoneId !== "string" || !value.milestoneId) {
        throw new GovernanceStateError("MILESTONE_STATE requires milestoneId");
      }
      const allowedStates = Array.isArray(value.allowedStates)
        ? value.allowedStates.filter((state): state is string => typeof state === "string")
        : [];
      if (allowedStates.length === 0 || allowedStates.some((state) => !isMilestoneStatus(state))) {
        throw new GovernanceStateError("MILESTONE_STATE allowedStates must be known Milestone statuses");
      }
      return { type, milestoneId: value.milestoneId, allowedStates };
    }
    case "MANUAL_APPROVAL":
      return { type, approved: value.approved === true };
    case "CHECKLIST_COMPLETE":
      return { type };
  }
}

export function evaluateTypedPredicate(input: {
  type: GateRequirementType;
  config: RequirementConfig;
  checklist: RequirementChecklist;
  organizationId: string;
  projectId: string;
  document?: DocumentSnapshot | null;
  revision?: RevisionSnapshot | null;
  issue?: IssueSnapshot | null;
  task?: TaskSnapshot | null;
  milestone?: MilestoneSnapshot | null;
}): SatisfactionState {
  switch (input.type) {
    case "DOCUMENT_REQUIRED": {
      const document = input.document;
      if (!document) {
        return "UNSATISFIED";
      }
      if (document.organizationId !== input.organizationId || document.projectId !== input.projectId) {
        return "UNSATISFIED";
      }
      if (document.status === "ARCHIVED" || document.archivedAt) {
        return "UNSATISFIED";
      }
      return "SATISFIED";
    }
    case "REVISION_APPROVED": {
      const revision = input.revision;
      const document = input.document;
      if (!revision || !document) {
        return "UNSATISFIED";
      }
      if (
        revision.organizationId !== input.organizationId ||
        revision.projectId !== input.projectId ||
        document.organizationId !== input.organizationId ||
        document.projectId !== input.projectId ||
        revision.documentId !== document.id
      ) {
        return "UNSATISFIED";
      }
      return revision.status === "APPROVED" ? "SATISFIED" : "UNSATISFIED";
    }
    case "ISSUE_STATE": {
      const config = input.config;
      if (config.type !== "ISSUE_STATE" || !input.issue) {
        return "UNSATISFIED";
      }
      if (input.issue.organizationId !== input.organizationId || input.issue.projectId !== input.projectId) {
        return "UNSATISFIED";
      }
      return config.allowedStates.includes(input.issue.status) ? "SATISFIED" : "UNSATISFIED";
    }
    case "TASK_STATE": {
      const config = input.config;
      if (config.type !== "TASK_STATE" || !input.task) {
        return "UNSATISFIED";
      }
      if (input.task.organizationId !== input.organizationId || input.task.projectId !== input.projectId) {
        return "UNSATISFIED";
      }
      return config.allowedStates.includes(input.task.status) ? "SATISFIED" : "UNSATISFIED";
    }
    case "MILESTONE_STATE": {
      const config = input.config;
      if (config.type !== "MILESTONE_STATE" || !input.milestone) {
        return "UNSATISFIED";
      }
      if (
        input.milestone.organizationId !== input.organizationId ||
        input.milestone.projectId !== input.projectId
      ) {
        return "UNSATISFIED";
      }
      const recorded = isMilestoneRecordedStatus(input.milestone.recordedStatus)
        ? input.milestone.recordedStatus
        : "PLANNED";
      const derived = deriveMilestoneStatus({
        recordedStatus: recorded,
        targetDate: input.milestone.targetDate,
        linkedTasksLate: input.milestone.linkedTasksLate,
      });
      return config.allowedStates.includes(derived) ? "SATISFIED" : "UNSATISFIED";
    }
    case "MANUAL_APPROVAL":
      return input.config.type === "MANUAL_APPROVAL" && input.config.approved === true
        ? "SATISFIED"
        : "UNSATISFIED";
    case "CHECKLIST_COMPLETE":
      return checklistIsComplete(input.checklist) ? "SATISFIED" : "UNSATISFIED";
  }
}

export function isActiveExceptionCoverage(
  exception: FormalExceptionSnapshot,
  requirementId: string,
  now = new Date(),
): boolean {
  if (exception.gateRequirementId !== requirementId) {
    return false;
  }
  if (exception.status !== "APPROVED") {
    return false;
  }
  if (exception.expiresAt && exception.expiresAt.getTime() <= now.getTime()) {
    return false;
  }
  return true;
}

export function coveringExceptionFor(
  requirementId: string,
  exceptions: readonly FormalExceptionSnapshot[],
  now = new Date(),
): FormalExceptionSnapshot | null {
  return (
    exceptions.find((exception) => isActiveExceptionCoverage(exception, requirementId, now)) ?? null
  );
}

/**
 * READY only when every mandatory requirement is SATISFIED.
 * Exception coverage is recorded separately and never flips satisfaction.
 */
export function deriveEvaluationOutcome(
  evaluations: readonly RequirementEvaluation[],
): Exclude<GateStatus, "RELEASED" | "RELEASED_WITH_EXCEPTION"> {
  const mandatory = evaluations.filter((row) => row.mandatory);
  if (mandatory.length === 0) {
    return "READY";
  }
  if (mandatory.every((row) => row.satisfaction === "SATISFIED")) {
    return "READY";
  }
  return "BLOCKED";
}

export function deriveReleaseKind(evaluations: readonly RequirementEvaluation[]): ReleaseKind | null {
  const outcome = deriveEvaluationOutcome(evaluations);
  if (outcome === "READY") {
    return "NORMAL";
  }
  const uncovered = evaluations.filter(
    (row) => row.mandatory && row.satisfaction !== "SATISFIED" && !row.coveredByException,
  );
  if (uncovered.length > 0) {
    return null;
  }
  const used = evaluations.filter(
    (row) => row.mandatory && row.satisfaction !== "SATISFIED" && row.coveredByException,
  );
  return used.length > 0 ? "WITH_EXCEPTION" : null;
}

/**
 * Preserve historical RELEASED / RELEASED_WITH_EXCEPTION until coverage or
 * satisfaction no longer supports them. Evaluation never writes a release.
 */
export function nextGateStatusAfterEvaluation(input: {
  currentStatus: GateStatus;
  outcome: Exclude<GateStatus, "RELEASED" | "RELEASED_WITH_EXCEPTION">;
  evaluations: readonly RequirementEvaluation[];
}): GateStatus {
  if (input.currentStatus === "RELEASED") {
    return input.outcome === "READY" ? "RELEASED" : "BLOCKED";
  }
  if (input.currentStatus === "RELEASED_WITH_EXCEPTION") {
    if (input.outcome === "READY") {
      return "RELEASED_WITH_EXCEPTION";
    }
    return deriveReleaseKind(input.evaluations) === "WITH_EXCEPTION"
      ? "RELEASED_WITH_EXCEPTION"
      : "BLOCKED";
  }
  return input.outcome;
}

const EXCEPTION_TRANSITIONS: Record<ExceptionStatus, readonly ExceptionStatus[]> = {
  REQUESTED: ["APPROVED", "REJECTED"],
  APPROVED: ["REVOKED"],
  REJECTED: [],
  REVOKED: [],
};

export function assertExceptionTransition(from: ExceptionStatus, to: ExceptionStatus): void {
  if (!EXCEPTION_TRANSITIONS[from].includes(to)) {
    throw new GovernanceStateError(`Formal Exception cannot transition from ${from} to ${to}`);
  }
}

export function assertExceptionNotSatisfying(input: {
  satisfaction: SatisfactionState;
  coveredByException: boolean;
}): void {
  if (input.coveredByException && input.satisfaction === "SATISFIED") {
    throw new GovernanceStateError("Formal Exception must not mark a requirement SATISFIED");
  }
}

export function assertCanRelease(input: {
  currentStatus: GateStatus;
  kind: ReleaseKind | null;
}): asserts input is { currentStatus: GateStatus; kind: ReleaseKind } {
  if (input.currentStatus === "NOT_READY") {
    throw new GovernanceStateError("A Gate that has never been evaluated cannot be released");
  }
  if (input.currentStatus === "RELEASED" || input.currentStatus === "RELEASED_WITH_EXCEPTION") {
    throw new GovernanceStateError("Gate is already released; historical release is immutable");
  }
  if (input.kind === "NORMAL") {
    return;
  }
  if (input.kind === "WITH_EXCEPTION") {
    return;
  }
  throw new GovernanceStateError(
    "Gate cannot be released: mandatory requirements remain UNSATISFIED without an approved Formal Exception",
  );
}

export function assertReleaseSoDForUsedExceptions(input: {
  releaserUserId: string;
  usedExceptions: readonly FormalExceptionSnapshot[];
}): void {
  for (const exception of input.usedExceptions) {
    assertExceptionReleaseSoD({
      releaserUserId: input.releaserUserId,
      requestedByUserId: exception.requestedByUserId,
    });
  }
}

export function assertExceptionDecisionAllowed(input: {
  actorUserId: string;
  requestedByUserId: string;
}): void {
  assertExceptionDecisionSoD(input);
}

export function usedExceptionsForRelease(
  evaluations: readonly RequirementEvaluation[],
  exceptions: readonly FormalExceptionSnapshot[],
): FormalExceptionSnapshot[] {
  const usedIds = new Set(
    evaluations
      .filter((row) => row.mandatory && row.satisfaction !== "SATISFIED" && row.coveringExceptionId)
      .map((row) => row.coveringExceptionId as string),
  );
  return exceptions.filter((exception) => usedIds.has(exception.id));
}

export function assertNoGateWideException(gateRequirementId: string | null | undefined): void {
  if (!gateRequirementId) {
    throw new GovernanceStateError("Formal Exception must target a specific GateRequirement");
  }
}
