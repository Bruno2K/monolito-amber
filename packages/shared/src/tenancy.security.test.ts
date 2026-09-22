import { describe, expect, it } from "vitest";
import { DenyByDefaultError } from "./errors.js";
import {
  denyExternalOrgWideAccess,
  evaluateOrgSwitch,
  resolveAuthorizedOrganization,
  assertProjectInOrganization,
  assertOperationalRoleDefinition,
  resolveAuthorizedProject,
} from "./tenancy.js";

const session = {
  userId: "user-1",
  activeOrganizationId: "org-a",
  revokedAt: null,
};

const membership = {
  userId: "user-1",
  organizationId: "org-a",
  status: "ACTIVE" as const,
  type: "INTERNAL" as const,
};

describe("F-04 tenant isolation (fail closed)", () => {
  it("uses session-bound org as the only authority", () => {
    const org = resolveAuthorizedOrganization({ session, membership });
    expect(org).toBe("org-a");
  });

  it("denies when client/path org does not match session", () => {
    expect(() =>
      resolveAuthorizedOrganization({
        session,
        membership,
        pathOrganizationId: "org-forged",
      }),
    ).toThrow(DenyByDefaultError);
  });

  it("denies missing session, missing membership, and inactive membership", () => {
    expect(() =>
      resolveAuthorizedOrganization({ session: null, membership }),
    ).toThrow(DenyByDefaultError);
    expect(() =>
      resolveAuthorizedOrganization({
        session: { ...session, activeOrganizationId: null },
        membership,
      }),
    ).toThrow(DenyByDefaultError);
    expect(() =>
      resolveAuthorizedOrganization({
        session,
        membership: { ...membership, status: "SUSPENDED" },
      }),
    ).toThrow(DenyByDefaultError);
  });

  it("denies org-switch without ACTIVE membership", () => {
    expect(() =>
      evaluateOrgSwitch({
        session,
        targetOrganizationId: "org-b",
        membership: null,
      }),
    ).toThrow(DenyByDefaultError);

    const result = evaluateOrgSwitch({
      session,
      targetOrganizationId: "org-a",
      membership,
    });
    expect(result.nextActiveOrganizationId).toBe("org-a");
  });

  it("denies forged project binding and EXTERNAL org-wide access", () => {
    expect(() =>
      assertProjectInOrganization({
        projectOrganizationId: "org-other",
        authorizedOrganizationId: "org-a",
      }),
    ).toThrow(DenyByDefaultError);
    expect(() => denyExternalOrgWideAccess("EXTERNAL", "audit")).toThrow(DenyByDefaultError);
  });

  it("never treats client/path projectId as authority", () => {
    expect(
      resolveAuthorizedProject({
        projectId: "p1",
        projectOrganizationId: "org-a",
        authorizedOrganizationId: "org-a",
      }),
    ).toBe("p1");
    expect(() =>
      resolveAuthorizedProject({
        projectId: "p1",
        projectOrganizationId: "org-b",
        authorizedOrganizationId: "org-a",
        pathProjectId: "p1",
      }),
    ).toThrow(DenyByDefaultError);
    expect(() =>
      resolveAuthorizedProject({
        projectId: "p1",
        projectOrganizationId: "org-a",
        authorizedOrganizationId: "org-a",
        clientProjectId: "p-forged",
      }),
    ).toThrow(DenyByDefaultError);
  });

  it("rejects global Amber Role Templates as operational grants", () => {
    expect(() =>
      assertOperationalRoleDefinition({
        roleOrganizationId: null,
        authorizedOrganizationId: "org-a",
        isSystemTemplate: true,
      }),
    ).toThrow(DenyByDefaultError);
    expect(() =>
      assertOperationalRoleDefinition({
        roleOrganizationId: "org-b",
        authorizedOrganizationId: "org-a",
        isSystemTemplate: false,
      }),
    ).toThrow(DenyByDefaultError);
    assertOperationalRoleDefinition({
      roleOrganizationId: "org-a",
      authorizedOrganizationId: "org-a",
      isSystemTemplate: false,
    });
  });
});
