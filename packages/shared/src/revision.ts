import { ImmutableRevisionError, RevisionStateError } from "./errors.js";

/**
 * Revision lifecycle from APPROVED 0.3.
 * Currentness is NOT a status — it lives on Document.currentRevisionId.
 * There is no terminal SUPERSEDED status that would block rollback.
 */
export const REVISION_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
] as const;

export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export const DOCUMENT_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

const TRANSITIONS: Record<RevisionStatus, readonly RevisionStatus[]> = {
  DRAFT: ["PUBLISHED"],
  PUBLISHED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: [],
  REJECTED: [],
};

export function isRevisionStatus(value: string): value is RevisionStatus {
  return (REVISION_STATUSES as readonly string[]).includes(value);
}

export function isDocumentStatus(value: string): value is DocumentStatus {
  return (DOCUMENT_STATUSES as readonly string[]).includes(value);
}

export function assertRevisionTransition(from: RevisionStatus, to: RevisionStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new RevisionStateError(`Revision cannot transition from ${from} to ${to}`);
  }
}

export function isDraftMutable(status: RevisionStatus): boolean {
  return status === "DRAFT";
}

export function isPublishedImmutable(status: RevisionStatus): boolean {
  return status !== "DRAFT";
}

export function assertDraftMutable(status: RevisionStatus): void {
  if (!isDraftMutable(status)) {
    throw new ImmutableRevisionError(
      `Revision is ${status}; published content and identity fields are immutable`,
    );
  }
}

export function assertCanPublish(status: RevisionStatus): void {
  assertRevisionTransition(status, "PUBLISHED");
}

export function assertCanReview(status: RevisionStatus): void {
  assertRevisionTransition(status, "UNDER_REVIEW");
}

export function assertCanApprove(status: RevisionStatus): void {
  assertRevisionTransition(status, "APPROVED");
}

export function assertCanReject(status: RevisionStatus): void {
  assertRevisionTransition(status, "REJECTED");
}

export function assertCanMakeCurrent(status: RevisionStatus): void {
  if (status !== "APPROVED") {
    throw new RevisionStateError("Only an APPROVED Revision may become current");
  }
}

export function isHistoricalApproved(input: {
  status: RevisionStatus;
  revisionId: string;
  currentRevisionId: string | null;
}): boolean {
  return input.status === "APPROVED" && input.currentRevisionId !== input.revisionId;
}

export function isRollbackToOlderApproved(input: {
  targetPublishedAt: Date | string;
  currentPublishedAt: Date | string | null;
}): boolean {
  if (!input.currentPublishedAt) {
    return false;
  }
  return new Date(input.targetPublishedAt).getTime() < new Date(input.currentPublishedAt).getTime();
}
