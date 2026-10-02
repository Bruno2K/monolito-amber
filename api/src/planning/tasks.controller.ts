import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, MinLength, ValidateIf } from "class-validator";
import { AuthService } from "../auth/auth.service";
import { CurrentSession } from "../auth/current-session.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/session.types";
import { PermissionGuard } from "../authz/permission.guard";
import { RequirePermission } from "../authz/require-permission.decorator";
import { TasksService } from "./tasks.service";

class CreateTaskDto {
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
  priority?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  responsibleDisciplineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional({ description: "Optional same-Project Issue. Completing the Task does not resolve it." })
  @IsOptional()
  @IsString()
  issueId?: string;

  @ApiPropertyOptional({ description: "Optional same-Project Milestone. Completing the Task does not achieve it." })
  @IsOptional()
  @IsString()
  milestoneId?: string;

  @ApiPropertyOptional({ description: "Optional same-Project Phase (M3.7 context). Completing the Task does not complete it." })
  @IsOptional()
  @IsString()
  phaseId?: string;

  @ApiPropertyOptional({ description: "Optional same-Project Deliverable. Completing the Task does not deliver it." })
  @IsOptional()
  @IsString()
  deliverableId?: string;

  @ApiPropertyOptional({ description: "Optional same-Project WorkPackage. Completing the Task does not complete it." })
  @IsOptional()
  @IsString()
  workPackageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  plannedStartAt?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedMinutes?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;

  @ApiPropertyOptional({ description: "Ignored. Server session binding is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ description: "Ignored. Path projectId is a routing hint only." })
  @IsOptional()
  @IsString()
  projectId?: string;
}

class UpdateTaskDto {
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
  @IsString()
  issueId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  milestoneId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phaseId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliverableId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workPackageId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  plannedStartAt?: string | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedMinutes?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number | null;

  @ApiProperty({ description: "Required CAS token. M4.3 Task writes fail closed without it." })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({
    description: "Rejected. Gantt / date edits never propagate predecessor, successor, or parent dates.",
  })
  @IsOptional()
  @IsBoolean()
  propagateDates?: boolean;

  @ApiPropertyOptional({
    description: "Rejected. Finish-to-start edges do not auto-shift successor dates.",
  })
  @IsOptional()
  @IsBoolean()
  shiftSuccessors?: boolean;
}

class AssignTaskDto {
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  assigneeUserId!: string | null;

  @ApiProperty({ description: "Required CAS token." })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

class TransitionTaskDto {
  @ApiProperty({ enum: ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"] })
  @IsString()
  @MinLength(1)
  status!: string;

  @ApiPropertyOptional({ description: "Required when status=BLOCKED." })
  @IsOptional()
  @IsString()
  blockedReason?: string;

  @ApiProperty({ description: "Required CAS token." })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

class ExpectedVersionDto {
  @ApiProperty({ description: "Required CAS token." })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

class BlockTaskDto extends ExpectedVersionDto {
  @ApiProperty({ description: "Non-empty reason required to enter BLOCKED." })
  @IsString()
  @MinLength(1)
  blockedReason!: string;
}

class ListTasksQueryDto {
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
}

class CreateDependencyDto {
  @ApiProperty({ description: "Predecessor that must reach DONE before this Task may start." })
  @IsString()
  predecessorTaskId!: string;

  @ApiPropertyOptional({ enum: ["FINISH_TO_START"], description: "Only finish-to-start is accepted." })
  @IsOptional()
  @IsString()
  type?: string;
}

class DependencyCandidatesQueryDto {
  @ApiPropertyOptional({ description: "Case-insensitive title search. Foreign Tasks are omitted, not counted." })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50 })
  @IsOptional()
  @IsString()
  pageSize?: string;
}

@ApiTags("planning")
@Controller("projects/:projectId/tasks")
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({ summary: "List Tasks for an authorized Project (Task ≠ Issue)" })
  list(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Query() query: ListTasksQueryDto,
  ) {
    return this.tasks.list(this.auth.requireSession(session), projectId, query);
  }

  @Post()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("task.create")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({ summary: "Create a standalone Task or an optional same-Project Issue-linked Task" })
  create(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateTaskDto,
  ) {
    return this.tasks.create(this.auth.requireSession(session), projectId, idempotencyKey, body);
  }

  @Get(":taskId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "taskId", format: "uuid" })
  @ApiOperation({ summary: "Read one Task. late is derived; there is no OVERDUE status." })
  get(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
  ) {
    return this.tasks.get(this.auth.requireSession(session), projectId, taskId);
  }

  @Patch(":taskId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("task.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: false, description: "When sent, replay must not double-apply." })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "taskId", format: "uuid" })
  @ApiOperation({ summary: "Update Task fields. Status and assignee use dedicated endpoints. expectedVersion is required." })
  update(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: UpdateTaskDto,
  ) {
    return this.tasks.update(this.auth.requireSession(session), projectId, taskId, idempotencyKey, body);
  }

  @Post(":taskId/assign")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("task.assign")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "taskId", format: "uuid" })
  @ApiOperation({ summary: "Assign a Task to an ACTIVE ProjectMembership only. Idempotency-Key and expectedVersion required." })
  assign(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: AssignTaskDto,
  ) {
    return this.tasks.assign(this.auth.requireSession(session), projectId, taskId, idempotencyKey, body);
  }

