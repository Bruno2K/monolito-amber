import { describe, expect, it } from "vitest";
import { hashToken, randomToken, redactSecrets, tokensEqual } from "./tokens.js";

describe("opaque tokens", () => {
  it("hashes tokens and compares them in constant-ish time", () => {
    const token = randomToken();
    const hashed = hashToken(token);
    expect(hashed).not.toEqual(token);
    expect(tokensEqual(hashed, hashToken(token))).toBe(true);
    expect(tokensEqual(hashed, hashToken("other"))).toBe(false);
  });

  it("redacts secrets from audit payloads", () => {
    const redacted = redactSecrets({
      email: "a@example.com",
      password: "super-secret-password",
      nested: { token: "invite-token", ok: true },
      downloadUrl: "https://example.invalid/signed",
    });
    expect(redacted.email).toBe("a@example.com");
    expect(redacted.password).toBe("[redacted]");
    expect((redacted.nested as Record<string, unknown>).token).toBe("[redacted]");
    expect((redacted.nested as Record<string, unknown>).ok).toBe(true);
    expect(redacted.downloadUrl).toBe("[redacted]");
  });
});
