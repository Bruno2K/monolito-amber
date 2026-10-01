import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service";

export function buildIdentity() {
  return {
    status: "ok" as const,
    service: "amber-api",
    slice: "PF-1.1",
    commit: process.env.GIT_SHA ?? process.env.GITHUB_SHA ?? "dev",
    build: process.env.BUILD_ID ?? "local",
  };
}

@ApiTags("health")
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("health")
  @ApiOperation({ summary: "Liveness for the foundation API (includes commit SHA / build identity)" })
  @ApiOkResponse({ description: "API process is up" })
  getHealth() {
    return buildIdentity();
  }

  @Get("ready")
  @ApiOperation({ summary: "Readiness: process is up and Postgres is reachable (skipped when SKIP_DB=1)" })
  @ApiOkResponse({ description: "API can serve traffic" })
  async getReady() {
    const identity = buildIdentity();
    if (process.env.SKIP_DB === "1") {
      return { ...identity, ready: true, database: "skipped" as const };
    }
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ...identity, ready: true, database: "up" as const };
    } catch {
      throw new ServiceUnavailableException({
        ...identity,
        status: "unavailable",
        ready: false,
        database: "down",
      });
    }
  }
}
