import { describe, expect, it } from "vitest";
import { DenyByDefaultError } from "./errors.js";
import { assertPermission, hasPermission, resolvePermissions, type AuthzContext } from "./authz.js";
import { isOrgScopedPermission, isProjectScopedPermission } from "./permissions.js";

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
      permissions: ["project.read", "project.update", "project.manage_members", "project.assign_roles"],
    },
  ],
};

describe("contextual RBAC (fail closed)", () => {
  it("classifies catalog scopes without inventing permissions", () => {
    expect(isOrgScopedPermission("organization.manage_roles")).toBe(true);
    expect(isOrgScopedPermission("project.create")).toBe(true);
    expect(isOrgScopedPermission("project.archive")).toBe(true);
    expect(isProjectScopedPermission("project.read")).toBe(true);
    expect(isProjectScopedPermission("project.assign_roles")).toBe(true);
    expect(isProjectScopedPermission("document.read")).toBe(true);
    expect(isProjectScopedPermission("gate.evaluate")).toBe(true);
    expect(isProjectScopedPermission("exception.approve")).toBe(true);
  });

  it("denies forged/cross-project grants and org-level leakage", () => {
    expect(hasPermission({ ...coordinator, projectId: "p-forged" }, "project.read")).toBe(false);
    expect(() => assertPermission({ ...coordinator, projectId: undefined }, "project.read")).toThrow(
      DenyByDefaultError,
    );
    expect(resolvePermissions({ ...coordinator, projectMembershipStatus: "REMOVED" })).toEqual([]);
  });

  it("denies EXTERNAL isolation surfaces even with project grants", () => {
    const external: AuthzContext = {
      ...coordinator,
      membershipType: "EXTERNAL",
      grants: [
        ...coordinator.grants,
        {
          templateKey: "AUDITOR",
          scope: "organization",
          permissions: ["organization.read", "organization.read_audit", "project.create"],
        },
      ],
    };
    expect(() => assertPermission(external, "organization.read")).toThrow(DenyByDefaultError);
    expect(() => assertPermission(external, "organization.read_audit")).toThrow(DenyByDefaultError);
    expect(() => assertPermission(external, "project.create")).toThrow(DenyByDefaultError);
    expect(() => assertPermission(external, "project.read")).not.toThrow();
  });
});
