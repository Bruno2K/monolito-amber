import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REQUIRED = [
  "tenancy.security.test.ts",
  "session.security.test.ts",
  "sod.security.test.ts",
  "scan-status.security.test.ts",
  "audit.security.test.ts",
  "cas-idempotency.security.test.ts",
  "contextual-rbac.security.test.ts",
  "document-revision.security.test.ts",
  "coordination.security.test.ts",
];

const SKIP_RE = /\.skip\s*\(|describe\.skip|it\.skip|xit\s*\(|xdescribe\s*\(/;

describe("security stubs fail closed if skipped", () => {
  it("requires every security evidence file to exist and not be skipped", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const files = new Set(readdirSync(dir));
    for (const name of REQUIRED) {
      expect(files.has(name), `Missing required security stub ${name}`).toBe(true);
      const content = readFileSync(join(dir, name), "utf8");
      expect(content.length).toBeGreaterThan(80);
      expect(content, `${name} must not skip tests`).not.toMatch(SKIP_RE);
      expect(content).toMatch(/describe\(|it\(/);
    }
  });
});
