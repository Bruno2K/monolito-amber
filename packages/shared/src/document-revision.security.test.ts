import { describe, expect, it } from "vitest";
import { ScanFailClosedError, SodViolationError } from "./errors.js";
import { assertRevisionApprovalSoD, assertRevisionMakeCurrentSoD } from "./sod.js";
import { assertFileAccessAllowed } from "./scan-status.js";
import { applyOptimisticUpdate } from "./optimistic-version.js";
import { assertCanMakeCurrent, isHistoricalApproved } from "./revision.js";

describe("Document/Revision security floors (fail closed)", () => {
  it("blocks publisher SoD on approve/reject/make-current", () => {
    expect(() =>
      assertRevisionApprovalSoD({ actorUserId: "publisher", publishedByUserId: "publisher" }),
    ).toThrow(SodViolationError);
    expect(() =>
      assertRevisionMakeCurrentSoD({
        actorUserId: "publisher",
        publishedByUserId: "publisher",
        revisionStatus: "APPROVED",
      }),
    ).toThrow(SodViolationError);
  });

  it("keeps currentness on the pointer so historical APPROVED can roll back", () => {
    assertCanMakeCurrent("APPROVED");
    expect(
      isHistoricalApproved({
        status: "APPROVED",
        revisionId: "older",
        currentRevisionId: "newer",
      }),
    ).toBe(true);
  });

  it("fails closed on file trust and CAS last-write-wins", () => {
    expect(() => assertFileAccessAllowed("PENDING", "download")).toThrow(ScanFailClosedError);
    expect(() => assertFileAccessAllowed("BLOCKED", "preview")).toThrow(ScanFailClosedError);
    expect(() => applyOptimisticUpdate({ version: 4 }, 3)).toThrow(/Optimistic lock/);
  });
});
