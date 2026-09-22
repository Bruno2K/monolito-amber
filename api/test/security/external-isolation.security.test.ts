import { describe, expect, it } from "vitest";
import { DenyByDefaultError, assertPermission, type AuthzContext } from "@amber/shared";

describe("EXTERNAL collaborator isolation (fail closed)", () => {
  it("denies org directory, audit, and org-wide project list", () => {
    const external: AuthzContext = {
      userId: "ext",
      organizationId: "org-a",
      membershipStatus: "ACTIVE",
      membershipType: "EXTERNAL",
      mfaSatisfied: true,
      projectId: "p1",
      projectMembershipStatus: "ACTIVE",
      grants: [
        {
          templateKey: "AUDITOR",
          scope: "organization",
          permissions: ["organization.read", "organization.read_audit", "project.create"],
        },
        {
          templateKey: "EXTERNAL_CONTRIBUTOR",
          scope: "project",
          projectId: "p1",
          permissions: ["project.read", "document.read"],
        },
      ],
    };
    expect(() => assertPermission(external, "organization.read")).toThrow(DenyByDefaultError);
    expect(() => assertPermission(external, "organization.read_audit")).toThrow(DenyByDefaultError);
    expect(() => assertPermission(external, "project.create")).toThrow(DenyByDefaultError);
    expect(() => assertPermission(external, "project.read")).not.toThrow();
  });

  it("denies unrelated project access even with an assigned project role", () => {
    const external: AuthzContext = {
      userId: "ext",
      organizationId: "org-a",
      membershipStatus: "ACTIVE",
      membershipType: "EXTERNAL",
      mfaSatisfied: true,
      projectId: "p-other",
      projectMembershipStatus: "ACTIVE",
      grants: [
        {
          templateKey: "EXTERNAL_CONTRIBUTOR",
          scope: "project",
          projectId: "p1",
          permissions: ["project.read"],
        },
      ],
    };
    expect(() => assertPermission(external, "project.read")).toThrow(DenyByDefaultError);
  });
});
