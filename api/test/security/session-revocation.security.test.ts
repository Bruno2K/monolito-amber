import { describe, expect, it } from "vitest";
import { SESSION_ABSOLUTE_MS, assertSessionUsable } from "@amber/shared";

describe("API session revocation stub", () => {
  it("revoked sessions cannot be reused", () => {
    const now = new Date();
    expect(() =>
      assertSessionUsable({
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
        revokedAt: now,
      }),
    ).toThrow();
  });
});
