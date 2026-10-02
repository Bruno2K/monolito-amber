import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_API_TOKENS } from "@amber/shared";

const ROOT = join(__dirname, "../../..");

describe("M4.8 Local RC security floors", () => {
  it("does not invent gate.override and keeps cloud deploy disabled", () => {
    const permissions = readFileSync(join(ROOT, "packages/shared/src/permissions.ts"), "utf8");
    for (const token of FORBIDDEN_API_TOKENS) {
      expect(permissions).toContain(token);
    }
    expect(permissions).toMatch(/FORBIDDEN/);
    const deploy = readFileSync(join(ROOT, ".github/workflows/deploy-cloud.yml"), "utf8");
    expect(deploy).toMatch(/if:\s*false/);
    expect(existsSync(join(ROOT, "docs/release/m4.8-residuals.md"))).toBe(true);
    const residuals = readFileSync(join(ROOT, "docs/release/m4.8-residuals.md"), "utf8");
    expect(residuals).toMatch(/F-08/);
    expect(residuals).toMatch(/F-10/);
    expect(residuals).toMatch(/RPO-RTO/);
    expect(residuals).toMatch(/PaaS/);
    expect(residuals).toMatch(/OPEN/);
  });
});
