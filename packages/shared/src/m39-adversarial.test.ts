import { describe, expect, it } from "vitest";
import { AuditMutationDeniedError, DenyByDefaultError, IdempotencyConflictError, OptimisticLockError } from "./errors.js";
import { assertAuditMutationAllowed } from "./audit.js";
import { applyOptimisticUpdate } from "./optimistic-version.js";
import { hashIdempotentRequest, replayOrConflict } from "./idempotency.js";
import { shouldRevokeOrgAccess, shouldRevokeProjectAccess } from "./membership.js";
import { FORBIDDEN_PERMISSIONS, PERMISSIONS, isForbiddenPermission } from "./permissions.js";
import {
  assertDeliverableCanBeDelivered,
  cancelledLinkedWorkPackageBlocksDelivery,
  deliverableDatesTransitStatus,
  historicalDisciplineIdentifierPreserved,
  phaseDatesTransitStatus,
  progressPercentTransitsDeliverableStatus,
  teamMembershipImpliesProjectMembership,
  teamOwnerGrantsProjectAccess,
  workPackageCompleteCascadesToDeliverable,
  workPackageCompleteCascadesToMilestone,
  workPackageCompleteCascadesToTask,
  workPackageDatesTransitStatus,
} from "./operations.js";
import { hubInventedHealthStatus, overdueIsDeliverableStatus } from "./hub.js";
import {
  exceptionEqualsSatisfied,
  hiddenCountPlaceholderAllowed,
  payloadLeaksHiddenCount,
  readyEqualsReleased,
  resolveMilestoneDeliveryRefs,
  resolveTaskDeliveryRefs,
  taskCompleteCascadesToDeliverable,
  taskCompleteCascadesToMilestone,
  taskCompleteCascadesToWorkPackage,
  teamMembershipImpliesProjectAccess,
} from "./traceability.js";
import { M3_9_ADVERSARIAL_IDS, M3_9_ADVERSARIAL_SCENARIOS } from "./m39-adversarial.js";

