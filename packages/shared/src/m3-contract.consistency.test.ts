import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { M3_1_ARTIFACT_PATHS, M3_1_REQUIREMENT_IDS } from "./m3-requirements.js";
import { OPERATIONS_PERMISSIONS } from "./permissions.js";
import { DELIVERABLE_FIELDS, PHASE_FIELDS, WORK_PACKAGE_FIELDS } from "./operations.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("M3.1 contract consistency", () => {
  it("has every required artifact on disk", () => {
    for (const rel of M3_1_ARTIFACT_PATHS) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
    }
  });

  it("embeds every REQ id in the traceability matrix", () => {
    const matrix = read("docs/domain/m3.1-requirements-traceability.md");
    for (const id of M3_1_REQUIREMENT_IDS) {
      expect(matrix).toContain(id);
    }
    expect(matrix).toContain("Notion");
    expect(matrix).toContain("Figma");
    expect(matrix).toContain("schema");
    expect(matrix).toContain("OpenAPI");
    expect(matrix).toContain("UI");
    expect(matrix).toContain("test");
  });

  it("mirrors binding fields, permissions, and no-gate.override in the domain contract", () => {
    const contract = read("docs/domain/m3-project-operations-contract.md");
    for (const field of ["organizationId", "projectId", "phaseId", "disciplineId", "blockedReason"]) {
      expect(contract).toContain(field);
    }
    for (const field of PHASE_FIELDS) {
      if (field === "archivedAt" || field === "createdAt" || field === "updatedAt") continue;
      expect(contract, field).toContain(field);
    }
    expect(contract).toContain(DELIVERABLE_FIELDS[0]);
    expect(contract).toContain(WORK_PACKAGE_FIELDS[0]);
    for (const code of OPERATIONS_PERMISSIONS) {
      expect(contract).toContain(code);
    }
    expect(contract).toMatch(/no `?gate\.override/i);
    expect(contract).not.toMatch(/gate\.override permission is granted/i);
  });

  it("keeps the migration plan forward-only and non-destructive of historical Discipline identifiers", () => {
    const plan = read("docs/development/m3-migration-plan.md");
    expect(plan).toMatch(/forward-only/i);
    expect(plan).toMatch(/additive/i);
    expect(plan).toMatch(/historical/i);
    expect(plan).not.toMatch(/DROP COLUMN\s+discipline_id/i);
    expect(plan).not.toMatch(/ALTER TABLE .* RENAME COLUMN .*discipline/i);
    expect(plan).toContain("responsible_discipline_id");
  });
});
