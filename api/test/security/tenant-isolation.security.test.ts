import { describe, expect, it } from "vitest";
import { DenyByDefaultError, resolveAuthorizedOrganization } from "@amber/shared";

describe("API tenant isolation stub", () => {
  it("never trusts client orgId/projectId", () => {
    expect(() =>
      resolveAuthorizedOrganization({
        session: { userId: "u", activeOrganizationId: "org-a", revokedAt: null },
        membership: { userId: "u", organizationId: "org-a", status: "ACTIVE", type: "INTERNAL" },
        clientOrganizationId: "forged",
      }),
    ).toThrow(DenyByDefaultError);
  });
});
