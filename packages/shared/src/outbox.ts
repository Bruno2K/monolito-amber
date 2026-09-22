export interface OutboxEnvelope<T = unknown> {
  eventType: string;
  payload: T;
  correlationId: string;
}

/**
 * CurrentRevisionChanged MUST auto-create an Impact Analysis case (PENDING_ANALYSIS).
 * It must NOT auto-mark IMPACTED or auto-create Issues (Final Reconciliation).
 * PF-1.4 Coordination consumes the event via the existing transactional outbox
 * (in-process sync drain — no Redis/BullMQ for this slice).
 */
export const OUTBOX_EVENT_TYPES = {
  RevisionPublished: "RevisionPublished",
  RevisionApproved: "RevisionApproved",
  RevisionRejected: "RevisionRejected",
  CurrentRevisionChanged: "CurrentRevisionChanged",
  NewBaseEstablished: "NewBaseEstablished",
  DocumentArchived: "DocumentArchived",
  NotificationRequested: "NotificationRequested",
  ImpactIdentified: "ImpactIdentified",
  ImpactResolved: "ImpactResolved",
  IssueCreated: "IssueCreated",
  IssueAssigned: "IssueAssigned",
  IssueReadyForReview: "IssueReadyForReview",
  IssueClosed: "IssueClosed",
  IssueReopened: "IssueReopened",
  TaskCreated: "TaskCreated",
  TaskAssigned: "TaskAssigned",
  TaskBlocked: "TaskBlocked",
  TaskCompleted: "TaskCompleted",
  MilestoneCreated: "MilestoneCreated",
  MilestoneAchieved: "MilestoneAchieved",
  GateReleased: "GateReleased",
  GateReleasedWithException: "GateReleasedWithException",
  ExceptionApproved: "ExceptionApproved",
  ExceptionRevoked: "ExceptionRevoked",
} as const;

/**
 * PF-1.3 emits CurrentRevisionChanged / NewBaseEstablished with identifiers only.
 * PF-1.4 Coordination consumes those events to create exactly one PENDING_ANALYSIS
 * case per change event. The payload contract is unchanged.
 */
export interface CurrentRevisionChangedPayload {
  organizationId: string;
  projectId: string;
  documentId: string;
  previousRevisionId: string | null;
  newRevisionId: string;
  actorUserId: string;
  reason?: string;
  isRollback: boolean;
}

export function createOutboxEnvelope<T>(
  eventType: string,
  payload: T,
  correlationId: string,
): OutboxEnvelope<T> {
  return { eventType, payload, correlationId };
}

export interface JobIdempotencyHook {
  jobKey: string;
}

export function jobIdempotencyKey(jobName: string, naturalKey: string): string {
  return `${jobName}:${naturalKey}`;
}
