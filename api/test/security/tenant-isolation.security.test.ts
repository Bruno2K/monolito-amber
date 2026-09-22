import { describe, expect, it } from "vitest";
import {
  DenyByDefaultError,
  evaluateOrgSwitch,
  resolveAuthorizedOrganization,
  resolveAuthorizedProject,
} from "@amber/shared";

const sessionA = {
  userId: "user-1",
  activeOrganizationId: "org-a",
  revokedAt: null,
};

const membershipA = {
  userId: "user-1",
  organizationId: "org-a",
  status: "ACTIVE" as const,
  type: "INTERNAL" as const,
};

describe("F-04 tenant isolation (fail closed)", () => {
  it("never trusts a forged client or path orgId", () => {
    expect(() =>
      resolveAuthorizedOrganization({
        session: sessionA,
        membership: membershipA,
        clientOrganizationId: "org-b",
      }),
    ).toThrow(DenyByDefaultError);
    expect(() =>
      resolveAuthorizedOrganization({
        session: sessionA,
        membership: membershipA,
        pathOrganizationId: "org-b",
      }),
    ).toThrow(DenyByDefaultError);
  });

  it("denies Org B membership while session is bound to Org A", () => {
    expect(() =>
      resolveAuthorizedOrganization({
        session: sessionA,
        membership: { ...membershipA, organizationId: "org-b" },
      }),
    ).toThrow(DenyByDefaultError);
  });

  it("denies org-switch without ACTIVE membership, including SUSPENDED and REMOVED", () => {
    expect(() =>
      evaluateOrgSwitch({ session: sessionA, targetOrganizationId: "org-b", membership: null }),
    ).toThrow(DenyByDefaultError);
    expect(() =>
      evaluateOrgSwitch({
        session: sessionA,
        targetOrganizationId: "org-b",
        membership: { userId: "user-1", organizationId: "org-b", status: "SUSPENDED", type: "INTERNAL" },
      }),
    ).toThrow(DenyByDefaultError);
    expect(() =>
      evaluateOrgSwitch({
        session: sessionA,
        targetOrganizationId: "org-b",
        membership: { userId: "user-1", organizationId: "org-b", status: "REMOVED", type: "INTERNAL" },
      }),
    ).toThrow(DenyByDefaultError);
  });

  it("never trusts a forged path/body projectId", () => {
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
});
