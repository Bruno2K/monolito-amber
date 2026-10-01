import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "./permissions.js";
import {
  assertBothSidesAuthorized,
  documentDeliverableLinkMutatesDocumentStatus,
  documentDeliverableLinkMutatesRevisionStatus,
  gateReadAdapterMayApprove,
  gateReadAdapterMayMutate,
  gateReadAdapterMayRelease,
  hiddenCountPlaceholderAllowed,
  opsInspectorMutatesDocumentStatus,
  payloadLeaksHiddenCount,
  teamMembershipImpliesProjectAccess,
  unauthorizedTargetMayLeakCount,
} from "./traceability.js";

describe("M3.7 traceability security floors (fail closed)", () => {
  it("never invents gate.override and keeps Gate mutations off the read adapter", () => {
    expect(PERMISSIONS).not.toContain("gate.override");
    expect(gateReadAdapterMayMutate()).toBe(false);
    expect(gateReadAdapterMayApprove()).toBe(false);
    expect(gateReadAdapterMayRelease()).toBe(false);
  });

  it("does not let Ops inspectors or Document↔Deliverable links change Document/Revision state", () => {
    expect(documentDeliverableLinkMutatesDocumentStatus()).toBe(false);
    expect(documentDeliverableLinkMutatesRevisionStatus()).toBe(false);
    expect(opsInspectorMutatesDocumentStatus()).toBe(false);
  });

  it("requires both-side AuthZ and forbids count/metadata leak placeholders", () => {
    expect(() => assertBothSidesAuthorized(true, false)).toThrow(/both sides/);
    expect(() => assertBothSidesAuthorized(false, true)).toThrow(/both sides/);
    expect(hiddenCountPlaceholderAllowed()).toBe(false);
    expect(unauthorizedTargetMayLeakCount()).toBe(false);
    expect(payloadLeaksHiddenCount({ totalHidden: 1, hint: "1 item oculto" })).toBe(true);
    expect(teamMembershipImpliesProjectAccess()).toBe(false);
  });
});
