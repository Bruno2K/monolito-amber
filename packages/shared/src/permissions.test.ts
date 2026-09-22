import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_PERMISSIONS,
  PERMISSIONS,
  assertClosedCatalog,
  isForbiddenPermission,
  isPermissionCode,
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
  });
});
