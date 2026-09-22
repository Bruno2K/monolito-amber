import { describe, expect, it } from "vitest";
import { MembershipStateError } from "./errors.js";
import {
  assertMembershipTransition,
  assertProjectMembershipTransition,
  isUsableMembership,
  isUsableProjectMembership,
  shouldRevokeOrgAccess,
  shouldRevokeProjectAccess,
} from "./membership.js";

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

describe("project membership lifecycle", () => {
  it("allows ACTIVE/SUSPENDED/REMOVED transitions only", () => {
    assertProjectMembershipTransition("ACTIVE", "SUSPENDED");
    assertProjectMembershipTransition("SUSPENDED", "ACTIVE");
    assertProjectMembershipTransition("ACTIVE", "REMOVED");
    assertProjectMembershipTransition("REMOVED", "ACTIVE");
    expect(() => assertProjectMembershipTransition("REMOVED", "SUSPENDED")).toThrow(MembershipStateError);
  });

  it("treats only ACTIVE as usable and revokes access on suspend/remove", () => {
    expect(isUsableProjectMembership("ACTIVE")).toBe(true);
    expect(isUsableProjectMembership("SUSPENDED")).toBe(false);
    expect(isUsableProjectMembership(null)).toBe(false);
    expect(shouldRevokeProjectAccess("SUSPENDED")).toBe(true);
    expect(shouldRevokeProjectAccess("REMOVED")).toBe(true);
  });
});