describe("M3.9 adversarial floors (fail closed)", () => {
  it("catalogues all fifteen scenarios without claiming Exit Gate PASS", () => {
    expect(M3_9_ADVERSARIAL_SCENARIOS).toHaveLength(15);
    expect(M3_9_ADVERSARIAL_IDS).toEqual(M3_9_ADVERSARIAL_SCENARIOS.map((row) => row.id));
    expect(M3_9_ADVERSARIAL_SCENARIOS.map((row) => row.id)).not.toContain("M3 COMPLETE");
  });

  it("ADV-01 / ADV-02: rejects cross-tenant Task and Milestone delivery refs", () => {
    expect(() =>
      resolveTaskDeliveryRefs(
        { organizationId: "org-a", projectId: "proj-a", phaseId: "phase-1" },
        { phase: { organizationId: "org-b", projectId: "proj-a", phaseId: "phase-1" } },
      ),
    ).toThrow(DenyByDefaultError);
    expect(() =>
      resolveMilestoneDeliveryRefs(
        { organizationId: "org-a", projectId: "proj-a", deliverableId: "del-1" },
        {
          deliverable: {
            organizationId: "org-b",
            projectId: "proj-a",
            deliverableId: "del-1",
            phaseId: "phase-1",
          },
        },
      ),
    ).toThrow(DenyByDefaultError);
    expect(() =>
      resolveMilestoneDeliveryRefs(
        { organizationId: "org-a", projectId: "proj-a", deliverableId: "del-1" },
        {
          deliverable: {
            organizationId: "org-a",
            projectId: "proj-b",
            deliverableId: "del-1",
            phaseId: "phase-1",
          },
        },
      ),
    ).toThrow(DenyByDefaultError);
  });

  it("ADV-03: suspended/removed memberships revoke access", () => {
    expect(shouldRevokeOrgAccess("SUSPENDED")).toBe(true);
    expect(shouldRevokeOrgAccess("REMOVED")).toBe(true);
    expect(shouldRevokeOrgAccess("ACTIVE")).toBe(false);
    expect(shouldRevokeProjectAccess("SUSPENDED")).toBe(true);
    expect(shouldRevokeProjectAccess("REMOVED")).toBe(true);
    expect(shouldRevokeProjectAccess("ACTIVE")).toBe(false);
  });

  it("ADV-04: Team ownership / TeamMembership is not Project access", () => {
    expect(teamOwnerGrantsProjectAccess()).toBe(false);
    expect(teamMembershipImpliesProjectMembership()).toBe(false);
    expect(teamMembershipImpliesProjectAccess()).toBe(false);
  });

  it("ADV-05: dates and progress never transit explicit status", () => {
    expect(phaseDatesTransitStatus()).toBe(false);
    expect(deliverableDatesTransitStatus()).toBe(false);
    expect(workPackageDatesTransitStatus()).toBe(false);
    expect(progressPercentTransitsDeliverableStatus()).toBe(false);
    expect(overdueIsDeliverableStatus()).toBe(false);
    expect(hubInventedHealthStatus()).toBe(false);
  });

  it("ADV-06: incomplete or CANCELLED linked WPs block Deliverable deliver", () => {
    expect(() => assertDeliverableCanBeDelivered([{ status: "ACTIVE", associated: true }])).toThrow();
    expect(() => assertDeliverableCanBeDelivered([{ status: "CANCELLED", associated: true }])).toThrow();
    expect(cancelledLinkedWorkPackageBlocksDelivery([{ status: "CANCELLED", associated: true }])).toBe(true);
    expect(() => assertDeliverableCanBeDelivered([])).not.toThrow();
    expect(() => assertDeliverableCanBeDelivered([{ status: "DONE", associated: true }])).not.toThrow();
  });

  it("ADV-07: Task / WorkPackage complete does not cascade", () => {
    expect(taskCompleteCascadesToWorkPackage()).toBe(false);
    expect(taskCompleteCascadesToDeliverable()).toBe(false);
    expect(taskCompleteCascadesToMilestone()).toBe(false);
    expect(workPackageCompleteCascadesToTask()).toBe(false);
    expect(workPackageCompleteCascadesToDeliverable()).toBe(false);
    expect(workPackageCompleteCascadesToMilestone()).toBe(false);
    expect(readyEqualsReleased()).toBe(false);
    expect(exceptionEqualsSatisfied()).toBe(false);
  });

  it("ADV-08: hidden-count placeholders are forbidden", () => {
    expect(hiddenCountPlaceholderAllowed()).toBe(false);
    expect(payloadLeaksHiddenCount({ hint: "1 item oculto" })).toBe(true);
    expect(payloadLeaksHiddenCount({ documents: [] })).toBe(false);
  });

  it("ADV-11 / ADV-12: CAS rejects stale version; idempotency conflicts on body mismatch", () => {
    expect(() => applyOptimisticUpdate({ version: 3, id: "phase" }, 2)).toThrow(OptimisticLockError);
    const hash = hashIdempotentRequest({ action: "activate" });
    const stored = { key: "k1", requestHash: hash, responseStatus: 200, responseBody: { ok: true } };
    expect(replayOrConflict(stored, "k1", hash)?.responseStatus).toBe(200);
    expect(() => replayOrConflict(stored, "k1", hashIdempotentRequest({ action: "other" }))).toThrow(
      IdempotencyConflictError,
    );
  });

  it("ADV-13: audit mutation is denied", () => {
    expect(() => assertAuditMutationAllowed("UPDATE")).toThrow(AuditMutationDeniedError);
    expect(() => assertAuditMutationAllowed("DELETE")).toThrow(AuditMutationDeniedError);
    expect(() => assertAuditMutationAllowed("INSERT")).not.toThrow();
  });

  it("ADV-14: gate.override is forbidden", () => {
    expect(FORBIDDEN_PERMISSIONS).toContain("gate.override");
    expect(isForbiddenPermission("gate.override")).toBe(true);
    expect(PERMISSIONS).not.toContain("gate.override");
  });

  it("ADV-15: historical Discipline identifiers are preserved", () => {
    expect(historicalDisciplineIdentifierPreserved()).toBe(true);
  });
});
