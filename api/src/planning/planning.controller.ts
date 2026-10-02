import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiParam, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { AuthService } from "../auth/auth.service";
import { CurrentSession } from "../auth/current-session.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/session.types";
import { PermissionGuard } from "../authz/permission.guard";
import { RequirePermission } from "../authz/require-permission.decorator";
import { PlanningService } from "./planning.service";

class PlanningQueryDto {
  @ApiPropertyOptional({ enum: ["list", "kanban", "gantt", "milestones"], description: "Projection hint. Same record sets." })
  @IsOptional()
  @IsString()
  view?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: "Comma-separated stored Task statuses" })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: ["true", "false"], description: "Derived lateness filter. Not a stored status." })
  @IsOptional()
  @IsString()
  late?: string;

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
  workPackageId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsString()
  milestoneId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsString()
  assigneeUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pageSize?: string;

  @ApiPropertyOptional({ enum: ["title", "dueDate", "plannedStartAt", "status", "progressPercent", "createdAt"] })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ enum: ["asc", "desc"] })
  @IsOptional()
  @IsString()
  order?: string;

  @ApiPropertyOptional({ format: "uuid", description: "Deep-link Task id. Re-authorized; omitted when unauthorized." })
  @IsOptional()
  @IsString()
  inspect?: string;
}

@ApiTags("planning")
@Controller("projects/:projectId/planning")
export class PlanningController {
  constructor(
    private readonly planning: PlanningService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({
    summary: "Authorized unified Planning read-model (List / later Kanban / Gantt / Marcos)",
    description:
      "GET-only. Reuses Task and Milestone DTOs plus derived late and kanbanColumn. view= is a projection hint — the payload always contains the same record sets. Unauthorized projects are denied without an existence leak. Linked Issue / Deliverable / WorkPackage / Phase / Milestone previews are re-authorized individually and omitted without a placeholder title. Does not mutate Planning rows.",
  })
  get(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Query() query: PlanningQueryDto,
  ) {
    return this.planning.getReadModel(this.auth.requireSession(session), projectId, query);
  }
}
