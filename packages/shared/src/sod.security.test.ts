import { describe, expect, it } from "vitest";
import { SodViolationError } from "./errors.js";
import {
  assertExceptionDecisionSoD,
  assertExceptionReleaseSoD,
  assertProjectAssignRolesSoD,
  assertRevisionApprovalSoD,
  assertRevisionMakeCurrentSoD,
  assertRoleManagementSoD,
} from "./sod.js";

describe("0.2A resource-level SoD (fail closed)", () => {
  it("blocks publisher from approve/reject and from make-current", () => {
    expect(() =>
      assertRevisionApprovalSoD({ actorUserId: "u1", publishedByUserId: "u1" }),
    ).toThrow(SodViolationError);
    expect(() =>
      assertRevisionMakeCurrentSoD({
        actorUserId: "u1",
        publishedByUserId: "u1",
        revisionStatus: "APPROVED",
      }),
    ).toThrow(SodViolationError);
    expect(() =>
      assertRevisionMakeCurrentSoD({
        actorUserId: "u2",
        publishedByUserId: "u1",
        revisionStatus: "PUBLISHED",
      }),
    ).toThrow(SodViolationError);
    assertRevisionMakeCurrentSoD({
      actorUserId: "u2",
      publishedByUserId: "u1",
      revisionStatus: "APPROVED",
    });
  });

  it("blocks Formal Exception self-approve and requester release", () => {
    expect(() =>
      assertExceptionDecisionSoD({ actorUserId: "u1", requestedByUserId: "u1" }),
    ).toThrow(SodViolationError);
    expect(() =>
      assertExceptionReleaseSoD({ releaserUserId: "u1", requestedByUserId: "u1" }),
    ).toThrow(SodViolationError);
    assertExceptionDecisionSoD({ actorUserId: "u2", requestedByUserId: "u1" });
  });

  it("blocks project-level self-grant outside existing authority", () => {
    expect(() =>
      assertRoleManagementSoD({
        actorUserId: "u1",
        targetUserId: "u1",
        actorHoldsOrgAdmin: false,
        grantsOutsideExistingAuthority: true,
      }),
    ).toThrow(SodViolationError);
  });

  it("blocks project.assign_roles self-escalation even for Org Admin", () => {
    expect(() =>
      assertProjectAssignRolesSoD({
        actorUserId: "u1",
        targetUserId: "u1",
        grantsOutsideExistingAuthority: true,
      }),
    ).toThrow(SodViolationError);
    assertProjectAssignRolesSoD({
      actorUserId: "u1",
      targetUserId: "u2",
      grantsOutsideExistingAuthority: true,
    });
  });
});
