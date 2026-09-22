import { describe, expect, it } from "vitest";
import { SessionExpiredError, SessionRevokedError } from "./errors.js";
import {
  SESSION_ABSOLUTE_MS,
  SESSION_INACTIVE_MS,
  assertSessionUsable,
  revokeSession,
} from "./session.js";

describe("session revocation (fail closed)", () => {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");

  it("rejects a revoked session on subsequent use", () => {
    const revoked = {
      createdAt,
      lastSeenAt: createdAt,
      expiresAt: new Date(createdAt.getTime() + SESSION_ABSOLUTE_MS),
      revokedAt: createdAt,
    };
    expect(() => assertSessionUsable(revoked, new Date(createdAt.getTime() + 1000))).toThrow(
      SessionRevokedError,
    );
  });

  it("honors 12h inactivity and 7d absolute floors", () => {
    const live = {
      createdAt,
      lastSeenAt: createdAt,
      expiresAt: new Date(createdAt.getTime() + SESSION_ABSOLUTE_MS),
      revokedAt: null,
    };
    assertSessionUsable(live, new Date(createdAt.getTime() + 60_000));

    expect(() =>
      assertSessionUsable(live, new Date(createdAt.getTime() + SESSION_INACTIVE_MS + 1)),
    ).toThrow(SessionExpiredError);

    expect(() =>
      assertSessionUsable(live, new Date(createdAt.getTime() + SESSION_ABSOLUTE_MS + 1)),
    ).toThrow(SessionExpiredError);
  });

  it("logout writes revocation that invalidates later use", () => {
    const now = new Date();
    const revocation = revokeSession(now, "logout");
    expect(revocation.revokedAt).toEqual(now);
    expect(() =>
      assertSessionUsable(
        {
          createdAt: now,
          lastSeenAt: now,
          expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
          revokedAt: revocation.revokedAt,
        },
        new Date(now.getTime() + 1),
      ),
    ).toThrow(SessionRevokedError);
  });
});
