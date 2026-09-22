import { describe, expect, it } from "vitest";
import {
  FileIntegrityError,
  NamingValidationError,
  OptimisticLockError,
  ScanFailClosedError,
  SodViolationError,
  applyOptimisticUpdate,
  assertFileAccessAllowed,
  assertNamingValid,
  assertRevisionApprovalSoD,
  assertRevisionMakeCurrentSoD,
  assertTenantBoundObjectKey,
  documentObjectKey,
} from "@amber/shared";

describe("PF-1.3 Document/Revision security floors (fail closed)", () => {
  it("never treats client ids as tenant-bound storage authority", () => {
    const ids = {
      organizationId: "11111111-1111-4111-8111-111111111111",
      projectId: "22222222-2222-4222-8222-222222222222",
      documentId: "33333333-3333-4333-8333-333333333333",
      revisionId: "44444444-4444-4444-8444-444444444444",
    };
    const key = documentObjectKey({ ...ids, fileName: "a.pdf" });
    expect(key).toContain(ids.organizationId);
    expect(() =>
      assertTenantBoundObjectKey(`org/other/project/${ids.projectId}/documents/${ids.documentId}/revisions/${ids.revisionId}/a.pdf`, ids),
    ).toThrow(FileIntegrityError);
  });

  it("enforces publisher SoD, CLEAN-only file access, naming at publish, and CAS", () => {
    expect(() =>
      assertRevisionApprovalSoD({ actorUserId: "p", publishedByUserId: "p" }),
    ).toThrow(SodViolationError);
    expect(() =>
      assertRevisionMakeCurrentSoD({
        actorUserId: "p",
        publishedByUserId: "p",
        revisionStatus: "APPROVED",
      }),
    ).toThrow(SodViolationError);
    expect(() => assertFileAccessAllowed("PENDING", "download")).toThrow(ScanFailClosedError);
    expect(() =>
      assertNamingValid({ documentCode: "", revisionCode: "R1", title: "t" }),
    ).toThrow(NamingValidationError);
    expect(() => applyOptimisticUpdate({ version: 2 }, 1)).toThrow(OptimisticLockError);
  });
});
