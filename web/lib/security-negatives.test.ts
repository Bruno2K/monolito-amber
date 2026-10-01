import { describe, expect, it } from "vitest";
import { authoritativeOrganizationId } from "./guards";

describe("M3.2 security negatives (web)", () => {
  it("ignores spoofed client organization identifiers", () => {
    expect(
      authoritativeOrganizationId({
        sessionOrgId: "11111111-1111-4111-8111-111111111111",
        clientOrgId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("does not invent a tenant from a client-only orgId", () => {
    expect(authoritativeOrganizationId({ sessionOrgId: null, clientOrgId: "spoofed" })).toBeNull();
  });
});
