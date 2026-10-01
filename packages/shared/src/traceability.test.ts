import { describe, expect, it } from "vitest";
import { DenyByDefaultError, PlanningStateError } from "./errors.js";
import {
  assertAuditLinkPayloadIdsOnly,
  assertBothSidesAuthorized,
  bothSidesAuthorized,
  contextSectionKeyPresent,
  deepLinkWithReturn,
  deliverableEqualsDocument,
  documentDeliverableLinkMutatesDocumentStatus,
  documentDeliverableLinkMutatesRevisionBytes,
  exceptionEqualsSatisfied,
  gateReadAdapterMayApprove,
  gateReadAdapterMayMutate,
  hiddenCountPlaceholderAllowed,
  issueEqualsTask,
  linkAuditPayload,
  omitUnauthorizedSection,
  payloadLeaksHiddenCount,
  preserveReturnPath,
  progressPercent100MarksTaskDone,
  progressPercentTransitsTaskStatus,
  readyEqualsReleased,
  resolveMilestoneDeliveryRefs,
  resolveTaskDeliveryRefs,
  taskCompleteCascadesToDeliverable,
  taskCompleteCascadesToIssue,
  taskCompleteCascadesToMilestone,
  taskCompleteCascadesToWorkPackage,
  taskDoneMarksParentComplete,
  teamMembershipImpliesProjectAccess,
  unauthorizedTargetMayLeakCount,
  workPackageEqualsTask,
} from "./traceability.js";

const org = "org-a";
const project = "proj-a";
const phase: { organizationId: string; projectId: string; phaseId: string; deliverableId?: string | null } = {
  organizationId: org,
  projectId: project,
  phaseId: "phase-1",
};
const deliverable = { ...phase, deliverableId: "del-1" };
const workPackage = { ...phase, deliverableId: "del-1" };

describe("M3.7 identity and cascade floors", () => {
  it("keeps source modules sovereign — no silent cascades or identity collapse", () => {
    expect(taskCompleteCascadesToWorkPackage()).toBe(false);
    expect(taskCompleteCascadesToDeliverable()).toBe(false);
    expect(taskCompleteCascadesToMilestone()).toBe(false);
    expect(taskCompleteCascadesToIssue()).toBe(false);
    expect(progressPercentTransitsTaskStatus()).toBe(false);
    expect(progressPercent100MarksTaskDone()).toBe(false);
    expect(taskDoneMarksParentComplete()).toBe(false);
    expect(documentDeliverableLinkMutatesDocumentStatus()).toBe(false);
    expect(documentDeliverableLinkMutatesRevisionBytes()).toBe(false);
    expect(gateReadAdapterMayMutate()).toBe(false);
    expect(gateReadAdapterMayApprove()).toBe(false);
    expect(issueEqualsTask()).toBe(false);
    expect(deliverableEqualsDocument()).toBe(false);
    expect(workPackageEqualsTask()).toBe(false);
    expect(teamMembershipImpliesProjectAccess()).toBe(false);
    expect(readyEqualsReleased()).toBe(false);
    expect(exceptionEqualsSatisfied()).toBe(false);
    expect(hiddenCountPlaceholderAllowed()).toBe(false);
    expect(unauthorizedTargetMayLeakCount()).toBe(false);
  });
});

describe("Task delivery ref consistency", () => {
  it("infers Phase and Deliverable from a consistent WorkPackage chain", () => {
    expect(
      resolveTaskDeliveryRefs(
        { organizationId: org, projectId: project, workPackageId: "wp-1" },
        { workPackage: { ...workPackage } },
      ),
    ).toEqual({ workPackageId: "wp-1", deliverableId: "del-1", phaseId: "phase-1" });
  });

  it("rejects Task WP/Deliverable/Phase mismatches without rewriting", () => {
    expect(() =>
      resolveTaskDeliveryRefs(
        { organizationId: org, projectId: project, workPackageId: "wp-1", phaseId: "phase-other" },
        { workPackage: { ...workPackage } },
      ),
    ).toThrow(PlanningStateError);
    expect(() =>
      resolveTaskDeliveryRefs(
        { organizationId: org, projectId: project, workPackageId: "wp-1", deliverableId: "del-other" },
        { workPackage: { ...workPackage }, deliverable: { ...deliverable, deliverableId: "del-other", phaseId: "phase-1" } },
      ),
    ).toThrow(/must match the linked WorkPackage deliverable/);
  });

  it("rejects cross-tenant objects", () => {
    expect(() =>
      resolveTaskDeliveryRefs(
        { organizationId: org, projectId: project, phaseId: "phase-1" },
        { phase: { organizationId: "org-b", projectId: project, phaseId: "phase-1" } },
      ),
    ).toThrow(DenyByDefaultError);
  });
});

describe("Milestone delivery refs", () => {
  it("infers Phase from Deliverable and keeps ACHIEVED out of derivation", () => {
    expect(
      resolveMilestoneDeliveryRefs(
        { organizationId: org, projectId: project, deliverableId: "del-1" },
        { deliverable },
      ),
    ).toEqual({ deliverableId: "del-1", phaseId: "phase-1" });
  });
});

describe("AuthZ omit and audit ID-only", () => {
  it("omits unauthorized sections entirely — no hidden count placeholder", () => {
    expect(omitUnauthorizedSection(false, [{ id: "secret" }])).toBeUndefined();
    expect(omitUnauthorizedSection(true, [{ id: "visible" }])).toEqual([{ id: "visible" }]);
    expect(bothSidesAuthorized(true, false)).toBe(false);
    expect(() => assertBothSidesAuthorized(true, false)).toThrow(/both sides/);
    const omitted: Record<string, unknown> = { tasks: [] };
    expect(contextSectionKeyPresent(omitted, "documents")).toBe(false);
    expect(payloadLeaksHiddenCount({ hint: "1 item oculto" })).toBe(true);
    expect(payloadLeaksHiddenCount({ documents: [{ id: "d1" }] })).toBe(false);
  });

  it("restricts link audit payloads to identifiers", () => {
    expect(linkAuditPayload({ deliverableId: "d", documentId: "doc" })).toEqual({
      deliverableId: "d",
      documentId: "doc",
    });
    expect(() => assertAuditLinkPayloadIdsOnly({ title: "secret" })).toThrow(/identifiers only/);
  });

  it("preserves deep-link return paths", () => {
    expect(deepLinkWithReturn("/projects/p/work-packages?inspect=wp", "/projects/p/deliverables?inspect=d")).toBe(
      "/projects/p/work-packages?inspect=wp&returnTo=%2Fprojects%2Fp%2Fdeliverables%3Finspect%3Dd",
    );
    expect(preserveReturnPath("from=deliverables&returnInspect=del-1")).toBe(
      "/projects/:projectId/deliverables?inspect=del-1",
    );
  });
});
