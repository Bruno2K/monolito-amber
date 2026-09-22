import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

@ApiTags("health")
@Controller("health")
export class HealthController {
  @Get()
  @ApiOperation({ summary: "Liveness/readiness for the foundation API" })
  @ApiOkResponse({ description: "API is up" })
  getHealth() {
    return {
      status: "ok",
      service: "amber-api",
      slice: "PF-1.1",
    };
  }
}
