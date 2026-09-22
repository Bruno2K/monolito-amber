export interface OutboxEnvelope<T = unknown> {
  eventType: string;
  payload: T;
  correlationId: string;
}

/**
 * CurrentRevisionChanged MUST auto-create an Impact Analysis case (PENDING_ANALYSIS).
 * It must NOT auto-mark IMPACTED or auto-create Issues (Final Reconciliation).
 * Handler implementation belongs to the Coordination slice — foundation only stores the event.
 */
export const OUTBOX_EVENT_TYPES = {
  RevisionPublished: "RevisionPublished",
  RevisionApproved: "RevisionApproved",
  RevisionRejected: "RevisionRejected",
  CurrentRevisionChanged: "CurrentRevisionChanged",
  NewBaseEstablished: "NewBaseEstablished",
  DocumentArchived: "DocumentArchived",
  NotificationRequested: "NotificationRequested",
} as const;

/**
 * PF-1.3 emits CurrentRevisionChanged / NewBaseEstablished with identifiers only.
 * Coordination (0.4) owns Impact Analysis auto-create. This slice must not
 * create Impact or Issue rows.
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
