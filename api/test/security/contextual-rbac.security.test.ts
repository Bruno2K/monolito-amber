import { describe, expect, it } from "vitest";
import {
  DenyByDefaultError,
  assertOperationalRoleDefinition,
  assertPermission,
  hasPermission,
  type AuthzContext,
} from "@amber/shared";

const mixed: AuthzContext = {
  userId: "u1",
  organizationId: "org-a",
  membershipStatus: "ACTIVE",
  membershipType: "INTERNAL",
  mfaSatisfied: true,
  projectId: "p1",
  projectMembershipStatus: "ACTIVE",
  grants: [
    {
      templateKey: "ORGANIZATION_ADMINISTRATOR",
      scope: "organization",
      permissions: ["organization.read", "project.create", "project.read", "project.archive"],
    },
    {
      templateKey: "VIEWER",
      scope: "project",
      projectId: "p1",
      permissions: ["project.read", "document.read"],
    },
    {
      templateKey: "PROJECT_COORDINATOR",
      scope: "project",
      projectId: "p2",
      permissions: ["project.read", "project.assign_roles"],
    },
  ],
};

describe("contextual RBAC (fail closed)", () => {
  it("keeps org-scoped and project-scoped authority explicit", () => {
    expect(hasPermission(mixed, "project.create")).toBe(true);
    expect(hasPermission(mixed, "project.read")).toBe(true);
    expect(hasPermission(mixed, "project.assign_roles")).toBe(false);
    expect(hasPermission({ ...mixed, projectId: "p2" }, "document.read")).toBe(false);
    expect(hasPermission({ ...mixed, projectId: "p2" }, "project.assign_roles")).toBe(true);
  });

  it("denies forged project context and global templates as grants", () => {
    expect(() => assertPermission({ ...mixed, projectId: "p-forged" }, "project.read")).toThrow(DenyByDefaultError);
    expect(() =>
      assertOperationalRoleDefinition({
        roleOrganizationId: null,
        authorizedOrganizationId: "org-a",
        isSystemTemplate: true,
      }),
    ).toThrow(DenyByDefaultError);
  });
});
