import { describe, expect, it } from "vitest";
import { DenyByDefaultError } from "@amber/shared";
import {
  PERMISSIONS,
  documentDeliverableLinkMutatesDocumentStatus,
  documentDeliverableLinkMutatesRevisionBytes,
  exceptionEqualsSatisfied,
  gateReadAdapterMayApprove,
  gateReadAdapterMayMutate,
  gateReadAdapterMayRelease,
  hiddenCountPlaceholderAllowed,
  issueEqualsTask,
  opsInspectorMutatesDocumentStatus,
  payloadLeaksHiddenCount,
  progressPercent100MarksTaskDone,
  readyEqualsReleased,
  taskCompleteCascadesToDeliverable,
  taskCompleteCascadesToMilestone,
  taskCompleteCascadesToWorkPackage,
  taskDoneMarksParentComplete,
  teamMembershipImpliesProjectAccess,
  unauthorizedTargetMayLeakCount,
} from "@amber/shared";
import { GateReadAdapter } from "../../src/operations/adapters/gate.read-adapter";

describe("M3.7 traceability security attacks (fail closed)", () => {
  it("never invents gate.override and blocks Gate mutation via the read adapter", () => {
    expect(PERMISSIONS).not.toContain("gate.override");
    expect(gateReadAdapterMayMutate()).toBe(false);
    expect(gateReadAdapterMayApprove()).toBe(false);
    expect(gateReadAdapterMayRelease()).toBe(false);
    expect(readyEqualsReleased()).toBe(false);
    expect(exceptionEqualsSatisfied()).toBe(false);
    const adapter = new GateReadAdapter({} as never);
    expect(() => adapter.approve()).toThrow(DenyByDefaultError);
    expect(() => adapter.release()).toThrow(DenyByDefaultError);
  });

  it("keeps Document/Revision immutable via Ops links and forbids count leaks", () => {
    expect(documentDeliverableLinkMutatesDocumentStatus()).toBe(false);
    expect(documentDeliverableLinkMutatesRevisionBytes()).toBe(false);
    expect(opsInspectorMutatesDocumentStatus()).toBe(false);
    expect(hiddenCountPlaceholderAllowed()).toBe(false);
    expect(unauthorizedTargetMayLeakCount()).toBe(false);
    expect(payloadLeaksHiddenCount({ hint: "1 item oculto" })).toBe(true);
    expect(payloadLeaksHiddenCount({ documents: [] })).toBe(false);
  });

  it("does not cascade Task complete or treat Team membership as Project access", () => {
    expect(taskCompleteCascadesToWorkPackage()).toBe(false);
    expect(taskCompleteCascadesToDeliverable()).toBe(false);
    expect(taskCompleteCascadesToMilestone()).toBe(false);
    expect(progressPercent100MarksTaskDone()).toBe(false);
    expect(taskDoneMarksParentComplete()).toBe(false);
    expect(issueEqualsTask()).toBe(false);
    expect(teamMembershipImpliesProjectAccess()).toBe(false);
  });
});
