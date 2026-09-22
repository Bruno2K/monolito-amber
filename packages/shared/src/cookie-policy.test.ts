import { describe, expect, it } from "vitest";
import { sessionCookieOptions, sessionCookieSecure } from "./cookie-policy.js";

describe("session cookie policy", () => {
  it("is HttpOnly + SameSite and Secure outside local", () => {
    const options = sessionCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(sessionCookieSecure("production", undefined)).toBe(true);
    expect(sessionCookieSecure("development", "false")).toBe(false);
  });
});
