import { describe, expect, it } from "vitest";
import {
  HIGH_RISK_FRESHNESS_MS,
  MfaRequiredError,
  ReauthenticationRequiredError,
  assertPermission,
  assertRecentAuthentication,
  requiresMfaEnrollment,
  type AuthzContext,
} from "@amber/shared";

describe("MFA and high-risk freshness (fail closed)", () => {
  it("requires MFA for Org Admin and Governance Approver", () => {
    expect(requiresMfaEnrollment(["ORGANIZATION_ADMINISTRATOR"])).toBe(true);
    expect(requiresMfaEnrollment(["GOVERNANCE_APPROVER"])).toBe(true);
    expect(requiresMfaEnrollment(["VIEWER", "AUDITOR"])).toBe(false);
  });

  it("denies privileged authorization when MFA is required but unenrolled", () => {
    const unenrolled: AuthzContext = {
      userId: "admin",
      organizationId: "org-a",
      membershipStatus: "ACTIVE",
      membershipType: "ADMINISTRATIVE",
      mfaSatisfied: false,
      grants: [
        {
          templateKey: "ORGANIZATION_ADMINISTRATOR",
          scope: "organization",
          permissions: ["organization.manage_members", "organization.manage_roles"],
        },
      ],
    };
    expect(() => assertPermission(unenrolled, "organization.manage_members")).toThrow(MfaRequiredError);
    expect(() => assertPermission({ ...unenrolled, mfaSatisfied: true }, "organization.manage_members")).not.toThrow();
  });

  it("blocks high-risk actions when re-auth is stale", () => {
    const now = new Date();
    expect(() =>
      assertRecentAuthentication({ lastReauthAt: new Date(now.getTime() - HIGH_RISK_FRESHNESS_MS - 1) }, now),
    ).toThrow(ReauthenticationRequiredError);
    assertRecentAuthentication({ lastReauthAt: now }, now);
  });
});
