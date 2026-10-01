import { describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { buildIdentity, HealthController } from "./health.controller";

function fakePrisma(query: () => Promise<unknown> = async () => [{ "?column?": 1 }]): PrismaService {
  return { $queryRaw: query } as unknown as PrismaService;
}

describe("HealthController", () => {
  it("returns liveness with commit / build identity", () => {
    const previousSha = process.env.GIT_SHA;
    const previousBuild = process.env.BUILD_ID;
    process.env.GIT_SHA = "abc1234";
    process.env.BUILD_ID = "local-rc";
    const controller = new HealthController(fakePrisma());
    expect(controller.getHealth()).toEqual({
      status: "ok",
      service: "amber-api",
      slice: "PF-1.1",
      commit: "abc1234",
      build: "local-rc",
    });
    if (previousSha === undefined) {
      delete process.env.GIT_SHA;
    } else {
      process.env.GIT_SHA = previousSha;
    }
    if (previousBuild === undefined) {
      delete process.env.BUILD_ID;
    } else {
      process.env.BUILD_ID = previousBuild;
    }
  });

  it("skips the database probe when SKIP_DB=1", async () => {
    const previous = process.env.SKIP_DB;
    process.env.SKIP_DB = "1";
    const controller = new HealthController(fakePrisma());
    await expect(controller.getReady()).resolves.toMatchObject({
      status: "ok",
      ready: true,
      database: "skipped",
    });
    if (previous === undefined) {
      delete process.env.SKIP_DB;
    } else {
      process.env.SKIP_DB = previous;
    }
  });

  it("buildIdentity defaults commit to dev when unset", () => {
    const previous = process.env.GIT_SHA;
    delete process.env.GIT_SHA;
    delete process.env.GITHUB_SHA;
    expect(buildIdentity().commit).toBe("dev");
    if (previous !== undefined) {
      process.env.GIT_SHA = previous;
    }
  });
});
