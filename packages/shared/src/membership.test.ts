import { describe, expect, it } from "vitest";
import { MembershipStateError } from "./errors.js";
import { assertMembershipTransition, isUsableMembership, shouldRevokeOrgAccess } from "./membership.js";

describe("organization membership lifecycle", () => {
  it("allows INVITED/ACTIVE/SUSPENDED/REMOVED transitions only", () => {
    assertMembershipTransition("INVITED", "ACTIVE");
    assertMembershipTransition("ACTIVE", "SUSPENDED");
    assertMembershipTransition("SUSPENDED", "ACTIVE");
    assertMembershipTransition("ACTIVE", "REMOVED");
    assertMembershipTransition("REMOVED", "INVITED");
    expect(() => assertMembershipTransition("REMOVED", "ACTIVE")).toThrow(MembershipStateError);
    expect(() => assertMembershipTransition("INVITED", "SUSPENDED")).toThrow(MembershipStateError);
  });

  it("treats only ACTIVE as usable and revokes access on suspend/remove", () => {
    expect(isUsableMembership("ACTIVE")).toBe(true);
    expect(isUsableMembership("INVITED")).toBe(false);
    expect(shouldRevokeOrgAccess("SUSPENDED")).toBe(true);
    expect(shouldRevokeOrgAccess("REMOVED")).toBe(true);
    expect(shouldRevokeOrgAccess("ACTIVE")).toBe(false);
  });
});
