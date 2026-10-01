import { describe, expect, it } from "vitest";
import {
  M3_SEED_CROSS_TENANT_NEGATIVES,
  M3_SEED_DELIVERABLES,
  M3_SEED_DISCIPLINES,
  M3_SEED_EMAIL_DOMAIN,
  M3_SEED_ORGANIZATIONS,
  M3_SEED_ORG_MEMBERSHIPS,
  M3_SEED_PHASES,
  M3_SEED_PROJECT_MEMBERSHIPS,
  M3_SEED_PROJECTS,
  M3_SEED_RESET_POLICY,
  M3_SEED_TEAM_MEMBERSHIPS,
  M3_SEED_USERS,
  M3_SEED_WORK_PACKAGES,
} from "./m3-seed-design.js";

describe("M3.1 seed scenario completeness", () => {
  it("covers two Organizations, two Projects in A and one in B, and 3+ Disciplines", () => {
    expect(M3_SEED_ORGANIZATIONS).toHaveLength(2);
    expect(M3_SEED_PROJECTS.filter((row) => row.orgKey === "org-a")).toHaveLength(2);
    expect(M3_SEED_PROJECTS.filter((row) => row.orgKey === "org-b")).toHaveLength(1);
    expect(M3_SEED_DISCIPLINES.filter((row) => row.orgKey === "org-a").length).toBeGreaterThanOrEqual(3);
  });

  it("includes coordinator, discipline coordinator, contributor, viewer, external, unauthorized, and membership states", () => {
    const roles = M3_SEED_USERS.map((row) => row.role);
    expect(roles).toEqual(
      expect.arrayContaining([
        "internal coordinator",
        "discipline coordinator",
        "contributor",
        "viewer",
        "external collaborator",
        "unauthorized user",
        "team member without project access",
      ]),
    );
    expect(M3_SEED_PROJECT_MEMBERSHIPS.some((row) => row.userKey === "team-only-a")).toBe(false);
    const orgStatuses = new Set(M3_SEED_ORG_MEMBERSHIPS.map((row) => row.status));
    const projectStatuses = new Set(M3_SEED_PROJECT_MEMBERSHIPS.map((row) => row.status));
    expect(orgStatuses).toEqual(new Set(["ACTIVE", "SUSPENDED", "REMOVED"]));
    expect(projectStatuses).toEqual(new Set(["ACTIVE", "SUSPENDED", "REMOVED"]));
    expect(M3_SEED_USERS.some((row) => row.key === "unauthorized")).toBe(true);
    expect(M3_SEED_ORG_MEMBERSHIPS.some((row) => row.userKey === "unauthorized")).toBe(false);
    expect(M3_SEED_TEAM_MEMBERSHIPS.some((row) => row.userKey === "team-only-a")).toBe(true);
  });

  it("covers representative Phase, Deliverable, and WorkPackage states plus ownership XOR variants", () => {
    const phaseStatuses = M3_SEED_PHASES.map((row) => row.status);
    expect(phaseStatuses).toEqual(expect.arrayContaining(["PLANNED", "ACTIVE", "COMPLETED"]));
    const deliverableStatuses = M3_SEED_DELIVERABLES.map((row) => row.status);
    expect(deliverableStatuses).toEqual(expect.arrayContaining(["PLANNED", "IN_PROGRESS", "IN_REVIEW", "APPROVED"]));
    expect(new Set(M3_SEED_DELIVERABLES.map((row) => row.ownerKind))).toEqual(new Set(["user", "team", "none"]));
    const wpStatuses = new Set(M3_SEED_WORK_PACKAGES.map((row) => row.status));
    expect(wpStatuses).toEqual(new Set(["PLANNED", "ACTIVE", "BLOCKED", "DONE", "CANCELLED"]));
    expect(M3_SEED_WORK_PACKAGES.find((row) => row.status === "BLOCKED")?.blockedReason).toBeTruthy();
  });

  it("uses synthetic emails only, is resettable, and lists cross-tenant negatives", () => {
    expect(M3_SEED_RESET_POLICY.realPiiForbidden).toBe(true);
    expect(M3_SEED_RESET_POLICY.idempotent).toBe(true);
    expect(M3_SEED_RESET_POLICY.resettable).toBe(true);
    for (const user of M3_SEED_USERS) {
      expect(user.email.endsWith(`@${M3_SEED_EMAIL_DOMAIN}`)).toBe(true);
      expect(user.email).not.toMatch(/gmail|outlook|bruno/i);
    }
    expect(M3_SEED_CROSS_TENANT_NEGATIVES.length).toBeGreaterThanOrEqual(5);
    expect(M3_SEED_CROSS_TENANT_NEGATIVES.some((row) => row.actorUserKey === "coord-a")).toBe(true);
    expect(M3_SEED_CROSS_TENANT_NEGATIVES.some((row) => row.forbiddenOrgKey === "org-b")).toBe(true);
  });
});
