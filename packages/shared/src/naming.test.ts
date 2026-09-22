import { describe, expect, it } from "vitest";
import { NamingValidationError } from "./errors.js";
import { assertNamingValid, validateDefaultNaming } from "./naming.js";

describe("naming validation boundary", () => {
  it("requires structural identifiers only — no invented BIM rules", () => {
    expect(
      validateDefaultNaming({
        documentCode: "ARC-100",
        revisionCode: "R01",
        title: "Floor plan",
        fileName: "plan.pdf",
      }).ok,
    ).toBe(true);
    expect(
      validateDefaultNaming({
        documentCode: "",
        revisionCode: "R01",
        title: "Floor plan",
      }).ok,
    ).toBe(false);
  });

  it("rejects path-like names without imposing client BIM schemes", () => {
    const result = validateDefaultNaming({
      documentCode: "../etc",
      revisionCode: "R01",
      title: "x",
      fileName: "../../secret.pdf",
    });
    expect(result.ok).toBe(false);
    expect(() =>
      assertNamingValid({
        documentCode: "",
        revisionCode: "",
        title: "",
      }),
    ).toThrow(NamingValidationError);
  });
});
