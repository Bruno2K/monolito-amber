import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { M4_8_ARTIFACT_PATHS, M4_8_REQUIREMENT_IDS } from "./m4-seed-design.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("M4.8 Local RC pack contract", () => {
  it("embeds every R id in the traceability matrix and keeps artifacts on disk", () => {
    const matrix = read("docs/domain/m4.8-requirements-traceability.md");
    for (const id of M4_8_REQUIREMENT_IDS) {
      expect(matrix, id).toContain(id);
    }
    expect(matrix).toMatch(/14\s*\|\s*0\s*\|\s*0\s*\|\s*0|ATENDIDO \| 14/);
    for (const rel of M4_8_ARTIFACT_PATHS) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
    }
  });

  it("M4.8-SCOPE-01 stays LOCAL ONLY and does not enable cloud deploy", () => {
    const deploy = read(".github/workflows/deploy-cloud.yml");
    expect(deploy).toMatch(/if:\s*false/);
    expect(deploy).toMatch(/DISABLED|not authorized/i);
    expect(deploy).not.toMatch(/VERCEL_TOKEN|RAILWAY_TOKEN|vercel --prod|railway up/);
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toMatch(/Local RC \(real API \+ Postgres\)/);
    expect(ci).not.toMatch(/vercel|railway/i);
    const guide = read("docs/release/m4.8-local-rc-test-guide.md");
    expect(guide).toMatch(/LOCAL ONLY/);
    expect(guide).not.toMatch(/vercel\.app|railway\.app/);
    expect(read("docs/release/m4.8-residuals.md")).toMatch(/F-08/);
    expect(read("docs/release/m4.8-residuals.md")).toMatch(/OPEN/);
    expect(read("docs/domain/m4.8-requirements-traceability.md")).toMatch(/LOCAL RC READY FOR BRUNO/);
    expect(read("docs/domain/m4.8-requirements-traceability.md")).not.toMatch(/M4\.9 Exit Gate PASS/);
  });
});
