import { describe, expect, it } from "vitest";
import { DenyByDefaultError, assertPermission, type AuthzContext } from "@amber/shared";

describe("unauthorized member management (fail closed)", () => {
  it("denies organization.manage_members without a grant", () => {
    const viewer: AuthzContext = {
      userId: "u1",
      organizationId: "org-a",
      membershipStatus: "ACTIVE",
      membershipType: "INTERNAL",
      grants: [{ templateKey: "VIEWER", permissions: ["project.read", "document.read", "gate.read"] }],
    };
    expect(() => assertPermission(viewer, "organization.manage_members")).toThrow(DenyByDefaultError);
  });

  it("denies EXTERNAL users from the organization directory", () => {
    const external: AuthzContext = {
      userId: "ext",
      organizationId: "org-a",
      membershipStatus: "ACTIVE",
      membershipType: "EXTERNAL",
      grants: [{ templateKey: "EXTERNAL_CONTRIBUTOR", permissions: ["project.read"] }],
    };
    expect(() => assertPermission(external, "organization.read")).toThrow(DenyByDefaultError);
  });
});
