import { describe, expect, it } from "vitest";
import {
  HIGH_RISK_FRESHNESS_MS,
  ReauthenticationRequiredError,
  assertRecentAuthentication,
  requiresMfaEnrollment,
} from "@amber/shared";

describe("MFA and high-risk freshness (fail closed)", () => {
  it("requires MFA for Org Admin and Governance Approver", () => {
    expect(requiresMfaEnrollment(["ORGANIZATION_ADMINISTRATOR"])).toBe(true);
    expect(requiresMfaEnrollment(["GOVERNANCE_APPROVER"])).toBe(true);
    expect(requiresMfaEnrollment(["VIEWER", "AUDITOR"])).toBe(false);
  });

  it("blocks high-risk actions when re-auth is stale", () => {
    const now = new Date();
    expect(() =>
      assertRecentAuthentication({ lastReauthAt: new Date(now.getTime() - HIGH_RISK_FRESHNESS_MS - 1) }, now),
    ).toThrow(ReauthenticationRequiredError);
    assertRecentAuthentication({ lastReauthAt: now }, now);
  });
});
