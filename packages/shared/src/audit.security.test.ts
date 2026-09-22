import { describe, expect, it } from "vitest";
import { AuditMutationDeniedError } from "./errors.js";
import { assertAuditMutationAllowed, canReadAudit } from "./audit.js";

describe("F-09 audit immutability (fail closed)", () => {
  it("denies UPDATE and DELETE for application credentials", () => {
    expect(() => assertAuditMutationAllowed("UPDATE")).toThrow(AuditMutationDeniedError);
    expect(() => assertAuditMutationAllowed("DELETE")).toThrow(AuditMutationDeniedError);
    expect(() => assertAuditMutationAllowed("INSERT")).not.toThrow();
    expect(() => assertAuditMutationAllowed("SELECT")).not.toThrow();
  });

  it("requires organization.read_audit plus tenant/project scope", () => {
    expect(
      canReadAudit({
        hasReadAuditPermission: false,
        actorOrganizationId: "org-a",
        rowOrganizationId: "org-a",
      }),
    ).toBe(false);
    expect(
      canReadAudit({
        hasReadAuditPermission: true,
        actorOrganizationId: "org-a",
        rowOrganizationId: "org-b",
      }),
    ).toBe(false);
    expect(
      canReadAudit({
        hasReadAuditPermission: true,
        actorOrganizationId: "org-a",
        rowOrganizationId: "org-a",
        actorProjectIds: ["p1"],
        rowProjectId: "p2",
      }),
    ).toBe(false);
    expect(
      canReadAudit({
        hasReadAuditPermission: true,
        actorOrganizationId: "org-a",
        rowOrganizationId: "org-a",
        actorProjectIds: ["p1"],
        rowProjectId: "p1",
      }),
    ).toBe(true);
  });
});
