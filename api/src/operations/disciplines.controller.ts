import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, MinLength } from "class-validator";
import { AuthService } from "../auth/auth.service";
import { CurrentSession } from "../auth/current-session.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/session.types";
import { PermissionGuard } from "../authz/permission.guard";
import { RequirePermission } from "../authz/require-permission.decorator";
import { DisciplinesService } from "./disciplines.service";

class CreateDisciplineDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ description: "Ignored. Server session binding is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;
}

class UpdateDisciplineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number | null;

  @ApiPropertyOptional({ description: "Forbidden. Historical identifiers are preserved." })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: "Ignored. Server session binding is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;
}

class ListDisciplinesQueryDto {
  @ApiPropertyOptional({ description: "Routing hint. Session Organization remains authoritative." })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeInactive?: boolean;
}

@ApiTags("operations")
@Controller("organizations/:organizationId/disciplines")
export class DisciplinesController {
  constructor(
    private readonly disciplines: DisciplinesService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiParam({ name: "organizationId", format: "uuid" })
  @ApiOperation({
    summary:
      "List visible Organization Disciplines. Requires organization.manage_catalogs or project.read in the session Organization.",
  })
  list(
    @CurrentSession() session: RequestSession,
    @Param("organizationId") organizationId: string,
    @Query() query: ListDisciplinesQueryDto,
  ) {
    return this.disciplines.list(this.auth.requireSession(session), organizationId, query);
  }

  @Post()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("organization.manage_catalogs")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "organizationId", format: "uuid" })
  @ApiOperation({ summary: "Create a Discipline. Code is unique case-insensitive per Organization." })
  create(
    @CurrentSession() session: RequestSession,
    @Param("organizationId") organizationId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateDisciplineDto,
  ) {
    return this.disciplines.create(this.auth.requireSession(session), organizationId, idempotencyKey, body);
  }

  @Patch(":disciplineId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("organization.manage_catalogs")
  @ApiCookieAuth()
  @ApiParam({ name: "organizationId", format: "uuid" })
  @ApiParam({ name: "disciplineId", format: "uuid" })
  @ApiOperation({ summary: "Update Discipline name/active/sortOrder. Code cannot be renamed." })
  update(
    @CurrentSession() session: RequestSession,
    @Param("organizationId") organizationId: string,
    @Param("disciplineId") disciplineId: string,
    @Body() body: UpdateDisciplineDto,
  ) {
    return this.disciplines.update(this.auth.requireSession(session), organizationId, disciplineId, body);
  }
}
