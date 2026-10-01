import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";
import { AuthService } from "../auth/auth.service";
import { CurrentSession } from "../auth/current-session.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/session.types";
import { PermissionGuard } from "../authz/permission.guard";
import { RequirePermission } from "../authz/require-permission.decorator";
import { WorkPackagesService } from "./work-packages.service";

class CreateWorkPackageDto {
  @ApiProperty({ format: "uuid" })
  @IsString()
  phaseId!: string;

  @ApiPropertyOptional({ nullable: true, format: "uuid" })
  @IsOptional()
  @IsString()
  deliverableId?: string | null;

  @ApiPropertyOptional({ nullable: true, format: "uuid" })
  @IsOptional()
  @IsString()
  disciplineId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  code?: string | null;

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

  @ApiPropertyOptional({ description: "Rejected. Documents are not mutated via WorkPackage." })
  @IsOptional()
  @IsString()
  documentId?: string;

  @ApiPropertyOptional({ description: "Rejected. Revisions are not mutated via WorkPackage." })
  @IsOptional()
  @IsString()
  revisionId?: string;

  @ApiPropertyOptional({ description: "Rejected. Tasks are not mutated via WorkPackage." })
  @IsOptional()
  @IsString()
  taskId?: string;

  @ApiPropertyOptional({ description: "Rejected. Milestones are not mutated via WorkPackage." })
  @IsOptional()
  @IsString()
  milestoneId?: string;
}

class UpdateWorkPackageDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsString()
  phaseId?: string;

  @ApiPropertyOptional({ nullable: true, format: "uuid" })
  @IsOptional()
  @IsString()
  disciplineId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  code?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ nullable: true, description: "Cannot be cleared while status is BLOCKED." })
  @IsOptional()
  @IsString()
  blockedReason?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  plannedStartAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  dueAt?: string | null;

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

  @ApiPropertyOptional({ description: "Association uses associate/disassociate." })
  @IsOptional()
  @IsString()
  deliverableId?: string | null;

  @ApiPropertyOptional({ description: "Ignored. Server session binding is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ description: "Ignored. Path projectId is a routing hint only." })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ description: "Rejected. Documents are not mutated via WorkPackage." })
  @IsOptional()
  @IsString()
  documentId?: string;

  @ApiPropertyOptional({ description: "Rejected. Revisions are not mutated via WorkPackage." })
  @IsOptional()
  @IsString()
  revisionId?: string;

  @ApiPropertyOptional({ description: "Rejected. Tasks are not mutated via WorkPackage." })
  @IsOptional()
  @IsString()
  taskId?: string;

  @ApiPropertyOptional({ description: "Rejected. Milestones are not mutated via WorkPackage." })
  @IsOptional()
  @IsString()
  milestoneId?: string;
}

class VersionedActionDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

class AssignWorkPackageDto extends VersionedActionDto {
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

class BlockWorkPackageDto extends VersionedActionDto {
  @ApiProperty({ description: "Required auditable reason when entering BLOCKED." })
  @IsString()
  @MinLength(1)
  blockedReason!: string;
}

class AssociateWorkPackageDto extends VersionedActionDto {
  @ApiProperty({ format: "uuid" })
  @IsString()
  deliverableId!: string;

  @ApiPropertyOptional({ description: "Ignored. Server session binding is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ description: "Ignored. Path projectId is a routing hint only." })
  @IsOptional()
  @IsString()
  projectId?: string;
}

class ListWorkPackagesQueryDto {
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

  @ApiPropertyOptional({ description: "Comma-separated WorkPackage statuses" })
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
  deliverableId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsString()
  disciplineId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsString()
  ownerProjectMembershipId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsString()
  ownerTeamId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unassigned?: string;
}

@ApiTags("operations")
@Controller("projects/:projectId/work-packages")
export class WorkPackagesController {
  constructor(
    private readonly workPackages: WorkPackagesService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({
    summary: "List WorkPackages of an authorized Project (omit archived by default; unauthorized rows omitted)",
  })
  list(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Query() query: ListWorkPackagesQueryDto,
  ) {
    return this.workPackages.list(this.auth.requireSession(session), projectId, query);
  }

  @Post()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("work_package.create")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({ summary: "Create a WorkPackage in PLANNED with required phaseId" })
  create(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateWorkPackageDto,
  ) {
    return this.workPackages.create(this.auth.requireSession(session), projectId, idempotencyKey, body);
  }

  @Get(":workPackageId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "workPackageId", format: "uuid" })
  @ApiOperation({ summary: "Read one WorkPackage. Cross-tenant and cross-project ids are denied without leakage." })
  get(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("workPackageId") workPackageId: string,
  ) {
    return this.workPackages.get(this.auth.requireSession(session), projectId, workPackageId);
  }

  @Patch(":workPackageId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("work_package.update")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "workPackageId", format: "uuid" })
  @ApiOperation({
    summary: "Update WorkPackage fields. Status, ownership, and Deliverable association use dedicated endpoints. CAS expectedVersion is required.",
  })
  update(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("workPackageId") workPackageId: string,
    @Body() body: UpdateWorkPackageDto,
  ) {
    return this.workPackages.update(this.auth.requireSession(session), projectId, workPackageId, body);
  }

  @Post(":workPackageId/assign")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("work_package.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "workPackageId", format: "uuid" })
  @ApiOperation({ summary: "Set ownership XOR (user | Team | none). Team does not grant Project access." })
  assign(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("workPackageId") workPackageId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: AssignWorkPackageDto,
  ) {
    return this.workPackages.assign(this.auth.requireSession(session), projectId, workPackageId, idempotencyKey, body);
  }

  @Post(":workPackageId/unassign")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("work_package.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "workPackageId", format: "uuid" })
  @ApiOperation({ summary: "Clear WorkPackage ownership" })
  unassign(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("workPackageId") workPackageId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: VersionedActionDto,
  ) {
    return this.workPackages.unassign(this.auth.requireSession(session), projectId, workPackageId, idempotencyKey, body);
  }

  @Post(":workPackageId/activate")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("work_package.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "workPackageId", format: "uuid" })
  @ApiOperation({ summary: "Explicit PLANNED → ACTIVE. Dates never auto-activate." })
  activate(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("workPackageId") workPackageId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: VersionedActionDto,
  ) {
    return this.workPackages.activate(this.auth.requireSession(session), projectId, workPackageId, idempotencyKey, body);
  }

  @Post(":workPackageId/block")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("work_package.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "workPackageId", format: "uuid" })
  @ApiOperation({ summary: "Explicit ACTIVE → BLOCKED. blockedReason is required and auditable." })
  block(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("workPackageId") workPackageId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: BlockWorkPackageDto,
  ) {
    return this.workPackages.block(this.auth.requireSession(session), projectId, workPackageId, idempotencyKey, body);
  }

  @Post(":workPackageId/unblock")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("work_package.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "workPackageId", format: "uuid" })
  @ApiOperation({ summary: "Explicit BLOCKED → ACTIVE. Clears blockedReason with audit." })
  unblock(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("workPackageId") workPackageId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: VersionedActionDto,
  ) {
    return this.workPackages.unblock(this.auth.requireSession(session), projectId, workPackageId, idempotencyKey, body);
  }

  @Post(":workPackageId/complete")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("work_package.complete")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "workPackageId", format: "uuid" })
  @ApiOperation({
    summary:
      "Explicit ACTIVE → DONE. Incidental Task links do not block. Does not complete Task, Deliverable, or Milestone.",
  })
  complete(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("workPackageId") workPackageId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: VersionedActionDto,
  ) {
    return this.workPackages.complete(this.auth.requireSession(session), projectId, workPackageId, idempotencyKey, body);
  }

  @Post(":workPackageId/cancel")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("work_package.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "workPackageId", format: "uuid" })
  @ApiOperation({ summary: "Explicit CANCELLED from PLANNED, ACTIVE, or BLOCKED" })
  cancel(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("workPackageId") workPackageId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: VersionedActionDto,
  ) {
    return this.workPackages.cancel(this.auth.requireSession(session), projectId, workPackageId, idempotencyKey, body);
  }

  @Post(":workPackageId/archive")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("work_package.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "workPackageId", format: "uuid" })
  @ApiOperation({ summary: "Soft-archive a WorkPackage. Hard-delete is forbidden." })
  archive(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("workPackageId") workPackageId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: VersionedActionDto,
  ) {
    return this.workPackages.archive(this.auth.requireSession(session), projectId, workPackageId, idempotencyKey, body);
  }

  @Post(":workPackageId/associate")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("work_package.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "workPackageId", format: "uuid" })
  @ApiOperation({ summary: "Associate a Deliverable in the same Project and Phase" })
  associate(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("workPackageId") workPackageId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: AssociateWorkPackageDto,
  ) {
    return this.workPackages.associate(
      this.auth.requireSession(session),
      projectId,
      workPackageId,
      idempotencyKey,
      body,
    );
  }

  @Post(":workPackageId/disassociate")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("deliverable.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "workPackageId", format: "uuid" })
  @ApiOperation({
    summary: "Explicitly disassociate from a Deliverable (required before delivering with still-linked CANCELLED WPs)",
  })
  disassociate(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("workPackageId") workPackageId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: VersionedActionDto,
  ) {
    return this.workPackages.disassociate(
      this.auth.requireSession(session),
      projectId,
      workPackageId,
      idempotencyKey,
      body,
    );
  }
}
