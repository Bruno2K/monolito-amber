import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";
import { AuthService } from "../auth/auth.service";
import { CurrentSession } from "../auth/current-session.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/session.types";
import { PermissionGuard } from "../authz/permission.guard";
import { RequirePermission } from "../authz/require-permission.decorator";
import { ExceptionsService } from "./exceptions.service";

class RequestExceptionDto {
  @ApiProperty()
  @IsString()
  gateId!: string;

  @ApiProperty({ description: "Requirement-specific. Gate-wide blanket exceptions are rejected." })
  @IsString()
  gateRequirementId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expiresAt?: string;

  @ApiPropertyOptional({ description: "Ignored. Server session binding is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ description: "Ignored. Path projectId is a routing hint only." })
  @IsOptional()
  @IsString()
  projectId?: string;
}

class DecideExceptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

@ApiTags("exceptions")
@Controller("projects/:projectId/exceptions")
export class ExceptionsController {
  constructor(
    private readonly exceptions: ExceptionsService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("gate.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  list(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Query("gateId") gateId?: string,
  ) {
    return this.exceptions.list(this.auth.requireSession(session), projectId, gateId);
  }

  @Post()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("exception.request")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({
    summary:
      "Request a requirement-specific Formal Exception. Approval does not mark the requirement SATISFIED.",
  })
  request(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: RequestExceptionDto,
  ) {
    return this.exceptions.request(this.auth.requireSession(session), projectId, idempotencyKey, body);
  }

  @Get(":exceptionId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("gate.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "exceptionId", format: "uuid" })
  get(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("exceptionId") exceptionId: string,
  ) {
    return this.exceptions.get(this.auth.requireSession(session), projectId, exceptionId);
  }

  @Post(":exceptionId/approve")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("exception.approve")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "exceptionId", format: "uuid" })
  @ApiOperation({
    summary: "Approve a Formal Exception (SoD + MFA + recent-auth). Does not satisfy the requirement.",
  })
  approve(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("exceptionId") exceptionId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: DecideExceptionDto,
  ) {
    return this.exceptions.approve(this.auth.requireSession(session), projectId, exceptionId, idempotencyKey, body);
  }

  @Post(":exceptionId/reject")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("exception.reject")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "exceptionId", format: "uuid" })
  reject(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("exceptionId") exceptionId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: DecideExceptionDto,
  ) {
    return this.exceptions.reject(this.auth.requireSession(session), projectId, exceptionId, idempotencyKey, body);
  }

  @Post(":exceptionId/revoke")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("exception.revoke")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "exceptionId", format: "uuid" })
  @ApiOperation({
    summary:
      "Revoke an approved Formal Exception. After RELEASED_WITH_EXCEPTION, re-eval becomes BLOCKED when still uncovered.",
  })
  revoke(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("exceptionId") exceptionId: string,
    @Body() body: DecideExceptionDto,
  ) {
    return this.exceptions.revoke(this.auth.requireSession(session), projectId, exceptionId, body);
  }
}
