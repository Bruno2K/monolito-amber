import { describe, expect, it } from "vitest";
import { IdempotencyConflictError, OptimisticLockError } from "./errors.js";
import { applyOptimisticUpdate } from "./optimistic-version.js";
import { hashIdempotentRequest, replayOrConflict } from "./idempotency.js";

describe("F-11 CAS + Idempotency-Key (fail closed)", () => {
  it("rejects last-write-wins on version mismatch", () => {
    expect(() => applyOptimisticUpdate({ version: 3, id: "doc" }, 2)).toThrow(OptimisticLockError);
    expect(applyOptimisticUpdate({ version: 3, id: "doc" }, 3).version).toBe(4);
  });

  it("replays identical Idempotency-Key and conflicts on body mismatch", () => {
    const body = { action: "make-current", revisionId: "r1" };
    const hash = hashIdempotentRequest(body);
    const stored = {
      key: "k1",
      requestHash: hash,
      responseStatus: 200,
      responseBody: { ok: true },
    };
    expect(replayOrConflict(null, "k1", hash)).toBeNull();
    expect(replayOrConflict(stored, "k1", hash)?.responseStatus).toBe(200);
    expect(() => replayOrConflict(stored, "k1", hashIdempotentRequest({ other: true }))).toThrow(
      IdempotencyConflictError,
    );
  });
});
