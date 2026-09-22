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
  CurrentRevisionChanged: "CurrentRevisionChanged",
  NotificationRequested: "NotificationRequested",
} as const;

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
