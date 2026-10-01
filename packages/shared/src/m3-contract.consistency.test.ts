import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { M3_1_ARTIFACT_PATHS, M3_1_REQUIREMENT_IDS, M3_2_ARTIFACT_PATHS, M3_2_REQUIREMENT_IDS, M3_3_ARTIFACT_PATHS, M3_3_REQUIREMENT_IDS, M3_4_ARTIFACT_PATHS, M3_4_REQUIREMENT_IDS, M3_5_ARTIFACT_PATHS, M3_5_REQUIREMENT_IDS, M3_6_ARTIFACT_PATHS, M3_6_REQUIREMENT_IDS, M3_7_ARTIFACT_PATHS, M3_7_REQUIREMENT_IDS, M3_8_ARTIFACT_PATHS, M3_8_REQUIREMENT_IDS, M3_9_ARTIFACT_PATHS, M3_RC1_ARTIFACT_PATHS, M3_RC1_REQUIREMENT_IDS } from "./m3-requirements.js";
import { M3_9_ADVERSARIAL_IDS } from "./m39-adversarial.js";
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

  it("embeds every M3.2 REQ id and keeps the shell traceability artifact", () => {
    const matrix = read("docs/domain/m3.2-requirements-traceability.md");
    for (const id of M3_2_REQUIREMENT_IDS) {
      expect(matrix).toContain(id);
    }
    for (const rel of M3_2_ARTIFACT_PATHS) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
    }
    expect(matrix).toMatch(/session-bound Organization/i);
    expect(matrix).toMatch(/project\.read/);
    expect(matrix).toMatch(/StateScreen/);
    expect(matrix).toMatch(/1440/);
    expect(matrix).toMatch(/1180/);
    expect(matrix).toMatch(/not a uniform verdict/);
    expect(matrix).not.toMatch(/LOCAL RC READY FOR BRUNO/);
    expect(matrix).not.toMatch(/M3\.8 PASS/);
    expect(matrix).not.toMatch(/M3 COMPLETE/);
    expect(existsSync(join(ROOT, "web/app/projects/page.tsx"))).toBe(true);
    expect(existsSync(join(ROOT, "web/app/projects/[projectId]/overview/page.tsx"))).toBe(true);
    expect(existsSync(join(ROOT, "api/test/integration/m32-shell-context.integration.test.ts"))).toBe(true);
    for (const rel of M3_RC1_ARTIFACT_PATHS) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
    }
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

  it("embeds every M3.5 REQ id and keeps the WorkPackage artifacts additive", () => {
    const matrix = read("docs/domain/m3.5-requirements-traceability.md");
    for (const id of M3_5_REQUIREMENT_IDS) {
      expect(matrix).toContain(id);
    }
    for (const rel of M3_5_ARTIFACT_PATHS) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
    }
    expect(existsSync(join(ROOT, "prisma/migrations/20261001180000_m3_5_operations_work_package/migration.sql"))).toBe(
      true,
    );
    const additive = read("prisma/migrations/20261001180000_m3_5_operations_work_package/migration.sql");
    expect(additive).toMatch(/CREATE OR REPLACE FUNCTION operations.assert_same_tenant_work_package/);
    expect(additive).not.toMatch(/DROP TABLE/);
    expect(additive).not.toMatch(/CREATE TABLE "operations"\."work_packages"/);
    expect(additive).not.toMatch(/forceRelease|force_release/);
    const disassociatePlan = read("docs/api/m3-openapi-plan.md");
    expect(disassociatePlan).toMatch(/work-packages\/\{workPackageId\}\/disassociate` \| `work_package\.update`/);
    const wpController = read("api/src/operations/work-packages.controller.ts");
    expect(wpController).toMatch(
      /@Post\(":workPackageId\/disassociate"\)[\s\S]*?@RequirePermission\("work_package\.update"\)/,
    );
    const wpService = read("api/src/operations/work-packages.service.ts");
    expect(wpService).toMatch(/async disassociate\([\s\S]*?requireWorkPackage\(session, "work_package\.update"/);
    const original = read("prisma/migrations/20261001170000_m3_4_operations_deliverable/migration.sql");
    expect(original).toMatch(/CREATE TABLE "operations"\."work_packages"/);
  });

  it("embeds every M3.6 REQ id and keeps the hub as a read model without new tables", () => {
    const matrix = read("docs/domain/m3.6-requirements-traceability.md");
    for (const id of M3_6_REQUIREMENT_IDS) {
      expect(matrix).toContain(id);
    }
    for (const rel of M3_6_ARTIFACT_PATHS) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
    }
    expect(matrix).toMatch(/no `?gate\.override/i);
    expect(matrix).not.toMatch(/gate\.override permission is granted/i);
    const baseline = read("docs/development/m3.6-performance-baseline.md");
    expect(baseline).toMatch(/query count/i);
    expect(baseline).toMatch(/N\+1/i);
    expect(baseline).not.toMatch(/99th percentile/);
  });

  it("embeds every M3.7 REQ id and keeps traceability additive", () => {
    const matrix = read("docs/domain/m3.7-requirements-traceability.md");
    for (const id of M3_7_REQUIREMENT_IDS) {
      expect(matrix).toContain(id);
    }
    for (const rel of M3_7_ARTIFACT_PATHS) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
    }
    expect(matrix).toMatch(/no `?gate\.override/i);
    expect(matrix).not.toMatch(/gate\.override permission is granted/i);
    expect(existsSync(join(ROOT, "prisma/migrations/20261001200000_m3_7_cross_domain_traceability/migration.sql"))).toBe(
      true,
    );
    const sql = read("prisma/migrations/20261001200000_m3_7_cross_domain_traceability/migration.sql");
    expect(sql).toMatch(/CREATE TABLE "operations"\."deliverable_documents"/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "phase_id"/);
    expect(sql).not.toMatch(/DROP TABLE/);
    expect(sql).not.toMatch(/DROP COLUMN/);
    expect(sql).not.toMatch(/gate\.override/);
  });

  it("embeds every M3.8 REQ id and keeps the local RC pack artifacts", () => {
    const matrix = read("docs/domain/m3.8-requirements-traceability.md");
    for (const id of M3_8_REQUIREMENT_IDS) {
      expect(matrix).toContain(id);
    }
    for (const rel of M3_8_ARTIFACT_PATHS) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
    }
    expect(matrix).toMatch(/LOCAL ONLY/i);
    expect(matrix).toMatch(/deferred/i);
    expect(matrix).not.toMatch(/M3\.8 PASS/);
    expect(matrix).not.toMatch(/M3 COMPLETE/);
    expect(matrix).not.toMatch(/LOCAL RC READY FOR BRUNO/);
    const runbook = read("docs/development/m3.8-local-rc-runbook.md");
    expect(runbook).toMatch(/docker compose/i);
    expect(runbook).toMatch(/AMBER_SEED_M3/);
    expect(runbook).toMatch(/playwright/i);
    expect(runbook).not.toMatch(/M3\.8 PASS/);
    expect(existsSync(join(ROOT, "docker-compose.yml"))).toBe(true);
    expect(existsSync(join(ROOT, ".env.example"))).toBe(true);
    const compose = read("docker-compose.yml");
    expect(compose).toMatch(/postgres:/);
    expect(compose).toMatch(/minio:/);
    expect(compose).toMatch(/bitnamilegacy\/minio/);
    expect(compose).not.toMatch(/^\s+image:\s+minio\/minio/m);
    expect(compose).not.toMatch(/^\s+image:\s+minio\/mc/m);
    expect(compose).toMatch(/api:/);
    expect(compose).toMatch(/web:/);
    expect(compose).toMatch(/profiles:\s*\n\s*- jobs/m);
    const envExample = read(".env.example");
    expect(envExample).toMatch(/SESSION_SECRET=/);
    expect(envExample).not.toMatch(/vercel/i);
    expect(envExample).not.toMatch(/RAILWAY_/);
  });

  it("embeds every M3.9 / RC1 id and keeps the Exit Gate evidence artifacts", () => {
    const matrix = read("docs/domain/m3.9-requirements-traceability.md");
    for (const id of M3_1_REQUIREMENT_IDS) {
      expect(matrix).toContain(id);
    }
    for (const id of M3_2_REQUIREMENT_IDS) {
      expect(matrix).toContain(id);
    }
    for (const id of M3_3_REQUIREMENT_IDS) {
      expect(matrix).toContain(id);
    }
    for (const id of M3_4_REQUIREMENT_IDS) {
      expect(matrix).toContain(id);
    }
    for (const id of M3_5_REQUIREMENT_IDS) {
      expect(matrix).toContain(id);
    }
    for (const id of M3_6_REQUIREMENT_IDS) {
      expect(matrix).toContain(id);
    }
    for (const id of M3_7_REQUIREMENT_IDS) {
      expect(matrix).toContain(id);
    }
    for (const id of M3_8_REQUIREMENT_IDS) {
      expect(matrix).toContain(id);
    }
    for (const id of M3_RC1_REQUIREMENT_IDS) {
      expect(matrix).toContain(id);
    }
    for (const rel of M3_9_ARTIFACT_PATHS) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
    }
    for (const rel of M3_RC1_ARTIFACT_PATHS) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
    }
    expect(matrix).toMatch(/ATENDIDO|PARCIAL|NÃO COMPROVADO|DESVIO DE ESCOPO/);
    expect(matrix).toMatch(/HUMAN_REQUIRED/);
    expect(matrix).not.toMatch(/M3 COMPLETE/);
    expect(matrix).not.toMatch(/Exit Gate PASS/);
    const adversarial = read("docs/development/m3.9-evidence/adversarial-scenarios.md");
    for (const id of M3_9_ADVERSARIAL_IDS) {
      expect(adversarial).toContain(id);
    }
    const exit = read("docs/development/m3.9-evidence/EXIT-REPORT.md");
    expect(exit).toMatch(/recommendation/i);
    expect(exit).not.toMatch(/Engineer claims Exit Gate PASS/);
    expect(exit).toMatch(/do not start M4/i);
  });
});
