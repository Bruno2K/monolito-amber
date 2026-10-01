import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";
import { AuthService } from "../auth/auth.service";
import { CurrentSession } from "../auth/current-session.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/session.types";
import { PermissionGuard } from "../authz/permission.guard";
import { RequirePermission } from "../authz/require-permission.decorator";
import { DeliverablesService } from "./deliverables.service";

class CreateDeliverableDto {
  @ApiProperty({ format: "uuid" })
  @IsString()
  phaseId!: string;

  @ApiProperty({ format: "uuid" })
  @IsString()
  disciplineId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ nullable: true, format: "uuid" })
  @IsOptional()
  @IsString()
  ownerProjectMembershipId?: string | null;

  @ApiPropertyOptional({ nullable: true, format: "uuid" })
  @IsOptional()
  @IsString()
  ownerTeamId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  plannedStartAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  dueAt?: string | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number | null;

  @ApiPropertyOptional({ description: "Ignored. Server session binding is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ description: "Ignored. Path projectId is a routing hint only." })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ description: "Rejected. Status is never client-authored." })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: "Rejected. Documents are not mutated via Deliverable." })
  @IsOptional()
  @IsString()
  documentId?: string;

  @ApiPropertyOptional({ description: "Rejected. Revisions are not mutated via Deliverable." })
  @IsOptional()
  @IsString()
  revisionId?: string;
}

class UpdateDeliverableDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsString()
  phaseId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsString()
  disciplineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  plannedStartAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  dueAt?: string | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number | null;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ description: "Status transitions use dedicated endpoints." })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: "Ownership uses assign/unassign." })
  @IsOptional()
  @IsString()
  ownerProjectMembershipId?: string | null;

  @ApiPropertyOptional({ description: "Ownership uses assign/unassign." })
  @IsOptional()
  @IsString()
  ownerTeamId?: string | null;

  @ApiPropertyOptional({ description: "Ignored. Server session binding is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ description: "Ignored. Path projectId is a routing hint only." })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ description: "Rejected. Documents are not mutated via Deliverable." })
  @IsOptional()
  @IsString()
  documentId?: string;

  @ApiPropertyOptional({ description: "Rejected. Revisions are not mutated via Deliverable." })
  @IsOptional()
  @IsString()
  revisionId?: string;
}

class VersionedActionDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

class AssignDeliverableDto extends VersionedActionDto {
  @ApiPropertyOptional({ nullable: true, format: "uuid" })
  @IsOptional()
  @IsString()
  ownerProjectMembershipId?: string | null;

  @ApiPropertyOptional({ nullable: true, format: "uuid" })
  @IsOptional()
  @IsString()
  ownerTeamId?: string | null;

  @ApiPropertyOptional({ description: "Ignored. Server session binding is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ description: "Ignored. Path projectId is a routing hint only." })
  @IsOptional()
  @IsString()
  projectId?: string;
}

class ListDeliverablesQueryDto {
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

  @ApiPropertyOptional({ description: "Case-insensitive search on code and title" })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: "Comma-separated Deliverable statuses" })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsString()
  phaseId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsString()
  disciplineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sort?: string;
}

@ApiTags("operations")
@Controller("projects/:projectId/deliverables")
export class DeliverablesController {
  constructor(
    private readonly deliverables: DeliverablesService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({
    summary: "List Deliverables of an authorized Project (omit archived by default; unauthorized rows omitted)",
  })
  list(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Query() query: ListDeliverablesQueryDto,
  ) {
    return this.deliverables.list(this.auth.requireSession(session), projectId, query);
  }

  @Post()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("deliverable.create")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({ summary: "Create a Deliverable in PLANNED with required phaseId and disciplineId" })
  create(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateDeliverableDto,
  ) {
    return this.deliverables.create(this.auth.requireSession(session), projectId, idempotencyKey, body);
  }

  @Get(":deliverableId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "deliverableId", format: "uuid" })
  @ApiOperation({ summary: "Read one Deliverable. Cross-tenant and cross-project ids are denied without leakage." })
  get(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("deliverableId") deliverableId: string,
  ) {
    return this.deliverables.get(this.auth.requireSession(session), projectId, deliverableId);
  }

  @Patch(":deliverableId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("deliverable.update")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "deliverableId", format: "uuid" })
  @ApiOperation({
    summary: "Update Deliverable fields. Status and ownership use dedicated endpoints. CAS expectedVersion is required.",
  })
  update(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("deliverableId") deliverableId: string,
    @Body() body: UpdateDeliverableDto,
  ) {
    return this.deliverables.update(this.auth.requireSession(session), projectId, deliverableId, body);
  }

  @Post(":deliverableId/assign")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("deliverable.assign")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "deliverableId", format: "uuid" })
  @ApiOperation({ summary: "Set ownership XOR (user | Team | none). Team does not grant Project access." })
  assign(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("deliverableId") deliverableId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: AssignDeliverableDto,
  ) {
    return this.deliverables.assign(this.auth.requireSession(session), projectId, deliverableId, idempotencyKey, body);
  }

  @Post(":deliverableId/unassign")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("deliverable.assign")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "deliverableId", format: "uuid" })
  @ApiOperation({ summary: "Clear Deliverable ownership" })
  unassign(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("deliverableId") deliverableId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: VersionedActionDto,
  ) {
    return this.deliverables.unassign(this.auth.requireSession(session), projectId, deliverableId, idempotencyKey, body);
  }

  @Post(":deliverableId/start")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("deliverable.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "deliverableId", format: "uuid" })
  @ApiOperation({ summary: "Explicit PLANNED → IN_PROGRESS. Dates and progress never auto-start." })
  start(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("deliverableId") deliverableId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: VersionedActionDto,
  ) {
    return this.deliverables.start(this.auth.requireSession(session), projectId, deliverableId, idempotencyKey, body);
  }

  @Post(":deliverableId/submit-for-review")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("deliverable.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "deliverableId", format: "uuid" })
  @ApiOperation({ summary: "Explicit IN_PROGRESS → IN_REVIEW" })
  submitForReview(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("deliverableId") deliverableId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: VersionedActionDto,
  ) {
    return this.deliverables.submitForReview(
      this.auth.requireSession(session),
      projectId,
      deliverableId,
      idempotencyKey,
      body,
    );
  }

  @Post(":deliverableId/approve")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("deliverable.approve")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "deliverableId", format: "uuid" })
  @ApiOperation({ summary: "Explicit IN_REVIEW → APPROVED" })
  approve(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("deliverableId") deliverableId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: VersionedActionDto,
  ) {
    return this.deliverables.approve(this.auth.requireSession(session), projectId, deliverableId, idempotencyKey, body);
  }

  @Post(":deliverableId/deliver")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("deliverable.deliver")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "deliverableId", format: "uuid" })
  @ApiOperation({
    summary:
      "Explicit APPROVED → DELIVERED. Linked WorkPackages must be DONE; zero linked WorkPackages is allowed in M3.4.",
  })
  deliver(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("deliverableId") deliverableId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: VersionedActionDto,
  ) {
    return this.deliverables.deliver(this.auth.requireSession(session), projectId, deliverableId, idempotencyKey, body);
  }

  @Post(":deliverableId/cancel")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("deliverable.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "deliverableId", format: "uuid" })
  @ApiOperation({ summary: "Explicit CANCELLED from any state before DELIVERED" })
  cancel(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("deliverableId") deliverableId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: VersionedActionDto,
  ) {
    return this.deliverables.cancel(this.auth.requireSession(session), projectId, deliverableId, idempotencyKey, body);
  }

  @Post(":deliverableId/archive")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("deliverable.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "deliverableId", format: "uuid" })
  @ApiOperation({ summary: "Soft-archive a Deliverable. Hard-delete is forbidden." })
  archive(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("deliverableId") deliverableId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: VersionedActionDto,
  ) {
    return this.deliverables.archive(this.auth.requireSession(session), projectId, deliverableId, idempotencyKey, body);
  }
}
