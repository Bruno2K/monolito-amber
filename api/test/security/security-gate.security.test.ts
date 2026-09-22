import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REQUIRED = [
  "tenant-isolation.security.test.ts",
  "sod.security.test.ts",
  "session-revocation.security.test.ts",
  "audit-immutability.security.test.ts",
  "malware-fail-closed.security.test.ts",
  "cas-idempotency.security.test.ts",
  "member-management.security.test.ts",
  "mfa.security.test.ts",
  "project-membership.security.test.ts",
  "contextual-rbac.security.test.ts",
  "external-isolation.security.test.ts",
  "document-revision.security.test.ts",
  "coordination.security.test.ts",
];

const SKIP_RE = /\.skip\s*\(|describe\.skip|it\.skip|xit\s*\(|xdescribe\s*\(/;

describe("API security stubs fail closed if skipped", () => {
  it("requires security evidence files", () => {
    const dir = join(__dirname);
    const files = new Set(readdirSync(dir));
    for (const name of REQUIRED) {
      expect(files.has(name), `Missing ${name}`).toBe(true);
      const content = readFileSync(join(dir, name), "utf8");
      expect(content).not.toMatch(SKIP_RE);
    }
  });
});
