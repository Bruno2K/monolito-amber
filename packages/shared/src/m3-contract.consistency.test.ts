import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { M3_1_ARTIFACT_PATHS, M3_1_REQUIREMENT_IDS, M3_3_ARTIFACT_PATHS, M3_3_REQUIREMENT_IDS, M3_4_ARTIFACT_PATHS, M3_4_REQUIREMENT_IDS } from "./m3-requirements.js";
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
    const sqlBlocks = [...plan.matchAll(/```sql([\s\S]*?)```/g)].map((match) => match[1] ?? "");
    expect(sqlBlocks.join("\n")).not.toMatch(/DROP COLUMN\s+discipline_id/i);
    expect(sqlBlocks.join("\n")).not.toMatch(/ALTER TABLE .* RENAME COLUMN .*discipline/i);
    expect(plan).toMatch(/must not drop|leave|KEEP|forbidden/i);
    expect(plan).toContain("responsible_discipline_id");
  });

  it("embeds every M3.3 REQ id and keeps the Phase/Discipline artifacts", () => {
    const matrix = read("docs/domain/m3.3-requirements-traceability.md");
    for (const id of M3_3_REQUIREMENT_IDS) {
      expect(matrix).toContain(id);
    }
    for (const rel of M3_3_ARTIFACT_PATHS) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
    }
    expect(existsSync(join(ROOT, "prisma/migrations/20261001160000_m3_3_operations_phase_discipline/migration.sql"))).toBe(
      true,
    );
  });

  it("embeds every M3.4 REQ id and keeps the Deliverable artifacts", () => {
    const matrix = read("docs/domain/m3.4-requirements-traceability.md");
    for (const id of M3_4_REQUIREMENT_IDS) {
      expect(matrix).toContain(id);
    }
    for (const rel of M3_4_ARTIFACT_PATHS) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
    }
    expect(existsSync(join(ROOT, "prisma/migrations/20261001170000_m3_4_operations_deliverable/migration.sql"))).toBe(
      true,
    );
    const sql = read("prisma/migrations/20261001170000_m3_4_operations_deliverable/migration.sql");
    expect(sql).toMatch(/CREATE TABLE "operations"\."deliverables"/);
    expect(sql).not.toMatch(/gate\.override/);
    expect(sql).not.toMatch(/DROP COLUMN\s+discipline_id/i);
  });
});
