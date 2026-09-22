import { describe, expect, it } from "vitest";

describe("web foundation", () => {
  it("does not expose a product Gate override surface", () => {
    expect("gate.override" in globalThis).toBe(false);
  });
});