  @Post(":taskId/status")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("task.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "taskId", format: "uuid" })
  @ApiOperation({
    summary: "Transition Task status. DONE requires task.complete. BLOCKED requires blockedReason.",
  })
  transition(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: TransitionTaskDto,
  ) {
    return this.tasks.transition(this.auth.requireSession(session), projectId, taskId, idempotencyKey, body);
  }

  @Post(":taskId/start")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("task.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "taskId", format: "uuid" })
  @ApiOperation({ summary: "Start a Task (TODO or BLOCKED → IN_PROGRESS). Blocked by unfinished FS predecessors." })
  @ApiResponse({
    status: 409,
    description:
      "PLANNING_STATE reason DEPENDENCY_PREDECESSOR_INCOMPLETE with blockers[] — not the same as stored Task BLOCKED",
  })
  start(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: ExpectedVersionDto,
  ) {
    return this.tasks.start(this.auth.requireSession(session), projectId, taskId, idempotencyKey, body);
  }

  @Post(":taskId/block")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("task.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "taskId", format: "uuid" })
  @ApiOperation({ summary: "Block an IN_PROGRESS Task. blockedReason is required and non-empty." })
  block(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: BlockTaskDto,
  ) {
    return this.tasks.block(this.auth.requireSession(session), projectId, taskId, idempotencyKey, body);
  }

  @Post(":taskId/unblock")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("task.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "taskId", format: "uuid" })
  @ApiOperation({ summary: "Unblock a Task (BLOCKED → IN_PROGRESS). Clears blockedReason. Auditable." })
  unblock(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: ExpectedVersionDto,
  ) {
    return this.tasks.unblock(this.auth.requireSession(session), projectId, taskId, idempotencyKey, body);
  }

  @Post(":taskId/complete")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("task.complete")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "taskId", format: "uuid" })
  @ApiOperation({ summary: "Mark a Task DONE. Does not resolve a source Issue or achieve a Milestone." })
  complete(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: ExpectedVersionDto,
  ) {
    return this.tasks.complete(this.auth.requireSession(session), projectId, taskId, idempotencyKey, body);
  }

  @Post(":taskId/cancel")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("task.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "taskId", format: "uuid" })
  @ApiOperation({ summary: "Cancel a Task. Terminal. Does not cascade sibling aggregates." })
  cancel(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: ExpectedVersionDto,
  ) {
    return this.tasks.cancel(this.auth.requireSession(session), projectId, taskId, idempotencyKey, body);
  }

  @Get(":taskId/history")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "taskId", format: "uuid" })
  @ApiOperation({ summary: "Task-scoped append-only audit / state history. Re-authorized; no other-tenant events." })
  history(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
  ) {
    return this.tasks.listHistory(this.auth.requireSession(session), projectId, taskId);
  }

  @Get(":taskId/dependencies")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "taskId", format: "uuid" })
  @ApiOperation({ summary: "List finish-to-start predecessors and successors for a Task. Re-authorized; omit-not-leak." })
  listDependencies(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
  ) {
    return this.tasks.listDependencies(this.auth.requireSession(session), projectId, taskId);
  }

  @Get(":taskId/dependency-candidates")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "taskId", format: "uuid" })
  @ApiQuery({ name: "q", required: false })
  @ApiOperation({
    summary: "Search same-Project predecessor candidates. Hidden/foreign Tasks are omitted, never counted.",
  })
  listDependencyCandidates(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Query() query: DependencyCandidatesQueryDto,
  ) {
    return this.tasks.listDependencyCandidates(this.auth.requireSession(session), projectId, taskId, query);
  }

  @Post(":taskId/dependencies")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("task.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "taskId", format: "uuid" })
  @ApiOperation({
    summary:
      "Add a finish-to-start predecessor. Rejects self, duplicate, cycle, non-FS, cross-tenant, and invalid retroactive edges. Never shifts dates.",
  })
  @ApiResponse({
    status: 409,
    description:
      "PLANNING_STATE with reason DEPENDENCY_SELF | DEPENDENCY_DUPLICATE | DEPENDENCY_CYCLE | DEPENDENCY_KIND_UNSUPPORTED | DEPENDENCY_RETROACTIVE",
  })
  @ApiResponse({ status: 403, description: "TENANCY_DENIED — missing, cross-Project, or cross-Organization id (omit-not-leak)" })
  addDependency(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateDependencyDto,
  ) {
    return this.tasks.addDependency(this.auth.requireSession(session), projectId, taskId, idempotencyKey, body);
  }

  @Delete(":taskId/dependencies/:dependencyId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("task.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "taskId", format: "uuid" })
  @ApiParam({ name: "dependencyId", format: "uuid" })
  @ApiOperation({
    summary:
      "Remove a finish-to-start edge when taskId is either end. Never shifts dates. Idempotent retry replays the stored body.",
  })
  @ApiResponse({ status: 403, description: "TENANCY_DENIED — unknown or foreign dependencyId (omit-not-leak)" })
  removeDependency(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Param("dependencyId") dependencyId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.tasks.removeDependency(
      this.auth.requireSession(session),
      projectId,
      taskId,
      dependencyId,
      idempotencyKey,
    );
  }
}
