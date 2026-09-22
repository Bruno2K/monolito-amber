import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("returns foundation liveness", () => {
    const controller = new HealthController();
    expect(controller.getHealth()).toEqual({
      status: "ok",
      service: "amber-api",
      slice: "PF-1.0",
    });
  });
});
