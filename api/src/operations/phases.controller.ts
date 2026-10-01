import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { AuthService } from "../auth/auth.service";
import { CurrentSession } from "../auth/current-session.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/session.types";
import { PermissionGuard } from "../authz/permission.guard";
import { RequirePermission } from "../authz/require-permission.decorator";
import { PhasesService } from "./phases.service";

class CreatePhaseDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sequence?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  plannedStartAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  plannedEndAt?: string | null;

  @ApiPropertyOptional({ description: "Ignored. Server session binding is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ description: "Ignored. Path projectId is a routing hint only." })
  @IsOptional()
  @IsString()
  projectId?: string;
}

class UpdatePhaseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sequence?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  plannedStartAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  plannedEndAt?: string | null;

  @ApiPropertyOptional({ description: "Status transitions use dedicated endpoints." })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ description: "Ignored. Server session binding is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ description: "Ignored. Path projectId is a routing hint only." })
  @IsOptional()
  @IsString()
  projectId?: string;
}

class VersionedActionDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

class ReorderItemDto {
  @ApiProperty({ format: "uuid" })
  @IsString()
  id!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  sequence!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

class ReorderPhasesDto {
  @ApiProperty({ type: [ReorderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items!: ReorderItemDto[];
}

class ListPhasesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  includeArchived?: string;
}

@ApiTags("operations")
@Controller("projects/:projectId/phases")
export class PhasesController {
  constructor(
    private readonly phases: PhasesService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({ summary: "List Phases of an authorized Project (deterministic order, omit archived by default)" })
  list(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Query() query: ListPhasesQueryDto,
  ) {
    return this.phases.list(this.auth.requireSession(session), projectId, query);
  }

  @Post()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("phase.create")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({ summary: "Create a Phase in PLANNED. Dates never transit status." })
  create(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreatePhaseDto,
  ) {
    return this.phases.create(this.auth.requireSession(session), projectId, idempotencyKey, body);
  }

  @Post("reorder")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("phase.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({ summary: "Reorder Phases with compare-and-swap versions" })
  reorder(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: ReorderPhasesDto,
  ) {
    return this.phases.reorder(this.auth.requireSession(session), projectId, idempotencyKey, body);
  }

  @Get(":phaseId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "phaseId", format: "uuid" })
  @ApiOperation({ summary: "Read one Phase. Cross-tenant and cross-project ids are denied without leakage." })
  get(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("phaseId") phaseId: string,
  ) {
    return this.phases.get(this.auth.requireSession(session), projectId, phaseId);
  }

  @Patch(":phaseId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("phase.update")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "phaseId", format: "uuid" })
  @ApiOperation({ summary: "Update Phase fields. Status uses dedicated endpoints. CAS expectedVersion is required." })
  update(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("phaseId") phaseId: string,
    @Body() body: UpdatePhaseDto,
  ) {
    return this.phases.update(this.auth.requireSession(session), projectId, phaseId, body);
  }

  @Post(":phaseId/activate")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("phase.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "phaseId", format: "uuid" })
  @ApiOperation({ summary: "Explicit PLANNED → ACTIVE. Dates never auto-activate." })
  activate(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("phaseId") phaseId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: VersionedActionDto,
  ) {
    return this.phases.activate(this.auth.requireSession(session), projectId, phaseId, idempotencyKey, body);
  }

  @Post(":phaseId/complete")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("phase.complete")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "phaseId", format: "uuid" })
  @ApiOperation({ summary: "Explicit ACTIVE → COMPLETED. Completing by date mutation is rejected." })
  complete(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("phaseId") phaseId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: VersionedActionDto,
  ) {
    return this.phases.complete(this.auth.requireSession(session), projectId, phaseId, idempotencyKey, body);
  }

  @Post(":phaseId/cancel")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("phase.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "phaseId", format: "uuid" })
  @ApiOperation({ summary: "Explicit CANCELLED from PLANNED or ACTIVE" })
  cancel(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("phaseId") phaseId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: VersionedActionDto,
  ) {
    return this.phases.cancel(this.auth.requireSession(session), projectId, phaseId, idempotencyKey, body);
  }

  @Post(":phaseId/archive")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("phase.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "phaseId", format: "uuid" })
  @ApiOperation({ summary: "Soft-archive a Phase. Hard-delete is forbidden, including when referenced." })
  archive(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("phaseId") phaseId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: VersionedActionDto,
  ) {
    return this.phases.archive(this.auth.requireSession(session), projectId, phaseId, idempotencyKey, body);
  }
}
