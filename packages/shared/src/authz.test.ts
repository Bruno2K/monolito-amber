import { describe, expect, it } from "vitest";
import { DenyByDefaultError, MfaRequiredError } from "./errors.js";
import {
  assertPermission,
  grantsOutsideExistingAuthority,
  hasPermission,
  mfaRequirementSatisfied,
  requiresMfaEnrollment,
  resolvePermissions,
} from "./authz.js";
import type { AuthzContext } from "./authz.js";

const admin: AuthzContext = {
  userId: "u1",
  organizationId: "org-a",
  membershipStatus: "ACTIVE",
  membershipType: "ADMINISTRATIVE",
  mfaSatisfied: true,
  grants: [
    {
      templateKey: "ORGANIZATION_ADMINISTRATOR",
      scope: "organization",
      permissions: [
        "organization.read",
        "organization.manage_members",
        "project.create",
        "project.read",
        "project.archive",
      ],
    },
  ],
};

describe("permission resolution", () => {
  it("unions org-scoped grants only and ignores inactive memberships", () => {
    expect(resolvePermissions(admin)).toEqual([
      "organization.read",
      "organization.manage_members",
      "project.create",
      "project.archive",
    ]);
    expect(resolvePermissions({ ...admin, membershipStatus: "SUSPENDED" })).toEqual([]);
  });

  it("does not treat org-level bindings as implicit project access", () => {
    const context: AuthzContext = {
      ...admin,
      projectId: "p1",
      projectMembershipStatus: "ACTIVE",
    };
    expect(hasPermission(context, "project.read")).toBe(false);
    expect(() => assertPermission(context, "project.read")).toThrow(DenyByDefaultError);
  });

  it("unions project assignments only inside the selected Project", () => {
    const context: AuthzContext = {
      ...admin,
      projectId: "p1",
      projectMembershipStatus: "ACTIVE",
      grants: [
        ...admin.grants,
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
          permissions: ["project.read", "project.update", "project.assign_roles"],
        },
      ],
    };
    expect(resolvePermissions(context)).toEqual(
      expect.arrayContaining(["organization.read", "project.read", "document.read"]),
    );
    expect(hasPermission(context, "project.update")).toBe(false);
    expect(hasPermission({ ...context, projectId: "p2" }, "project.update")).toBe(true);
    expect(hasPermission({ ...context, projectId: "p2" }, "document.read")).toBe(false);
  });

  it("denies project-scoped permissions without ACTIVE ProjectMembership", () => {
    const context: AuthzContext = {
      ...admin,
      projectId: "p1",
      projectMembershipStatus: "SUSPENDED",
      grants: [
        {
          templateKey: "VIEWER",
          scope: "project",
          projectId: "p1",
          permissions: ["project.read"],
        },
      ],
    };
    expect(resolvePermissions(context)).toEqual([]);
    expect(() => assertPermission(context, "project.read")).toThrow(DenyByDefaultError);
  });

  it("denies EXTERNAL org-wide directory/audit even if a grant is present", () => {
    const external: AuthzContext = {
      ...admin,
      membershipType: "EXTERNAL",
      grants: [
        {
          templateKey: "AUDITOR",
          scope: "organization",
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
    expect(mfaRequirementSatisfied({ templateKeys: ["ORGANIZATION_ADMINISTRATOR"], enrolled: false })).toBe(
      false,
    );
    expect(mfaRequirementSatisfied({ templateKeys: ["VIEWER"], enrolled: false })).toBe(true);
  });

  it("fails closed on privileged grants until MFA is satisfied", () => {
    const unenrolledAdmin: AuthzContext = { ...admin, mfaSatisfied: false };
    expect(resolvePermissions(unenrolledAdmin)).toEqual([]);
    expect(() => assertPermission(unenrolledAdmin, "organization.manage_members")).toThrow(MfaRequiredError);

    const unenrolledApprover: AuthzContext = {
      ...admin,
      projectId: "p1",
      projectMembershipStatus: "ACTIVE",
      mfaSatisfied: false,
      grants: [
        {
          templateKey: "GOVERNANCE_APPROVER",
          scope: "project",
          projectId: "p1",
          permissions: ["exception.approve", "exception.reject", "gate.read"],
        },
      ],
    };
    expect(() => assertPermission(unenrolledApprover, "exception.approve")).toThrow(MfaRequiredError);

    const mixed: AuthzContext = {
      ...admin,
      projectId: "p1",
      projectMembershipStatus: "ACTIVE",
      mfaSatisfied: false,
      grants: [
        ...admin.grants,
        { templateKey: "VIEWER", scope: "project", projectId: "p1", permissions: ["project.read", "document.read"] },
      ],
    };
    expect(resolvePermissions(mixed)).toEqual(["project.read", "document.read"]);
    expect(() => assertPermission(mixed, "organization.manage_members")).toThrow(MfaRequiredError);
    expect(() => assertPermission(mixed, "project.read")).not.toThrow();
  });

  it("detects self-escalation when a new template or permission is granted", () => {
    expect(
      grantsOutsideExistingAuthority({
        existingTemplateKeys: ["VIEWER"],
        existingPermissions: ["project.read", "document.read"],
        nextTemplateKey: "PROJECT_COORDINATOR",
        nextPermissions: ["project.read", "project.assign_roles"],
      }),
    ).toBe(true);
    expect(
      grantsOutsideExistingAuthority({
        existingTemplateKeys: ["VIEWER"],
        existingPermissions: ["project.read", "document.read"],
        nextTemplateKey: "VIEWER",
        nextPermissions: ["project.read", "document.read"],
      }),
    ).toBe(false);
  });
});
