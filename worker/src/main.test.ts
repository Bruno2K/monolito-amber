import { describe, expect, it } from "vitest";
import { jobIdempotencyKey } from "@amber/shared";

describe("worker job idempotency hook", () => {
  it("builds a stable job key", () => {
    expect(jobIdempotencyKey("scan", "object-1")).toBe("scan:object-1");
  });
});
