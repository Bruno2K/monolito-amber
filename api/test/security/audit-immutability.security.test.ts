import { describe, expect, it } from "vitest";
import { AuditService } from "../../src/audit/audit.service";

describe("API audit UPDATE/DELETE denial stub", () => {
  it("application service refuses UPDATE and DELETE", () => {
    const service = new AuditService({} as never);
    expect(() => service.denyMutation("UPDATE")).toThrow(/insert-only/);
    expect(() => service.denyMutation("DELETE")).toThrow(/insert-only/);
  });
});
