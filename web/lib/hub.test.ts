import { describe, expect, it } from "vitest";
import { hubItemLabel, relatedSourceKeys } from "./hub";

describe("hub helpers", () => {
  it("labels items with code when present", () => {
    expect(hubItemLabel({ id: "1", title: "Pack", status: "PLANNED", code: "DEL-1" })).toBe("DEL-1 · Pack");
    expect(hubItemLabel({ id: "1", title: "Pack", status: "PLANNED" })).toBe("Pack");
  });

  it("lists only present related sources", () => {
    expect(relatedSourceKeys({ issues: { origin: "x", derivation: "y", permission: "project.read", count: 1, api: "/" } })).toEqual(
      ["issues"],
    );
  });
});
