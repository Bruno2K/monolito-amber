import { createHash } from "node:crypto";
import { IdempotencyConflictError, IdempotencyRequiredError } from "./errors.js";

export interface IdempotencyRecordView {
  key: string;
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
}

export function hashIdempotentRequest(body: unknown): string {
  const canonical = JSON.stringify(body ?? null);
  return createHash("sha256").update(canonical).digest("hex");
}

export function replayOrConflict(
  existing: IdempotencyRecordView | null,
  key: string,
  requestHash: string,
): IdempotencyRecordView | null {
  if (!existing) {
    return null;
  }
  if (existing.key !== key) {
    throw new IdempotencyConflictError("Idempotency record key mismatch");
  }
  if (existing.requestHash !== requestHash) {
    throw new IdempotencyConflictError();
  }
  return existing;
}

/** Operations that require Idempotency-Key at the API boundary (0.7 / F-11). */
export const IDEMPOTENCY_REQUIRED_OPERATIONS = [
  "revision.publish",
  "revision.approve",
  "revision.reject",
  "revision.make_current",
  "gate.release",
  "exception.approve",
] as const;

export function requireIdempotencyKey(value: string | undefined | null): string {
  const key = value?.trim();
  if (!key) {
    throw new IdempotencyRequiredError();
  }
  if (key.length > 200) {
    throw new IdempotencyRequiredError("Idempotency-Key exceeds maximum length");
  }
  return key;
}
