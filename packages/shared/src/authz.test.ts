import { describe, expect, it } from "vitest";
import { DenyByDefaultError } from "./errors.js";
import { assertPermission, hasPermission, requiresMfaEnrollment, resolvePermissions } from "./authz.js";
import type { AuthzContext } from "./authz.js";

const admin: AuthzContext = {
  userId: "u1",
  organizationId: "org-a",
  membershipStatus: "ACTIVE",
  membershipType: "ADMINISTRATIVE",
  grants: [
    {
      templateKey: "ORGANIZATION_ADMINISTRATOR",
      permissions: ["organization.read", "organization.manage_members"],
    },
  ],
};

describe("permission resolution", () => {
  it("unions org-level grants and ignores inactive memberships", () => {
    expect(resolvePermissions(admin)).toEqual(["organization.read", "organization.manage_members"]);
    expect(
      resolvePermissions({ ...admin, membershipStatus: "SUSPENDED" }),
    ).toEqual([]);
  });

  it("scopes project grants and deny-by-defaults missing permissions", () => {
    const context: AuthzContext = {
      ...admin,
      projectId: "p1",
      grants: [
        {
          templateKey: "VIEWER",
          permissions: ["project.read"],
          projectId: "p2",
        },
      ],
    };
    expect(hasPermission(context, "project.read")).toBe(false);
    expect(() => assertPermission(context, "project.read")).toThrow(DenyByDefaultError);
  });

  it("denies EXTERNAL org-wide directory/audit even if a grant is present", () => {
    const external: AuthzContext = {
      ...admin,
      membershipType: "EXTERNAL",
      grants: [
        {
          templateKey: "AUDITOR",
          permissions: ["organization.read_audit"],
        },
      ],
    };
    expect(() => assertPermission(external, "organization.read_audit")).toThrow(DenyByDefaultError);
  });

  it("requires MFA for Org Admin and Governance Approver templates", () => {
    expect(requiresMfaEnrollment(["ORGANIZATION_ADMINISTRATOR"])).toBe(true);
    expect(requiresMfaEnrollment(["GOVERNANCE_APPROVER"])).toBe(true);
    expect(requiresMfaEnrollment(["VIEWER"])).toBe(false);
  });
});
