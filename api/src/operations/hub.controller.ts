import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiParam, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Min } from "class-validator";
import { AuthService } from "../auth/auth.service";
import { CurrentSession } from "../auth/current-session.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/session.types";
import { PermissionGuard } from "../authz/permission.guard";
import { RequirePermission } from "../authz/require-permission.decorator";
import { HubService } from "./hub.service";

class HubQueryDto {
  @ApiPropertyOptional({ description: "Nested list page size (default 20, max 50). Unbounded lists are forbidden." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  overdueCursor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  blockedCursor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lateCursor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerGapCursor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  milestoneCursor?: string;

  @ApiPropertyOptional({
    description:
      "Default true rebuilds a lagging cache. false returns the cached snapshot with freshness.stale when the read model lags (AuthZ still runs first).",
  })
  @IsOptional()
  @IsString()
  refresh?: string;
}

@ApiTags("operations")
@Controller("projects/:projectId/hub")
export class HubController {
  constructor(
    private readonly hub: HubService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({
    summary: "Authorized derived Project Hub read model (Visão Geral)",
    description: [
      "GET-only derived view. Hub is not a second source of truth and does not mutate Phase, Deliverable, WorkPackage, Document, Gate, or membership rows.",
      "AuthZ: project.read + ACTIVE Organization and Project memberships (deny-by-default). Unauthorized projects/items are omitted with no placeholder and no global count leak.",
      "Signals (each payload field includes origin + derivation):",
      "- currentPhase ← operations.phases status ACTIVE, lowest sequence",
      "- deliverableCountsByStatus ← groupBy stored status (OVERDUE is not a status)",
      "- overdueDeliverables ← dueAt < now on non-terminal non-archived Deliverables (signal)",
      "- blockedWorkPackages ← stored BLOCKED; lateWorkPackages ← dueAt signal",
      "- ownerGaps ← XOR zero owners",
      "- upcomingMilestones ← existing planning.milestones (not an M4 planner)",
      "- relatedSources.documents|gates omitted without document.read|gate.read",
      "- lastMaterialActivity omitted without organization.read_audit",
      "Drill-down hrefs re-authorize at Entregas / Estrutura / Pacotes source routes. Cache is AuthZ-sovereign and invalidated on ProjectMembership revoke.",
    ].join("\n"),
  })
  get(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Query() query: HubQueryDto,
  ) {
    return this.hub.get(this.auth.requireSession(session), projectId, query);
  }
}
