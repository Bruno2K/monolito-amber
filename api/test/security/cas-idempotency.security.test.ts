import { describe, expect, it } from "vitest";
import { FoundationService } from "../../src/foundation/foundation.service";

describe("API CAS/idempotency stub", () => {
  it("CAS helper rejects version mismatch", () => {
    const service = new FoundationService({} as never);
    expect(() => service.cas({ version: 1 }, 2)).toThrow(/Optimistic lock/);
    expect(service.cas({ version: 1 }, 1).version).toBe(2);
  });
});
