import { describe, expect, it } from "vitest";
import {
  DenyByDefaultError,
  SodViolationError,
  assertPermission,
  assertProjectAssignRolesSoD,
  assertProjectMembershipTransition,
  type AuthzContext,
} from "@amber/shared";

const coordinator: AuthzContext = {
  userId: "coord",
  organizationId: "org-a",
  membershipStatus: "ACTIVE",
  membershipType: "INTERNAL",
  mfaSatisfied: true,
  projectId: "p1",
  projectMembershipStatus: "ACTIVE",
  grants: [
    {
      templateKey: "PROJECT_COORDINATOR",
      scope: "project",
      projectId: "p1",
      permissions: ["project.read", "project.manage_members", "project.assign_roles"],
    },
  ],
};

describe("ProjectMembership / coordinator limits (fail closed)", () => {
  it("denies project access when ProjectMembership is not ACTIVE", () => {
    expect(() =>
      assertPermission({ ...coordinator, projectMembershipStatus: "SUSPENDED" }, "project.read"),
    ).toThrow(DenyByDefaultError);
    expect(() =>
      assertPermission({ ...coordinator, projectMembershipStatus: "REMOVED" }, "project.read"),
    ).toThrow(DenyByDefaultError);
  });

  it("denies org-level permissions to a coordinator-only grant", () => {
    expect(() => assertPermission(coordinator, "organization.manage_members")).toThrow(DenyByDefaultError);
    expect(() => assertPermission(coordinator, "organization.manage_roles")).toThrow(DenyByDefaultError);
    expect(() => assertPermission(coordinator, "project.create")).toThrow(DenyByDefaultError);
  });

  it("blocks coordinator self-escalation on project.assign_roles", () => {
    expect(() =>
      assertProjectAssignRolesSoD({
        actorUserId: "coord",
        targetUserId: "coord",
        grantsOutsideExistingAuthority: true,
      }),
    ).toThrow(SodViolationError);
  });

  it("preserves ProjectMembership history transitions", () => {
    assertProjectMembershipTransition("ACTIVE", "SUSPENDED");
    assertProjectMembershipTransition("SUSPENDED", "REMOVED");
    expect(() => assertProjectMembershipTransition("REMOVED", "SUSPENDED")).toThrow();
  });
});
