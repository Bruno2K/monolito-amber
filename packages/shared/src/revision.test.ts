import { describe, expect, it } from "vitest";
import { ImmutableRevisionError, RevisionStateError } from "./errors.js";
import {
  assertCanApprove,
  assertCanMakeCurrent,
  assertCanPublish,
  assertCanReject,
  assertCanReview,
  assertDraftMutable,
  isHistoricalApproved,
  isPublishedImmutable,
  isRollbackToOlderApproved,
} from "./revision.js";

describe("Revision lifecycle (0.3)", () => {
  it("allows DRAFT → PUBLISHED → UNDER_REVIEW → APPROVED|REJECTED", () => {
    assertCanPublish("DRAFT");
    assertCanReview("PUBLISHED");
    assertCanApprove("UNDER_REVIEW");
    assertCanReject("UNDER_REVIEW");
  });

  it("rejects illegal transitions and keeps REJECTED preserved", () => {
    expect(() => assertCanPublish("PUBLISHED")).toThrow(RevisionStateError);
    expect(() => assertCanApprove("PUBLISHED")).toThrow(RevisionStateError);
    expect(() => assertCanApprove("APPROVED")).toThrow(RevisionStateError);
    expect(() => assertCanPublish("REJECTED")).toThrow(RevisionStateError);
    expect(() => assertCanApprove("REJECTED")).toThrow(RevisionStateError);
  });

  it("treats DRAFT as mutable and every later status as immutable", () => {
    assertDraftMutable("DRAFT");
    expect(isPublishedImmutable("PUBLISHED")).toBe(true);
    expect(() => assertDraftMutable("PUBLISHED")).toThrow(ImmutableRevisionError);
    expect(() => assertDraftMutable("APPROVED")).toThrow(ImmutableRevisionError);
  });

  it("makes currentness a pointer, not a SUPERSEDED status", () => {
    assertCanMakeCurrent("APPROVED");
    expect(() => assertCanMakeCurrent("PUBLISHED")).toThrow(RevisionStateError);
    expect(
      isHistoricalApproved({
        status: "APPROVED",
        revisionId: "r1",
        currentRevisionId: "r2",
      }),
    ).toBe(true);
    expect(
      isHistoricalApproved({
        status: "APPROVED",
        revisionId: "r2",
        currentRevisionId: "r2",
      }),
    ).toBe(false);
    expect(
      isRollbackToOlderApproved({
        targetPublishedAt: "2026-01-01T00:00:00.000Z",
        currentPublishedAt: "2026-06-01T00:00:00.000Z",
      }),
    ).toBe(true);
  });
});
