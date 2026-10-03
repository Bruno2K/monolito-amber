import { redactMessageProjection } from "@amber/shared";
import { describe, expect, it } from "vitest";
import {
  clampPageSize,
  decodeCursor,
  decodeStoredBody,
  encodeCursor,
  encodeStoredBody,
  extractInlineLinks,
  messageLifecycle,
  snippetFromText,
} from "./messaging.codec";

describe("messaging codec", () => {
  it("round-trips cursors and clamps page size", () => {
    const cursor = { createdAt: "2026-10-02T10:00:00.000Z", id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(clampPageSize("0")).toBe(50);
    expect(clampPageSize("250")).toBe(100);
    expect(clampPageSize("12")).toBe(12);
  });

  it("stores resource links without changing visible text", () => {
    const stored = encodeStoredBody("see this task", [
      { type: "TASK", id: "11111111-1111-4111-8111-111111111111" },
    ]);
    const decoded = decodeStoredBody(stored);
    expect(decoded.text).toBe("see this task");
    expect(decoded.links).toEqual([{ type: "TASK", id: "11111111-1111-4111-8111-111111111111" }]);
    expect(extractInlineLinks("amber://GATE/22222222-2222-4222-8222-222222222222")).toEqual([
      { type: "GATE", id: "22222222-2222-4222-8222-222222222222" },
    ]);
  });

  it("derives lifecycle and authorized-only snippets", () => {
    expect(messageLifecycle({ editedAt: null, deletedAt: null })).toBe("VISIBLE");
    expect(messageLifecycle({ editedAt: new Date(), deletedAt: null })).toBe("EDITED");
    expect(messageLifecycle({ editedAt: null, deletedAt: new Date() })).toBe("TOMBSTONED");
    expect(snippetFromText("alpha secret-token omega", "secret-token")).toContain("secret-token");
    expect(snippetFromText("short")).toBe("short");
  });

  it("redacts a non-empty tombstoned body and drops protected previews", () => {
    const stored = encodeStoredBody("segredo do shaft", [
      { type: "TASK", id: "11111111-1111-4111-8111-111111111111" },
    ]);
    expect(stored.trim().length).toBeGreaterThan(0);
    const projected = redactMessageProjection({
      body: stored,
      editedAt: null,
      deletedAt: new Date("2026-10-02T16:20:00.000Z"),
      authorOrganizationMembershipId: "author-1",
      resourcePreviews: [
        { type: "TASK", id: "11111111-1111-4111-8111-111111111111", authorized: true, title: "Clash secreto", projectId: "p1" },
      ],
    });
    expect(projected.body).toBeNull();
    expect(projected.lifecycle).toBe("TOMBSTONED");
    expect(projected.lifecycle).toBe(messageLifecycle({ editedAt: null, deletedAt: new Date() }));
    expect(projected.authorOrganizationMembershipId).toBe("author-1");
    expect(projected.resourcePreviews).toEqual([]);
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("segredo do shaft");
    expect(serialized).not.toContain("Clash secreto");
    expect(serialized).not.toContain("11111111-1111-4111-8111-111111111111");
  });
});
