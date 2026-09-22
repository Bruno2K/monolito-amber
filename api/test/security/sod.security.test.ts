import { describe, expect, it } from "vitest";
import { assertExceptionDecisionSoD, assertRevisionApprovalSoD } from "@amber/shared";

describe("API SoD stub", () => {
  it("enforces revision and Formal Exception SoD", () => {
    expect(() =>
      assertRevisionApprovalSoD({ actorUserId: "same", publishedByUserId: "same" }),
    ).toThrow();
    expect(() =>
      assertExceptionDecisionSoD({ actorUserId: "same", requestedByUserId: "same" }),
    ).toThrow();
  });
});
