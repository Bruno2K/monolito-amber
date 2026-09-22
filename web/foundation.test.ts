import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FORBIDDEN_PAGES = [
  "app/projects",
  "app/documents",
  "app/coordination",
  "app/planning",
  "app/gates",
];

describe("web identity shell", () => {
  it("does not expose product Project/Documents/Coordination/Planning/Gate pages", () => {
    for (const relative of FORBIDDEN_PAGES) {
      expect(existsSync(join(__dirname, relative)), relative).toBe(false);
    }
    expect("gate.override" in globalThis).toBe(false);
  });
});
