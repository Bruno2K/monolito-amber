import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import { PROJECT_MEMBERSHIP_STATUSES, ROLE_TEMPLATE_KEYS, type ProjectMembershipStatus, type RoleTemplateKey } from "@amber/shared";
import { AuthService } from "../auth/auth.service";
import { CurrentSession } from "../auth/current-session.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/session.types";
import { PermissionGuard } from "../authz/permission.guard";
import { RequirePermission } from "../authz/require-permission.decorator";
import { ProjectMembershipsService } from "./project-memberships.service";
import { ProjectsService } from "./projects.service";

class CreateProjectDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;
}

class UpdateProjectDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;
}

class AddProjectMemberDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  organizationMembershipId!: string;
}

class ProjectMembershipStatusDto {
  @ApiProperty({ enum: PROJECT_MEMBERSHIP_STATUSES })
  @IsIn(PROJECT_MEMBERSHIP_STATUSES)
  status!: ProjectMembershipStatus;
}

class AssignProjectRoleDto {
  @ApiPropertyOptional({ enum: ROLE_TEMPLATE_KEYS })
  @IsOptional()
  @IsIn(ROLE_TEMPLATE_KEYS)
  templateKey?: RoleTemplateKey;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  roleId?: string;
}

@ApiTags("projects")
@Controller()
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly memberships: ProjectMembershipsService,
    private readonly auth: AuthService,
  ) {}

  @Post("organizations/:organizationId/projects")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.create")
  @ApiCookieAuth()
  @ApiParam({ name: "organizationId", format: "uuid" })
  @ApiOperation({ summary: "Create a Project and add the actor as Project Coordinator (explicit membership)" })
  create(
    @CurrentSession() session: RequestSession,
    @Param("organizationId") organizationId: string,
    @Body() body: CreateProjectDto,
  ) {
    return this.projects.create(this.auth.requireSession(session), organizationId, body);
  }

  @Get("organizations/:organizationId/projects")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("organization.read")
  @ApiCookieAuth()
  @ApiParam({ name: "organizationId", format: "uuid" })
  @ApiOperation({ summary: "Org-wide project list (INTERNAL/ADMIN; EXTERNAL isolation)" })
  listOrganization(@CurrentSession() session: RequestSession, @Param("organizationId") organizationId: string) {
    return this.projects.listOrganization(this.auth.requireSession(session), organizationId);
  }

  @Get("projects")
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: "Projects the caller has ACTIVE ProjectMembership in (session-bound org)" })
  listMine(@CurrentSession() session: RequestSession) {
    return this.projects.listMine(this.auth.requireSession(session));
  }

  @Get("projects/:projectId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({ summary: "Read a Project after server-side membership + role verification" })
  get(@CurrentSession() session: RequestSession, @Param("projectId") projectId: string) {
    return this.projects.get(this.auth.requireSession(session), projectId);
  }

  @Patch("projects/:projectId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.update")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({ summary: "Update Project metadata (project-scoped)" })
  update(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Body() body: UpdateProjectDto,
  ) {
    return this.projects.update(this.auth.requireSession(session), projectId, body);
  }

  @Post("projects/:projectId/archive")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.archive")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({ summary: "Archive a Project (org-scoped; session org must own the Project)" })
  archive(@CurrentSession() session: RequestSession, @Param("projectId") projectId: string) {
    return this.projects.archive(this.auth.requireSession(session), projectId);
  }

  @Get("projects/:projectId/members")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.read")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({ summary: "List ProjectMembership rows for an authorized Project" })
  listMembers(@CurrentSession() session: RequestSession, @Param("projectId") projectId: string) {
    return this.memberships.list(this.auth.requireSession(session), projectId);
  }

  @Post("projects/:projectId/members")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.manage_members")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiOperation({
    summary: "Add an existing Organization member to the Project (never creates a User)",
  })
  addMember(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Body() body: AddProjectMemberDto,
  ) {
    return this.memberships.add(this.auth.requireSession(session), projectId, body.organizationMembershipId);
  }

  @Patch("projects/:projectId/members/:membershipId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.manage_members")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "membershipId", format: "uuid" })
  @ApiOperation({ summary: "Suspend, remove, or reactivate a ProjectMembership (soft history)" })
  updateMember(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("membershipId") membershipId: string,
    @Body() body: ProjectMembershipStatusDto,
  ) {
    return this.memberships.updateStatus(this.auth.requireSession(session), projectId, membershipId, body.status);
  }

  @Post("projects/:projectId/members/:membershipId/roles")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("project.assign_roles")
  @ApiCookieAuth()
  @ApiParam({ name: "projectId", format: "uuid" })
  @ApiParam({ name: "membershipId", format: "uuid" })
  @ApiOperation({
    summary: "Assign an Organization-owned RoleDefinition on a Project (no self-escalation)",
  })
  assignRole(
    @CurrentSession() session: RequestSession,
    @Param("projectId") projectId: string,
    @Param("membershipId") membershipId: string,
    @Body() body: AssignProjectRoleDto,
  ) {
    return this.memberships.assignRole(this.auth.requireSession(session), projectId, membershipId, body);
  }
}
