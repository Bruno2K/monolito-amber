import { Body, Controller, Get, Headers, Param, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { AuthService } from "../auth/auth.service";
import { CurrentSession } from "../auth/current-session.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/session.types";
import { PermissionGuard } from "../authz/permission.guard";
import { RequirePermission } from "../authz/require-permission.decorator";
import { TraceabilityService } from "./traceability.service";

class LinkDocumentDto {
  @ApiProperty({ format: "uuid" })
  @IsString()
  documentId!: string;

  @ApiPropertyOptional({ description: "Ignored. Server session binding is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ description: "Ignored. Path projectId is a routing hint only." })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ description: "Rejected. Document status is not mutated via Ops." })
  @IsOptional()
  @IsString()
  status?: string;
}

@ApiTags("operations")
@Controller("projects/:projectId/deliverables/:deliverableId")
export class DeliverableTraceabilityController {
  constructor(
    private readonly traceability: TraceabilityService,
    private readonly auth: AuthService,
  ) {}

  @Get("context")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "deliverableId", format: "uuid" })
  @ApiOperation({
    summary:
      "Authorized delivery context. Unauthorized sections omitted (no hidden count). Gate links are read-only.",
  })
  context(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("deliverableId") deliverableId: string,
  ) {
    return this.traceability.deliverableContext(this.auth.requireSession(session), projectId, deliverableId);
  }

  @Post("documents")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("deliverable.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "deliverableId", format: "uuid" })
  @ApiOperation({
    summary: "Link a same-Project Document. Requires document.read on the target. Does not mutate Document/Revision.",
  })
  link(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("deliverableId") deliverableId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: LinkDocumentDto,
  ) {
    return this.traceability.linkDocument(
      this.auth.requireSession(session),
      projectId,
      deliverableId,
      idempotencyKey,
      body,
    );
  }

  @Post("documents/:documentId/unlink")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("deliverable.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "deliverableId", format: "uuid" })
  @ApiParam({ name: "documentId", format: "uuid" })
  @ApiOperation({ summary: "Unlink Document evidence. Both-side AuthZ. IDs-only audit." })
  unlink(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("deliverableId") deliverableId: string,
    @Param("documentId") documentId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.traceability.unlinkDocument(
      this.auth.requireSession(session),
      projectId,
      deliverableId,
      documentId,
      idempotencyKey,
    );
  }
}

@ApiTags("operations")
@Controller("projects/:projectId/work-packages/:workPackageId")
export class WorkPackageTraceabilityController {
  constructor(
    private readonly traceability: TraceabilityService,
    private readonly auth: AuthService,
  ) {}

  @Get("context")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "workPackageId", format: "uuid" })
  @ApiOperation({ summary: "Authorized WorkPackage context sections. Gate links are read-only." })
  context(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("workPackageId") workPackageId: string,
  ) {
    return this.traceability.workPackageContext(this.auth.requireSession(session), projectId, workPackageId);
  }
}
