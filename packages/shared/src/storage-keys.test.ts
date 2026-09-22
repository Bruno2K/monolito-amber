import { describe, expect, it } from "vitest";
import { FileIntegrityError } from "./errors.js";
import { assertTenantBoundObjectKey, documentObjectKey } from "./storage-keys.js";

describe("tenant-bound object keys", () => {
  const ids = {
    organizationId: "11111111-1111-4111-8111-111111111111",
    projectId: "22222222-2222-4222-8222-222222222222",
    documentId: "33333333-3333-4333-8333-333333333333",
    revisionId: "44444444-4444-4444-8444-444444444444",
  };

  it("embeds org/project/document/revision and never uses filename as identity", () => {
    const key = documentObjectKey({ ...ids, fileName: "model.rvt" });
    expect(key).toBe(
      `org/${ids.organizationId}/project/${ids.projectId}/documents/${ids.documentId}/revisions/${ids.revisionId}/model.rvt`,
    );
    assertTenantBoundObjectKey(key, ids);
  });

  it("rejects traversal and cross-tenant keys", () => {
    expect(() => documentObjectKey({ ...ids, fileName: "../x.pdf" })).toThrow(FileIntegrityError);
    expect(() =>
      assertTenantBoundObjectKey("org/other/project/p/documents/d/revisions/r/f.pdf", ids),
    ).toThrow(FileIntegrityError);
  });
});
