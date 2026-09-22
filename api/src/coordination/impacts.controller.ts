import { Body, Controller, Get, Headers, Param, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";
import { AuthService } from "../auth/auth.service";
import { CurrentSession } from "../auth/current-session.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/session.types";
import { PermissionGuard } from "../authz/permission.guard";
import { RequirePermission } from "../authz/require-permission.decorator";
import { ImpactsService } from "./impacts.service";
import { IssuesService } from "./issues.service";

class AssessImpactDto {
  @ApiProperty({ enum: ["IMPACTED", "NOT_IMPACTED"] })
  @IsIn(["IMPACTED", "NOT_IMPACTED"])
  result!: "IMPACTED" | "NOT_IMPACTED";

  @ApiProperty()
  @IsString()
  @MinLength(1)
  rationale!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  affectedContext?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

class ResolveImpactDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

class CreateIssueFromImpactDto {
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

  @ApiPropertyOptional({ description: "Ignored. Server session/project binding is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ description: "Ignored. Path projectId is a routing hint only." })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ description: "Ignored. Origin is server-derived." })
  @IsOptional()
  @IsString()
  origin?: string;
}

@ApiTags("coordination")
@Controller("projects/:projectId/impacts")
export class ImpactsController {
  constructor(
    private readonly impacts: ImpactsService,
    private readonly issues: IssuesService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({ summary: "List Impact Analysis cases for an authorized Project" })
  list(@CurrentSession() session: RequestSession, @Param("projectId") projectId: string) {
    return this.impacts.list(this.auth.requireSession(session), projectId);
  }

  @Get(":impactId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "impactId", format: "uuid" })
  @ApiOperation({ summary: "Read one Impact Analysis case" })
  get(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("impactId") impactId: string,
  ) {
    return this.impacts.get(this.auth.requireSession(session), projectId, impactId);
  }

  @Post(":impactId/assess")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("issue.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "impactId", format: "uuid" })
  @ApiOperation({ summary: "Explicitly assess an Impact Analysis case (never auto-IMPACTED)" })
  assess(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("impactId") impactId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: AssessImpactDto,
  ) {
    return this.impacts.assess(this.auth.requireSession(session), projectId, impactId, idempotencyKey, body);
  }

  @Post(":impactId/resolve")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("issue.resolve")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "impactId", format: "uuid" })
  @ApiOperation({ summary: "Resolve an assessed Impact Analysis case when linked Issues are not open/active" })
  resolve(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("impactId") impactId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: ResolveImpactDto,
  ) {
    return this.impacts.resolve(this.auth.requireSession(session), projectId, impactId, idempotencyKey, body);
  }

  @Post(":impactId/issues")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("issue.create")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "impactId", format: "uuid" })
  @ApiOperation({ summary: "Explicitly open an Issue from an IMPACTED analysis case" })
  createIssue(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("impactId") impactId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateIssueFromImpactDto,
  ) {
    return this.issues.createFromImpact(
      this.auth.requireSession(session),
      projectId,
      impactId,
      idempotencyKey,
      body,
    );
  }
}
