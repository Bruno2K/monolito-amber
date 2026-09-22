import { describe, expect, it } from "vitest";
import { RateLimitedError } from "./errors.js";
import { consumeRateLimit } from "./rate-limit.js";

describe("login rate limit", () => {
  it("allows a burst then locks the window", () => {
    const bucket = { timestamps: [] as number[] };
    const now = 1_000_000;
    for (let i = 0; i < 20; i += 1) {
      consumeRateLimit(bucket, now, 20, 60_000);
    }
    expect(() => consumeRateLimit(bucket, now, 20, 60_000)).toThrow(RateLimitedError);
  });
});
