import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AuditMutationDeniedError, DenyByDefaultError, PlanningStateError } from "./errors.js";
import { assertAuditMutationAllowed } from "./audit.js";
import { applyOptimisticUpdate } from "./optimistic-version.js";
import { shouldRevokeOrgAccess, shouldRevokeProjectAccess } from "./membership.js";
import { FORBIDDEN_PERMISSIONS, PERMISSIONS, isForbiddenPermission } from "./permissions.js";
import {
  assertNoScheduleDatePropagation,
  assertFinishToStartType,
  deriveKanbanColumn,
  deriveMilestoneRisk,
  isTaskLate,
  prerequisitesBlockStart,
  TASK_STATUSES,
} from "./planning.js";
import {
  deliverableEqualsDocument,
  hiddenCountPlaceholderAllowed,
  issueEqualsTask,
  payloadLeaksHiddenCount,
  progressPercent100MarksTaskDone,
  resolveTaskDeliveryRefs,
  taskCompleteCascadesToDeliverable,
  taskCompleteCascadesToIssue,
  taskCompleteCascadesToMilestone,
  taskCompleteCascadesToWorkPackage,
  teamMembershipImpliesProjectAccess,
  workPackageEqualsTask,
} from "./traceability.js";
import { teamOwnerGrantsProjectAccess } from "./operations.js";
import {
  M4_9_ARTIFACT_PATHS,
  M4_9_AUDITED_REQUIREMENT_IDS,
  M4_9_FORBIDDEN_CLAIMS,
  M4_9_QG_ADVERSARIAL_IDS,
  M4_9_QG_ADVERSARIAL_SCENARIOS,
  M4_9_TRACE_IDS,
} from "./m49-audit.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("M4.9 audit floors (fail closed)", () => {
  it("M4.9-REG-01 catalogues every M4.1–M4.8.1 id without claiming Exit Gate PASS", () => {
    expect(M4_9_AUDITED_REQUIREMENT_IDS).toHaveLength(118);
    const matrix = read("docs/domain/m4.9-requirements-traceability.md");
    for (const id of M4_9_AUDITED_REQUIREMENT_IDS) {
      expect(matrix, id).toContain(id);
    }
    for (const id of M4_9_TRACE_IDS) {
      expect(matrix, id).toContain(id);
    }
    for (const claim of M4_9_FORBIDDEN_CLAIMS) {
      expect(matrix).not.toMatch(new RegExp(`Engineer (self-)?(declares|marks|claims) ${claim}`));
    }
    expect(matrix).toMatch(/Recommendation:.*PASS/);
    expect(matrix).toMatch(/Governor only/);
    for (const rel of M4_9_ARTIFACT_PATHS) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
    }
  });

  it("M4.9-ADV-01 catalogues the thirteen Quality Gates adversarial scenarios", () => {
    expect(M4_9_QG_ADVERSARIAL_SCENARIOS).toHaveLength(13);
    expect(M4_9_QG_ADVERSARIAL_IDS).toEqual(M4_9_QG_ADVERSARIAL_SCENARIOS.map((row) => row.id));
    const evidence = read("docs/development/m4.9-evidence/adversarial-scenarios.md");
    for (const id of M4_9_QG_ADVERSARIAL_IDS) {
      expect(evidence).toContain(id);
    }
    expect(evidence).not.toMatch(/Engineer marks Exit Gate PASS/);
    expect(evidence).not.toMatch(/M4 COMPLETE/);
  });

  it("QG-ADV-01: rejects cross-tenant Task delivery refs", () => {
    expect(() =>
      resolveTaskDeliveryRefs(
        { organizationId: "org-a", projectId: "proj-a", phaseId: "phase-1" },
        { phase: { organizationId: "org-b", projectId: "proj-a", phaseId: "phase-1" } },
      ),
    ).toThrow(DenyByDefaultError);
  });

  it("QG-ADV-02: suspended/removed memberships revoke access", () => {
    expect(shouldRevokeOrgAccess("SUSPENDED")).toBe(true);
    expect(shouldRevokeOrgAccess("REMOVED")).toBe(true);
    expect(shouldRevokeProjectAccess("SUSPENDED")).toBe(true);
    expect(shouldRevokeProjectAccess("REMOVED")).toBe(true);
    expect(shouldRevokeProjectAccess("ACTIVE")).toBe(false);
  });

  it("QG-ADV-03: hidden-count placeholders are forbidden", () => {
    expect(hiddenCountPlaceholderAllowed()).toBe(false);
    expect(payloadLeaksHiddenCount({ hint: "1 item oculto" })).toBe(true);
    expect(payloadLeaksHiddenCount({ tasks: [] })).toBe(false);
  });

  it("QG-ADV-05: CAS rejects stale expectedVersion", () => {
    expect(() => applyOptimisticUpdate({ version: 3, id: "task" }, 2)).toThrow();
  });

  it("QG-ADV-07 / QG-ADV-08: FS-only deps; unfinished predecessor blocks start", () => {
    expect(() => assertFinishToStartType("START_TO_START")).toThrow(PlanningStateError);
    expect(prerequisitesBlockStart([{ status: "TODO" }])).toBe(true);
    expect(prerequisitesBlockStart([{ status: "DONE" }])).toBe(false);
  });

  it("QG-ADV-09 / QG-ADV-10: dates/progress never transit; complete does not cascade", () => {
    expect(progressPercent100MarksTaskDone()).toBe(false);
    expect(TASK_STATUSES).not.toContain("OVERDUE");
    expect(isTaskLate({ dueDate: new Date("2000-01-01T00:00:00.000Z"), status: "TODO" })).toBe(true);
    expect(taskCompleteCascadesToWorkPackage()).toBe(false);
    expect(taskCompleteCascadesToDeliverable()).toBe(false);
    expect(taskCompleteCascadesToMilestone()).toBe(false);
    expect(taskCompleteCascadesToIssue()).toBe(false);
    const risk = deriveMilestoneRisk({
      recordedStatus: "PLANNED",
      targetDate: new Date("2000-01-01T00:00:00.000Z"),
      contributing: [],
    });
    expect(risk.status).toBe("MISSED");
    expect(deriveKanbanColumn({ status: "TODO", late: true })).toBe("EM_RISCO");
  });

  it("QG-ADV-11: date propagation is rejected", () => {
    expect(() => assertNoScheduleDatePropagation({ propagateDates: true })).toThrow(PlanningStateError);
  });

  it("M4.9-R07 / M4.9-R08: one Planning SoT and distinct aggregates", () => {
    expect(issueEqualsTask()).toBe(false);
    expect(workPackageEqualsTask()).toBe(false);
    expect(deliverableEqualsDocument()).toBe(false);
    expect(teamMembershipImpliesProjectAccess()).toBe(false);
    expect(teamOwnerGrantsProjectAccess()).toBe(false);
    expect(read("prisma/schema.prisma")).not.toMatch(/model\s+Schedule\b/);
    expect(read("prisma/schema.prisma")).not.toMatch(/model\s+Gantt\b/);
  });

  it("ADV-13 / ADV-14 floors remain: audit append-only; no gate.override", () => {
    expect(() => assertAuditMutationAllowed("UPDATE")).toThrow(AuditMutationDeniedError);
    expect(() => assertAuditMutationAllowed("DELETE")).toThrow(AuditMutationDeniedError);
    expect(() => assertAuditMutationAllowed("INSERT")).not.toThrow();
    expect(FORBIDDEN_PERMISSIONS).toContain("gate.override");
    expect(isForbiddenPermission("gate.override")).toBe(true);
    expect(PERMISSIONS).not.toContain("gate.override");
  });

  it("M4.9-SCOPE-01 stays LOCAL ONLY and keeps residuals OPEN", () => {
    const deploy = read(".github/workflows/deploy-cloud.yml");
    expect(deploy).toMatch(/if:\s*false/);
    expect(deploy).not.toMatch(/VERCEL_TOKEN|RAILWAY_TOKEN|vercel --prod|railway up/);
    const residuals = read("docs/release/m4.9-residuals.md");
    expect(residuals).toMatch(/F-08/);
    expect(residuals).toMatch(/F-10/);
    expect(residuals).toMatch(/RPO-RTO/);
    expect(residuals).toMatch(/PaaS/);
    expect(residuals).toMatch(/WIN-PS1/);
    expect(residuals).toMatch(/OPEN/);
    expect(residuals).toMatch(/does \*\*not\*\*/);
    expect(read("docs/development/m4.9-evidence/EXIT-REPORT.md")).toMatch(/Governor only/);
  });
});
