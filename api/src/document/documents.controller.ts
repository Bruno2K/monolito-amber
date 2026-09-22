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
import { DocumentsService } from "./documents.service";

class CreateDocumentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  disciplineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentType?: string;
}

class CreateRevisionDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  revisionCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileName?: string;
}

class UpdateRevisionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  revisionCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileName?: string;
}

class CompleteUploadDto {
  @ApiProperty()
  @IsString()
  @MinLength(64)
  checksumSha256!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileName?: string;
}

class ApproveRevisionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

class RejectRevisionDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  reason!: string;
}

class MakeCurrentDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

@ApiTags("documents")
@Controller("projects/:projectId/documents")
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly auth: AuthService,
  ) {}

  @Post()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("document.create")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({ summary: "Create a stable Document (identity is not a filename)" })
  create(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Body() body: CreateDocumentDto,
  ) {
    return this.documents.create(this.auth.requireSession(session), projectId, body);
  }

  @Get()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("document.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({ summary: "List Documents in an authorized Project" })
  list(@CurrentSession() session: RequestSession, @Param("projectId") projectId: string) {
    return this.documents.list(this.auth.requireSession(session), projectId);
  }

  @Get(":documentId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("document.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "documentId", format: "uuid" })
  @ApiOperation({ summary: "Read a Document after server-side tenant/project binding" })
  get(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("documentId") documentId: string,
  ) {
    return this.documents.get(this.auth.requireSession(session), projectId, documentId);
  }

  @Post(":documentId/archive")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("document.archive")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "documentId", format: "uuid" })
  @ApiOperation({ summary: "Archive a Document (soft; no hard delete)" })
  archive(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("documentId") documentId: string,
  ) {
    return this.documents.archive(this.auth.requireSession(session), projectId, documentId);
  }

  @Get(":documentId/revisions")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("document.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "documentId", format: "uuid" })
  listRevisions(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("documentId") documentId: string,
  ) {
    return this.documents.listRevisions(this.auth.requireSession(session), projectId, documentId);
  }

  @Post(":documentId/revisions")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("revision.create")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "documentId", format: "uuid" })
  @ApiOperation({ summary: "Create a DRAFT Revision (mutable until publish)" })
  createRevision(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("documentId") documentId: string,
    @Body() body: CreateRevisionDto,
  ) {
    return this.documents.createRevision(this.auth.requireSession(session), projectId, documentId, body);
  }

  @Get(":documentId/revisions/:revisionId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("document.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "documentId", format: "uuid" })
  @ApiParam({ name: "revisionId", format: "uuid" })
  getRevision(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("documentId") documentId: string,
    @Param("revisionId") revisionId: string,
  ) {
    return this.documents.getRevision(this.auth.requireSession(session), projectId, documentId, revisionId);
  }

  @Patch(":documentId/revisions/:revisionId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("revision.create")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "documentId", format: "uuid" })
  @ApiParam({ name: "revisionId", format: "uuid" })
  @ApiOperation({ summary: "Update a DRAFT Revision only" })
  updateDraft(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("documentId") documentId: string,
    @Param("revisionId") revisionId: string,
    @Body() body: UpdateRevisionDto,
  ) {
    return this.documents.updateDraft(this.auth.requireSession(session), projectId, documentId, revisionId, body);
  }

  @Post(":documentId/revisions/:revisionId/upload-url")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("revision.create")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "documentId", format: "uuid" })
  @ApiParam({ name: "revisionId", format: "uuid" })
  @ApiOperation({ summary: "Mint a short-lived tenant-bound upload URL" })
  uploadUrl(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("documentId") documentId: string,
    @Param("revisionId") revisionId: string,
  ) {
    return this.documents.createUploadUrl(this.auth.requireSession(session), projectId, documentId, revisionId);
  }

  @Post(":documentId/revisions/:revisionId/complete-upload")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("revision.create")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "documentId", format: "uuid" })
  @ApiParam({ name: "revisionId", format: "uuid" })
  completeUpload(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("documentId") documentId: string,
    @Param("revisionId") revisionId: string,
    @Body() body: CompleteUploadDto,
  ) {
    return this.documents.completeUpload(this.auth.requireSession(session), projectId, documentId, revisionId, body);
  }

  @Post(":documentId/revisions/:revisionId/publish")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("revision.publish")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "documentId", format: "uuid" })
  @ApiParam({ name: "revisionId", format: "uuid" })
  @ApiOperation({ summary: "Publish a DRAFT Revision (locks bytes; ≠ approve ≠ make-current)" })
  publish(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("documentId") documentId: string,
    @Param("revisionId") revisionId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.documents.publish(this.auth.requireSession(session), projectId, documentId, revisionId, idempotencyKey);
  }

  @Post(":documentId/revisions/:revisionId/review")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("revision.review")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "documentId", format: "uuid" })
  @ApiParam({ name: "revisionId", format: "uuid" })
  review(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("documentId") documentId: string,
    @Param("revisionId") revisionId: string,
  ) {
    return this.documents.review(this.auth.requireSession(session), projectId, documentId, revisionId);
  }

  @Post(":documentId/revisions/:revisionId/approve")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("revision.approve")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "documentId", format: "uuid" })
  @ApiParam({ name: "revisionId", format: "uuid" })
  @ApiOperation({ summary: "Approve an UNDER_REVIEW Revision (SoD: not the publisher)" })
  approve(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("documentId") documentId: string,
    @Param("revisionId") revisionId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: ApproveRevisionDto,
  ) {
    return this.documents.approve(
      this.auth.requireSession(session),
      projectId,
      documentId,
      revisionId,
      idempotencyKey,
      body,
    );
  }

  @Post(":documentId/revisions/:revisionId/reject")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("revision.reject")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "documentId", format: "uuid" })
  @ApiParam({ name: "revisionId", format: "uuid" })
  @ApiOperation({ summary: "Reject an UNDER_REVIEW Revision (preserved; SoD: not the publisher)" })
  reject(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("documentId") documentId: string,
    @Param("revisionId") revisionId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: RejectRevisionDto,
  ) {
    return this.documents.reject(
      this.auth.requireSession(session),
      projectId,
      documentId,
      revisionId,
      idempotencyKey,
      body,
    );
  }

  @Post(":documentId/revisions/:revisionId/make-current")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("revision.make_current")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "documentId", format: "uuid" })
  @ApiParam({ name: "revisionId", format: "uuid" })
  @ApiOperation({
    summary:
      "Make an APPROVED Revision current (CAS). Rollback = older APPROVED. Emits CurrentRevisionChanged for Coordination.",
  })
  makeCurrent(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("documentId") documentId: string,
    @Param("revisionId") revisionId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: MakeCurrentDto,
  ) {
    return this.documents.makeCurrent(
      this.auth.requireSession(session),
      projectId,
      documentId,
      revisionId,
      idempotencyKey,
      body,
    );
  }

  @Get(":documentId/revisions/:revisionId/download-url")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("document.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "documentId", format: "uuid" })
  @ApiParam({ name: "revisionId", format: "uuid" })
  @ApiOperation({ summary: "Mint a short-lived download URL after scan_status=CLEAN" })
  downloadUrl(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("documentId") documentId: string,
    @Param("revisionId") revisionId: string,
  ) {
    return this.documents.downloadUrl(this.auth.requireSession(session), projectId, documentId, revisionId);
  }
}
