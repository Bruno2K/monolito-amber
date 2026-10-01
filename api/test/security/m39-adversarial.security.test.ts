import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_PERMISSIONS,
  M3_9_ADVERSARIAL_IDS,
  M3_9_ADVERSARIAL_SCENARIOS,
  PERMISSIONS,
  assertAuditMutationAllowed,
  cancelledLinkedWorkPackageBlocksDelivery,
  historicalDisciplineIdentifierPreserved,
  isForbiddenPermission,
  phaseDatesTransitStatus,
  readyEqualsReleased,
  shouldRevokeProjectAccess,
  taskCompleteCascadesToWorkPackage,
  teamMembershipImpliesProjectAccess,
} from "@amber/shared";
import { AuditService } from "../../src/audit/audit.service";
import { FoundationService } from "../../src/foundation/foundation.service";
import { GateReadAdapter } from "../../src/operations/adapters/gate.read-adapter";

const ROOT = join(__dirname, "../../..");

describe("M3.9 adversarial security (fail closed)", () => {
  it("keeps the fifteen-scenario catalog and evidence index on disk", () => {
    expect(M3_9_ADVERSARIAL_SCENARIOS).toHaveLength(15);
    const evidence = readFileSync(join(ROOT, "docs/development/m3.9-evidence/adversarial-scenarios.md"), "utf8");
    for (const id of M3_9_ADVERSARIAL_IDS) {
      expect(evidence).toContain(id);
    }
    expect(evidence).not.toMatch(/Exit Gate PASS/);
    expect(evidence).not.toMatch(/M3 COMPLETE/);
  });

  it("ADV-04 / ADV-05 / ADV-06 / ADV-07 / ADV-09 floors remain fail-closed", () => {
    expect(teamMembershipImpliesProjectAccess()).toBe(false);
    expect(phaseDatesTransitStatus()).toBe(false);
    expect(cancelledLinkedWorkPackageBlocksDelivery([{ status: "CANCELLED", associated: true }])).toBe(true);
    expect(taskCompleteCascadesToWorkPackage()).toBe(false);
    expect(shouldRevokeProjectAccess("REMOVED")).toBe(true);
    expect(readyEqualsReleased()).toBe(false);
  });

  it("ADV-11: Foundation CAS rejects stale expectedVersion", () => {
    const service = new FoundationService({} as never);
    expect(() => service.cas({ version: 4 }, 3)).toThrow(/Optimistic lock/);
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

  it("ADV-15: historical Discipline identifier floor stays true", () => {
    expect(historicalDisciplineIdentifierPreserved()).toBe(true);
  });
});
