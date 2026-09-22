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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

class AssignTaskDto {
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  assigneeUserId!: string | null;
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

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

class CompleteTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
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
  list(@CurrentSession() session: RequestSession, @Param("projectId") projectId: string) {
    return this.tasks.list(this.auth.requireSession(session), projectId);
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
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "taskId", format: "uuid" })
  @ApiOperation({ summary: "Update Task fields. Status and assignee use dedicated endpoints." })
  update(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Body() body: UpdateTaskDto,
  ) {
    return this.tasks.update(this.auth.requireSession(session), projectId, taskId, body);
  }

  @Post(":taskId/assign")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("task.assign")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "taskId", format: "uuid" })
  @ApiOperation({ summary: "Assign a Task to an ACTIVE ProjectMembership only" })
  assign(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Body() body: AssignTaskDto,
  ) {
    return this.tasks.assign(this.auth.requireSession(session), projectId, taskId, body);
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
    @Body() body: CompleteTaskDto,
  ) {
    return this.tasks.complete(this.auth.requireSession(session), projectId, taskId, idempotencyKey, body);
  }

  @Get(":taskId/dependencies")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "taskId", format: "uuid" })
  @ApiOperation({ summary: "List finish-to-start dependencies for a Task" })
  listDependencies(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
  ) {
    return this.tasks.listDependencies(this.auth.requireSession(session), projectId, taskId);
  }

  @Post(":taskId/dependencies")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("task.update")
  @ApiCookieAuth()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "taskId", format: "uuid" })
  @ApiOperation({ summary: "Add a finish-to-start predecessor. Rejects self, duplicate, cycle, and cross-project." })
  addDependency(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateDependencyDto,
  ) {
    return this.tasks.addDependency(this.auth.requireSession(session), projectId, taskId, idempotencyKey, body);
  }
}
