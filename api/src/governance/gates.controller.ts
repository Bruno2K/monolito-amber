import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Min, MinLength } from "class-validator";
import { AuthService } from "../auth/auth.service";
import { CurrentSession } from "../auth/current-session.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/session.types";
import { PermissionGuard } from "../authz/permission.guard";
import { RequirePermission } from "../authz/require-permission.decorator";
import { GatesService } from "./gates.service";

class CreateGateDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: "Ignored. Server session binding is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ description: "Ignored. Path projectId is a routing hint only." })
  @IsOptional()
  @IsString()
  projectId?: string;
}

class AddRequirementDto {
  @ApiProperty({
    enum: [
      "DOCUMENT_REQUIRED",
      "REVISION_APPROVED",
      "ISSUE_STATE",
      "TASK_STATE",
      "MILESTONE_STATE",
      "MANUAL_APPROVAL",
      "CHECKLIST_COMPLETE",
    ],
  })
  @IsString()
  type!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional({ type: Object, description: "Typed predicate config JSON." })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object, description: "Requirement-scoped checklist for CHECKLIST_COMPLETE." })
  @IsOptional()
  @IsObject()
  checklist?: Record<string, unknown>;

  @ApiPropertyOptional({ description: "Ignored. Server session binding is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ description: "Ignored. Path projectId is a routing hint only." })
  @IsOptional()
  @IsString()
  projectId?: string;
}

class ConfigureRequirementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  checklist?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @ApiPropertyOptional({ description: "Ignored. Server session binding is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ description: "Ignored. Path projectId is a routing hint only." })
  @IsOptional()
  @IsString()
  projectId?: string;
}

class ReleaseGateDto {
  @ApiProperty({ description: "Required CAS token. Evaluation never auto-releases." })
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

@ApiTags("gates")
@Controller("projects/:projectId/gates")
export class GatesController {
  constructor(
    private readonly gates: GatesService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("gate.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({ summary: "List Gates. READY ≠ RELEASED. Exception coverage is not satisfaction." })
  list(@CurrentSession() session: RequestSession, @Param("projectId") projectId: string) {
    return this.gates.list(this.auth.requireSession(session), projectId);
  }

  @Post()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("gate.evaluate")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({ summary: "Create a Gate in NOT_READY. Create/configure uses gate.evaluate." })
  create(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateGateDto,
  ) {
    return this.gates.create(this.auth.requireSession(session), projectId, idempotencyKey, body);
  }

  @Get(":gateId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("gate.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "gateId", format: "uuid" })
  get(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("gateId") gateId: string,
  ) {
    return this.gates.get(this.auth.requireSession(session), projectId, gateId);
  }

  @Post(":gateId/requirements")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("gate.evaluate")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "gateId", format: "uuid" })
  @ApiOperation({ summary: "Configure a typed GateRequirement. Seven catalog types only." })
  addRequirement(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("gateId") gateId: string,
    @Body() body: AddRequirementDto,
  ) {
    return this.gates.addRequirement(this.auth.requireSession(session), projectId, gateId, body);
  }

  @Patch(":gateId/requirements/:requirementId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("gate.evaluate")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "gateId", format: "uuid" })
  @ApiParam({ name: "requirementId", format: "uuid" })
  configureRequirement(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("gateId") gateId: string,
    @Param("requirementId") requirementId: string,
    @Body() body: ConfigureRequirementDto,
  ) {
    return this.gates.configureRequirement(
      this.auth.requireSession(session),
      projectId,
      gateId,
      requirementId,
      body,
    );
  }

  @Post(":gateId/evaluate")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("gate.evaluate")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "gateId", format: "uuid" })
  @ApiOperation({
    summary:
      "Deterministic evaluation. READY = all mandatory SATISFIED. Exceptions cover only; they never auto-release.",
  })
  evaluate(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("gateId") gateId: string,
  ) {
    return this.gates.evaluate(this.auth.requireSession(session), projectId, gateId);
  }

  @Post(":gateId/release")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("gate.release")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "gateId", format: "uuid" })
  @ApiOperation({
    summary:
      "Explicit CAS release. NORMAL→RELEASED. WITH_EXCEPTION→RELEASED_WITH_EXCEPTION. Formal Exception is the sole bypass.",
  })
  release(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("gateId") gateId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: ReleaseGateDto,
  ) {
    return this.gates.release(this.auth.requireSession(session), projectId, gateId, idempotencyKey, body);
  }

  @Get(":gateId/releases")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("gate.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "gateId", format: "uuid" })
  @ApiOperation({ summary: "Immutable release evidence. Later revoke does not rewrite these rows." })
  listReleases(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("gateId") gateId: string,
  ) {
    return this.gates.listReleases(this.auth.requireSession(session), projectId, gateId);
  }
}
