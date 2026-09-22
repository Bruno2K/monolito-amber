import { OptimisticLockError } from "./errors.js";

/**
 * Optimistic version helper (F-11). Aggregates that mutate under contention
 * carry integer `version`. Compare-and-swap: expected must match current.
 */
export function nextVersion(current: number): number {
  if (!Number.isInteger(current) || current < 1) {
    throw new OptimisticLockError("Invalid current version");
  }
  return current + 1;
}

export function assertVersionMatch(current: number, expected: number): void {
  if (!Number.isInteger(current) || !Number.isInteger(expected)) {
    throw new OptimisticLockError("Version values must be integers");
  }
  if (current !== expected) {
    throw new OptimisticLockError(
      `Optimistic lock conflict: expected version ${expected}, found ${current}`,
    );
  }
}

export function applyOptimisticUpdate<T extends { version: number }>(
  row: T,
  expectedVersion: number,
): T & { version: number } {
  assertVersionMatch(row.version, expectedVersion);
  return { ...row, version: nextVersion(row.version) };
}
