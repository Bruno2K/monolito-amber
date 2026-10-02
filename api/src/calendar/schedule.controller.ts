import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { AuthService } from "../auth/auth.service";
import { CurrentSession } from "../auth/current-session.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/session.types";
import { ScheduleService } from "./schedule.service";

class ScheduleQueryDto {
  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ description: "Include owned calendars. Default true." })
  @IsOptional()
  @IsString()
  includeOwned?: string;

  @ApiPropertyOptional({ description: "Include direct USER grants. Default true." })
  @IsOptional()
  @IsString()
  includeDirect?: string;

  @ApiPropertyOptional({ description: "Include TEAM grants. Default true." })
  @IsOptional()
  @IsString()
  includeTeam?: string;

  @ApiPropertyOptional({ description: "Include authorized Project planning dates. Default true." })
  @IsOptional()
  @IsString()
  includeProjectDates?: string;
}

@ApiTags("calendars")
@Controller("schedule")
export class ScheduleController {
  constructor(
    private readonly schedule: ScheduleService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: "My Schedule merge of owned/granted calendars and authorized project dates. Per-source re-auth.",
  })
  get(@CurrentSession() session: RequestSession, @Query() query: ScheduleQueryDto) {
    return this.schedule.get(this.auth.requireSession(session), query);
  }
}
