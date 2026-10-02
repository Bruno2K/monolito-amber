import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_PERMISSIONS,
  M4_9_AUDITED_REQUIREMENT_IDS,
  M4_9_QG_ADVERSARIAL_IDS,
  PERMISSIONS,
  assertAuditMutationAllowed,
  isForbiddenPermission,
  issueEqualsTask,
  progressPercent100MarksTaskDone,
  shouldRevokeProjectAccess,
  taskCompleteCascadesToIssue,
  teamMembershipImpliesProjectAccess,
} from "@amber/shared";
import { AuditService } from "../../src/audit/audit.service";
import { GateReadAdapter } from "../../src/operations/adapters/gate.read-adapter";

const ROOT = join(__dirname, "../../..");

describe("M4.9 audit security (fail closed)", () => {
  it("keeps the 118-row matrix and Quality Gates adversarial catalog on disk", () => {
    expect(M4_9_AUDITED_REQUIREMENT_IDS).toHaveLength(118);
    const matrix = readFileSync(join(ROOT, "docs/domain/m4.9-requirements-traceability.md"), "utf8");
    for (const id of M4_9_AUDITED_REQUIREMENT_IDS) {
      expect(matrix).toContain(id);
    }
    const evidence = readFileSync(join(ROOT, "docs/development/m4.9-evidence/adversarial-scenarios.md"), "utf8");
    for (const id of M4_9_QG_ADVERSARIAL_IDS) {
      expect(evidence).toContain(id);
    }
    expect(evidence).not.toMatch(/Engineer marks Exit Gate PASS/);
    expect(readFileSync(join(ROOT, "docs/development/m4.9-evidence/EXIT-REPORT.md"), "utf8")).not.toMatch(
      /Engineer (declares|marks) M4 COMPLETE/,
    );
  });

  it("QG-ADV-02 / QG-ADV-09 / QG-ADV-10 floors remain fail-closed", () => {
    expect(shouldRevokeProjectAccess("REMOVED")).toBe(true);
    expect(progressPercent100MarksTaskDone()).toBe(false);
    expect(taskCompleteCascadesToIssue()).toBe(false);
    expect(issueEqualsTask()).toBe(false);
    expect(teamMembershipImpliesProjectAccess()).toBe(false);
  });

  it("ADV-13: AuditService denies UPDATE/DELETE", () => {
    const audit = new AuditService({} as never);
    expect(() => audit.denyMutation("UPDATE")).toThrow();
    expect(() => audit.denyMutation("DELETE")).toThrow();
    expect(() => assertAuditMutationAllowed("INSERT")).not.toThrow();
  });

  it("ADV-14: gate.override is absent and Gate read adapter cannot mutate", () => {
    expect(FORBIDDEN_PERMISSIONS).toContain("gate.override");
    expect(isForbiddenPermission("gate.override")).toBe(true);
    expect(PERMISSIONS).not.toContain("gate.override");
    const adapter = new GateReadAdapter({} as never);
    expect(() => adapter.approve()).toThrow();
    expect(() => adapter.release()).toThrow();
    expect(() => adapter.evaluate()).toThrow();
  });

  it("M4.9-SCOPE-01: cloud deploy stays disabled", () => {
    const deploy = readFileSync(join(ROOT, ".github/workflows/deploy-cloud.yml"), "utf8");
    expect(deploy).toMatch(/if:\s*false/);
    const residuals = readFileSync(join(ROOT, "docs/release/m4.9-residuals.md"), "utf8");
    expect(residuals).toMatch(/F-08/);
    expect(residuals).toMatch(/OPEN/);
  });
});
