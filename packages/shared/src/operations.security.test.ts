import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_PERMISSIONS,
  OPERATIONS_PERMISSIONS,
  PERMISSIONS,
  isForbiddenPermission,
  isOrgScopedPermission,
  isPermissionCode,
  isProjectScopedPermission,
} from "./permissions.js";
import { ROLE_TEMPLATES, roleTemplateByKey } from "./role-templates.js";
import {
  DISCIPLINE_COORDINATOR_OPERATIONS_PERMISSIONS,
  OPERATIONS_NO_MUTATION_ROLE_KEYS,
  PROJECT_COORDINATOR_OPERATIONS_PERMISSIONS,
} from "./operations.js";

describe("M3.1 operations catalog security floors", () => {
  it("keeps permission codes unique and never introduces gate.override", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
    expect(PERMISSIONS).not.toContain("gate.override");
    expect(FORBIDDEN_PERMISSIONS).toContain("gate.override");
    expect(isForbiddenPermission("gate.override")).toBe(true);
    expect(isPermissionCode("gate.override")).toBe(false);
    for (const code of OPERATIONS_PERMISSIONS) {
      expect(isPermissionCode(code)).toBe(true);
      expect(isProjectScopedPermission(code)).toBe(true);
      expect(isOrgScopedPermission(code)).toBe(false);
      expect(code.includes("override")).toBe(false);
    }
  });

  it("does not invent phase.read / deliverable.read / work_package.read — reads use project.read", () => {
    expect(isPermissionCode("phase.read")).toBe(false);
    expect(isPermissionCode("deliverable.read")).toBe(false);
    expect(isPermissionCode("work_package.read")).toBe(false);
    expect(PERMISSIONS).toContain("project.read");
  });

  it("does not invent a hub mutation permission or OVERDUE status", () => {
    expect(isPermissionCode("hub.write")).toBe(false);
    expect(isPermissionCode("hub.update")).toBe(false);
    expect(isForbiddenPermission("gate.override")).toBe(true);
  });

  it("extends Project Coordinator with full Operations management and Discipline Coordinator within Deliverable/WP scope", () => {
    const coordinator = roleTemplateByKey("PROJECT_COORDINATOR").permissions;
    const discipline = roleTemplateByKey("DISCIPLINE_COORDINATOR").permissions;
    for (const code of PROJECT_COORDINATOR_OPERATIONS_PERMISSIONS) {
      expect(coordinator).toContain(code);
    }
    for (const code of DISCIPLINE_COORDINATOR_OPERATIONS_PERMISSIONS) {
      expect(discipline).toContain(code);
    }
    expect(discipline).not.toContain("phase.create");
    expect(discipline).not.toContain("phase.complete");
    expect(discipline).not.toContain("deliverable.approve");
    expect(discipline).not.toContain("deliverable.deliver");
  });

  it("does not grant Operations mutation to Contributor, Viewer, External, Reviewer, Auditor, or Governance Approver", () => {
    for (const key of OPERATIONS_NO_MUTATION_ROLE_KEYS) {
      const granted = roleTemplateByKey(key).permissions;
      for (const code of OPERATIONS_PERMISSIONS) {
        expect(granted, `${key} must not receive ${code}`).not.toContain(code);
      }
    }
  });

  it("keeps nine role templates and seeds only catalog codes", () => {
    expect(ROLE_TEMPLATES).toHaveLength(9);
    for (const template of ROLE_TEMPLATES) {
      expect(new Set(template.permissions).size).toBe(template.permissions.length);
      for (const code of template.permissions) {
        expect(isPermissionCode(code)).toBe(true);
        expect(code).not.toBe("gate.override");
      }
    }
  });
});
