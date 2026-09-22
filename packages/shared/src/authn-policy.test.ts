import { describe, expect, it } from "vitest";
import { PasswordPolicyError, PublicRegistrationDisabledError } from "./errors.js";
import {
  assertBootstrapRegistrationAllowed,
  assertPasswordPolicy,
  evaluateLockout,
  isAccountLocked,
  requiredPasswordAlgorithm,
} from "./authn-policy.js";
import { progressiveBackoffMs } from "./session.js";

describe("password policy", () => {
  it("accepts 12–128 characters without composition theater", () => {
    expect(() => assertPasswordPolicy("abcdefghijkl")).not.toThrow();
    expect(() => assertPasswordPolicy("a".repeat(128))).not.toThrow();
    expect(() => assertPasswordPolicy("a".repeat(11))).toThrow(PasswordPolicyError);
    expect(() => assertPasswordPolicy("a".repeat(129))).toThrow(PasswordPolicyError);
  });

  it("requires argon2id and locks after 10 failures for 15 minutes", () => {
    expect(requiredPasswordAlgorithm()).toBe("argon2id");
    expect(evaluateLockout(9)).toBeNull();
    const now = new Date("2026-01-01T00:00:00.000Z");
    const lockedUntil = evaluateLockout(10, now);
    expect(lockedUntil?.getTime()).toBe(now.getTime() + 15 * 60 * 1000);
    expect(isAccountLocked(lockedUntil ?? null, now)).toBe(true);
    expect(isAccountLocked(lockedUntil ?? null, new Date(now.getTime() + 16 * 60 * 1000))).toBe(false);
  });

  it("applies progressive backoff after repeated failures", () => {
    expect(progressiveBackoffMs(0)).toBe(0);
    expect(progressiveBackoffMs(1)).toBe(200);
    expect(progressiveBackoffMs(8)).toBe(2000);
  });

  it("allows first-instance bootstrap registration only when no users exist", () => {
    expect(() => assertBootstrapRegistrationAllowed(0)).not.toThrow();
    expect(() => assertBootstrapRegistrationAllowed(1)).toThrow(PublicRegistrationDisabledError);
  });
});
