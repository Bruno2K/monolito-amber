import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_PERMISSIONS,
  ORG_SCOPED_PERMISSIONS,
  PERMISSIONS,
  RESERVED_COLLABORATION_PERMISSIONS,
  assertClosedCatalog,
  isForbiddenPermission,
  isOrgScopedPermission,
  isPermissionCode,
  isProjectScopedPermission,
  isReservedCollaborationPermission,
} from "./permissions.js";
import { ROLE_TEMPLATES } from "./role-templates.js";

describe("0.2A closed permission catalog", () => {
  it("contains only closed catalog codes and never gate.override", () => {
    expect(PERMISSIONS).not.toContain("gate.override");
    expect(FORBIDDEN_PERMISSIONS).toContain("gate.override");
    expect(isForbiddenPermission("gate.override")).toBe(true);
    expect(isPermissionCode("gate.override")).toBe(false);
    expect(isPermissionCode("organization.read_audit")).toBe(true);
    expect(isPermissionCode("gate.release")).toBe(true);
    expect(isPermissionCode("exception.approve")).toBe(true);
  });

  it("rejects invented or forbidden codes", () => {
    expect(() => assertClosedCatalog("gate.override")).toThrow(/not in the closed 0.2A catalog/);
    expect(() => assertClosedCatalog("forceRelease")).toThrow();
    expect(() => assertClosedCatalog("custom.invented")).toThrow();
  });

  it("seeds role templates only from catalog codes", () => {
    for (const template of ROLE_TEMPLATES) {
      for (const code of template.permissions) {
        expect(isPermissionCode(code), `${template.key} has invalid ${code}`).toBe(true);
        expect(code).not.toBe("gate.override");
      }
    }
    expect(ROLE_TEMPLATES).toHaveLength(9);
    expect(isPermissionCode("phase.create")).toBe(true);
    expect(isPermissionCode("deliverable.deliver")).toBe(true);
    expect(isPermissionCode("work_package.complete")).toBe(true);
  });

  it("splits org-scoped vs project-scoped vs reserved collaboration permissions", () => {
    expect(ORG_SCOPED_PERMISSIONS).toContain("project.create");
    expect(ORG_SCOPED_PERMISSIONS).toContain("project.archive");
    expect(isOrgScopedPermission("organization.read")).toBe(true);
    expect(isProjectScopedPermission("project.read")).toBe(true);
    expect(isProjectScopedPermission("project.assign_roles")).toBe(true);
    expect(isReservedCollaborationPermission("calendar.admin")).toBe(true);
    expect(isReservedCollaborationPermission("message.moderate")).toBe(true);
    expect(isOrgScopedPermission("calendar.admin")).toBe(false);
    expect(isProjectScopedPermission("calendar.admin")).toBe(false);
    expect(isProjectScopedPermission("message.moderate")).toBe(false);
    expect(
      PERMISSIONS.filter(
        (code) =>
          isOrgScopedPermission(code) || isProjectScopedPermission(code) || isReservedCollaborationPermission(code),
      ),
    ).toHaveLength(PERMISSIONS.length);
    expect(RESERVED_COLLABORATION_PERMISSIONS).toEqual(["calendar.admin", "message.moderate"]);
  });

  it("does not assign reserved Calendar/Messaging codes to any role template", () => {
    for (const template of ROLE_TEMPLATES) {
      expect(template.permissions).not.toContain("calendar.admin");
      expect(template.permissions).not.toContain("message.moderate");
    }
  });
});
