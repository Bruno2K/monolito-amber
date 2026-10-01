import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiParam, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { AuthService } from "../auth/auth.service";
import { CurrentSession } from "../auth/current-session.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/session.types";
import { TeamsService } from "./teams.service";

class ListTeamsQueryDto {
  @ApiPropertyOptional({ description: "Routing hint. Session Organization remains authoritative." })
  @IsOptional()
  @IsString()
  projectId?: string;
}

@ApiTags("operations")
@Controller("organizations/:organizationId/teams")
export class TeamsController {
  constructor(
    private readonly teams: TeamsService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiParam({ name: "organizationId", format: "uuid" })
  @ApiOperation({
    summary:
      "List visible Organization Teams for Deliverable ownership. Team membership does not grant Project access.",
  })
  list(
    @CurrentSession() session: RequestSession,
    @Param("organizationId") organizationId: string,
    @Query() query: ListTeamsQueryDto,
  ) {
    return this.teams.list(this.auth.requireSession(session), organizationId, query);
  }
}
