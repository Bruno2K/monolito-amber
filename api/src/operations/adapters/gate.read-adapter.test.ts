import { describe, expect, it } from "vitest";
import { DenyByDefaultError } from "@amber/shared";
import { GateReadAdapter } from "./gate.read-adapter";

describe("GateReadAdapter", () => {
  it("refuses approve, release, and evaluate (Ops inspectors are read-only)", () => {
    const adapter = new GateReadAdapter({} as never);
    expect(() => adapter.approve()).toThrow(DenyByDefaultError);
    expect(() => adapter.release()).toThrow(DenyByDefaultError);
    expect(() => adapter.evaluate()).toThrow(DenyByDefaultError);
  });
});
