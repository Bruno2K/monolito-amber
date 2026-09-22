import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";
import { AuthService } from "../auth/auth.service";
import { CurrentSession } from "../auth/current-session.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/session.types";
import { PermissionGuard } from "../authz/permission.guard";
import { RequirePermission } from "../authz/require-permission.decorator";
import { MilestonesService } from "./milestones.service";

class CreateMilestoneDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetDate?: string;

  @ApiPropertyOptional({ description: "Ignored. Server session binding is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ description: "Ignored. Path projectId is a routing hint only." })
  @IsOptional()
  @IsString()
  projectId?: string;
}

class UpdateMilestoneDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

class AchieveMilestoneDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

class CancelMilestoneDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

@ApiTags("planning")
@Controller("projects/:projectId/milestones")
export class MilestonesController {
  constructor(
    private readonly milestones: MilestonesService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({ summary: "List Milestones. status is derived; recordedStatus is the stored explicit state." })
  list(@CurrentSession() session: RequestSession, @Param("projectId") projectId: string) {
    return this.milestones.list(this.auth.requireSession(session), projectId);
  }

  @Post()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("milestone.create")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({ summary: "Create a Milestone in PLANNED. AT_RISK / MISSED are derived, not client-set." })
  create(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateMilestoneDto,
  ) {
    return this.milestones.create(this.auth.requireSession(session), projectId, idempotencyKey, body);
  }

  @Get(":milestoneId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "milestoneId", format: "uuid" })
  get(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("milestoneId") milestoneId: string,
  ) {
    return this.milestones.get(this.auth.requireSession(session), projectId, milestoneId);
  }

  @Patch(":milestoneId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("milestone.update")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "milestoneId", format: "uuid" })
  @ApiOperation({ summary: "Update Milestone fields. Status is not patchable." })
  update(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("milestoneId") milestoneId: string,
    @Body() body: UpdateMilestoneDto,
  ) {
    return this.milestones.update(this.auth.requireSession(session), projectId, milestoneId, body);
  }

  @Post(":milestoneId/achieve")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("milestone.achieve")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "milestoneId", format: "uuid" })
  @ApiOperation({ summary: "Explicitly achieve a Milestone. Completing linked Tasks does not achieve it." })
  achieve(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("milestoneId") milestoneId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: AchieveMilestoneDto,
  ) {
    return this.milestones.achieve(this.auth.requireSession(session), projectId, milestoneId, idempotencyKey, body);
  }

  @Post(":milestoneId/cancel")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("milestone.update")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "milestoneId", format: "uuid" })
  @ApiOperation({ summary: "Cancel a planned Milestone" })
  cancel(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("milestoneId") milestoneId: string,
    @Body() body: CancelMilestoneDto,
  ) {
    return this.milestones.cancel(this.auth.requireSession(session), projectId, milestoneId, body);
  }
}
