import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Min, MinLength, ValidateIf } from "class-validator";
import { AuthService } from "../auth/auth.service";
import { CurrentSession } from "../auth/current-session.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/session.types";
import { PermissionGuard } from "../authz/permission.guard";
import { RequirePermission } from "../authz/require-permission.decorator";
import { IssuesService } from "./issues.service";

class CreateManualIssueDto {
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
  severity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  responsibleDisciplineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional({ description: "Ignored. Server session binding is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ description: "Ignored. Path projectId is a routing hint only." })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ description: "Ignored. Manual create always stores origin=MANUAL." })
  @IsOptional()
  @IsString()
  origin?: string;

  @ApiPropertyOptional({ description: "Ignored. Use POST /impacts/:id/issues for Impact origin." })
  @IsOptional()
  @IsString()
  impactAnalysisId?: string;
}

class UpdateIssueDto {
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
  severity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  responsibleDisciplineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

class AssignIssueDto {
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  assigneeUserId!: string | null;
}

class TransitionIssueDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  status!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rationale?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

class ReopenIssueDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rationale?: string;
}

class AddCommentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  body!: string;
}

class AddEvidenceDto {
  @ApiProperty({ enum: ["FILE", "NOTE", "URI"] })
  @IsString()
  kind!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storedObjectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

@ApiTags("coordination")
@Controller("projects/:projectId/issues")
export class IssuesController {
  constructor(
    private readonly issues: IssuesService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({ summary: "List Issues for an authorized Project" })
  list(@CurrentSession() session: RequestSession, @Param("projectId") projectId: string) {
    return this.issues.list(this.auth.requireSession(session), projectId);
  }

  @Post()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("issue.create")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({ summary: "Create a manual Issue (origin=MANUAL; client origin/ids are ignored)" })
  create(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateManualIssueDto,
  ) {
    return this.issues.createManual(this.auth.requireSession(session), projectId, idempotencyKey, body);
  }

  @Get(":issueId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "issueId", format: "uuid" })
  @ApiOperation({ summary: "Read one Issue" })
  get(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("issueId") issueId: string,
  ) {
    return this.issues.get(this.auth.requireSession(session), projectId, issueId);
  }

  @Patch(":issueId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("issue.update")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "issueId", format: "uuid" })
  @ApiOperation({ summary: "Update Issue fields (severity ≠ priority; discipline ≠ assignee)" })
  update(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("issueId") issueId: string,
    @Body() body: UpdateIssueDto,
  ) {
    return this.issues.update(this.auth.requireSession(session), projectId, issueId, body);
  }

  @Post(":issueId/assign")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("issue.assign")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "issueId", format: "uuid" })
  @ApiOperation({ summary: "Assign an Issue without changing responsible discipline" })
  assign(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("issueId") issueId: string,
    @Body() body: AssignIssueDto,
  ) {
    return this.issues.assign(this.auth.requireSession(session), projectId, issueId, body);
  }

  @Post(":issueId/status")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("issue.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "issueId", format: "uuid" })
  @ApiOperation({ summary: "Transition Issue status. RESOLVED ≠ CLOSED; service re-checks AuthZ per target." })
  transition(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("issueId") issueId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: TransitionIssueDto,
  ) {
    return this.issues.transition(this.auth.requireSession(session), projectId, issueId, idempotencyKey, body);
  }

  @Post(":issueId/reopen")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("issue.reopen")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "issueId", format: "uuid" })
  @ApiOperation({ summary: "Reopen a CLOSED Issue without losing history" })
  reopen(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("issueId") issueId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: ReopenIssueDto,
  ) {
    return this.issues.reopen(this.auth.requireSession(session), projectId, issueId, idempotencyKey, body);
  }

  @Get(":issueId/comments")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "issueId", format: "uuid" })
  listComments(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("issueId") issueId: string,
  ) {
    return this.issues.listComments(this.auth.requireSession(session), projectId, issueId);
  }

  @Post(":issueId/comments")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("issue.comment")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "issueId", format: "uuid" })
  addComment(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("issueId") issueId: string,
    @Body() body: AddCommentDto,
  ) {
    return this.issues.addComment(this.auth.requireSession(session), projectId, issueId, body);
  }

  @Get(":issueId/evidence")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "issueId", format: "uuid" })
  listEvidence(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("issueId") issueId: string,
  ) {
    return this.issues.listEvidence(this.auth.requireSession(session), projectId, issueId);
  }

  @Post(":issueId/evidence")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("issue.add_evidence")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "issueId", format: "uuid" })
  addEvidence(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("issueId") issueId: string,
    @Body() body: AddEvidenceDto,
  ) {
    return this.issues.addEvidence(this.auth.requireSession(session), projectId, issueId, body);
  }

  @Get(":issueId/history")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "issueId", format: "uuid" })
  history(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("issueId") issueId: string,
  ) {
    return this.issues.listStatusHistory(this.auth.requireSession(session), projectId, issueId);
  }
}
