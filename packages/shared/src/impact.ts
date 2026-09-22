import { CoordinationStateError } from "./errors.js";

/**
 * Impact Analysis case lifecycle — APPROVED 0.4 + Final Reconciliation.
 * Auto-created as PENDING_ANALYSIS on CurrentRevisionChanged / NewBaseEstablished.
 * Never auto-IMPACTED. Assessment is always explicit.
 */
export const IMPACT_STATUSES = [
  "PENDING_ANALYSIS",
  "IMPACTED",
  "NOT_IMPACTED",
  "RESOLVED",
] as const;

export type ImpactStatus = (typeof IMPACT_STATUSES)[number];

export const IMPACT_ASSESSMENT_RESULTS = ["IMPACTED", "NOT_IMPACTED"] as const;
export type ImpactAssessmentResult = (typeof IMPACT_ASSESSMENT_RESULTS)[number];

const IMPACT_TRANSITIONS: Record<ImpactStatus, readonly ImpactStatus[]> = {
  PENDING_ANALYSIS: ["IMPACTED", "NOT_IMPACTED"],
  IMPACTED: ["RESOLVED"],
  NOT_IMPACTED: ["RESOLVED"],
  RESOLVED: [],
};

export function isImpactStatus(value: string): value is ImpactStatus {
  return (IMPACT_STATUSES as readonly string[]).includes(value);
}

export function isImpactAssessmentResult(value: string): value is ImpactAssessmentResult {
  return (IMPACT_ASSESSMENT_RESULTS as readonly string[]).includes(value);
}

export function assertImpactTransition(from: ImpactStatus, to: ImpactStatus): void {
  if (!IMPACT_TRANSITIONS[from].includes(to)) {
    throw new CoordinationStateError(`Impact Analysis cannot transition from ${from} to ${to}`);
  }
}

export function assertCanAssessImpact(status: ImpactStatus): void {
  if (status !== "PENDING_ANALYSIS") {
    throw new CoordinationStateError(`Impact Analysis can only be assessed from PENDING_ANALYSIS (found ${status})`);
  }
}

export function assertCanResolveImpact(status: ImpactStatus): void {
  if (status !== "IMPACTED" && status !== "NOT_IMPACTED") {
    throw new CoordinationStateError(`Impact Analysis can only be resolved from IMPACTED or NOT_IMPACTED (found ${status})`);
  }
}

/**
 * At-most-one Impact Analysis case per make-current change event.
 * Both CurrentRevisionChanged and NewBaseEstablished share this key.
 */
export function impactAnalysisChangeKey(input: {
  correlationId: string;
  documentId: string;
  previousRevisionId: string | null;
  newRevisionId: string;
}): string {
  return [
    "impact-analysis",
    input.correlationId,
    input.documentId,
    input.previousRevisionId ?? "none",
    input.newRevisionId,
  ].join(":");
}

export function parseCurrentRevisionChangedPayload(payload: unknown): {
  organizationId: string;
  projectId: string;
  documentId: string;
  previousRevisionId: string | null;
  newRevisionId: string;
  actorUserId: string;
  reason?: string;
  isRollback: boolean;
} {
  if (!payload || typeof payload !== "object") {
    throw new CoordinationStateError("CurrentRevisionChanged payload is not an object");
  }
  const row = payload as Record<string, unknown>;
  const organizationId = typeof row.organizationId === "string" ? row.organizationId : "";
  const projectId = typeof row.projectId === "string" ? row.projectId : "";
  const documentId = typeof row.documentId === "string" ? row.documentId : "";
  const newRevisionId = typeof row.newRevisionId === "string" ? row.newRevisionId : "";
  const actorUserId = typeof row.actorUserId === "string" ? row.actorUserId : "";
  if (!organizationId || !projectId || !documentId || !newRevisionId || !actorUserId) {
    throw new CoordinationStateError("CurrentRevisionChanged payload is missing required identifiers");
  }
  return {
    organizationId,
    projectId,
    documentId,
    previousRevisionId: typeof row.previousRevisionId === "string" ? row.previousRevisionId : null,
    newRevisionId,
    actorUserId,
    reason: typeof row.reason === "string" ? row.reason : undefined,
    isRollback: row.isRollback === true,
  };
}
