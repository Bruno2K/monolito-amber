import { Body, Controller, Get, Param, Patch, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import type { Request, Response } from "express";
import {
  MEMBERSHIP_TYPES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  ROLE_TEMPLATE_KEYS,
  type MembershipType,
  type RoleTemplateKey,
} from "@amber/shared";
import { AuthService } from "../auth/auth.service";
import { CurrentSession } from "../auth/current-session.decorator";
import { setSessionCookie } from "../auth/session.cookie";
import { SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/session.types";
import { PermissionGuard } from "../authz/permission.guard";
import { RequirePermission } from "../authz/require-permission.decorator";
import { InvitationsService } from "./invitations.service";
import { MembershipsService } from "./memberships.service";
import { OrganizationsService } from "./organizations.service";

class CreateOrganizationDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slug?: string;
}

class InviteDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ enum: ROLE_TEMPLATE_KEYS })
  @IsOptional()
  @IsIn(ROLE_TEMPLATE_KEYS)
  roleTemplateKey?: RoleTemplateKey;

  @ApiPropertyOptional({ enum: MEMBERSHIP_TYPES })
  @IsOptional()
  @IsIn(MEMBERSHIP_TYPES)
  membershipType?: MembershipType;
}

class AcceptInviteDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;
}

class MembershipStatusDto {
  @ApiProperty({ enum: ["ACTIVE", "SUSPENDED", "REMOVED"] })
  @IsIn(["ACTIVE", "SUSPENDED", "REMOVED"])
  status!: "ACTIVE" | "SUSPENDED" | "REMOVED";
}

class AssignRoleDto {
  @ApiProperty({ enum: ROLE_TEMPLATE_KEYS })
  @IsIn(ROLE_TEMPLATE_KEYS)
  templateKey!: RoleTemplateKey;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}

@ApiTags("organizations")
@Controller()
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly invitations: InvitationsService,
    private readonly memberships: MembershipsService,
    private readonly auth: AuthService,
  ) {}

  @Post("organizations")
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: "Create an Organization and bind the actor as Organization Administrator" })
  async create(@CurrentSession() session: RequestSession, @Body() body: CreateOrganizationDto) {
    const created = await this.organizations.create(this.auth.requireSession(session), body);
    return {
      id: created.organization.id,
      name: created.organization.name,
      slug: created.organization.slug,
      membershipId: created.membership.id,
    };
  }

  @Get("organizations")
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: "List Organizations the caller belongs to (not an org-wide directory)" })
  listMine(@CurrentSession() session: RequestSession) {
    return this.organizations.listMine(this.auth.requireSession(session));
  }

  @Get("organizations/:organizationId")
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiParam({ name: "organizationId", format: "uuid" })
  @ApiOperation({ summary: "Read the session-bound Organization" })
  async get(@CurrentSession() session: RequestSession, @Param("organizationId") organizationId: string) {
    const result = await this.organizations.get(this.auth.requireSession(session), organizationId);
    return {
      id: result.organization.id,
      name: result.organization.name,
      slug: result.organization.slug,
      membership: {
        id: result.membership.id,
        status: result.membership.status,
        type: result.membership.type,
      },
    };
  }

  @Get("organizations/:organizationId/members")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("organization.read")
  @ApiCookieAuth()
  @ApiParam({ name: "organizationId", format: "uuid" })
  @ApiOperation({ summary: "List organization members (EXTERNAL isolation; deny-by-default)" })
  listMembers(@CurrentSession() session: RequestSession, @Param("organizationId") organizationId: string) {
    return this.organizations.listMembers(this.auth.requireSession(session), organizationId);
  }

  @Post("organizations/:organizationId/invitations")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("organization.manage_members")
  @ApiCookieAuth()
  @ApiParam({ name: "organizationId", format: "uuid" })
  @ApiOperation({ summary: "Create a hashed 7-day organization invitation (Org-admin)" })
  invite(
    @CurrentSession() session: RequestSession,
    @Param("organizationId") organizationId: string,
    @Body() body: InviteDto,
  ) {
    return this.invitations.invite(this.auth.requireSession(session), organizationId, body);
  }

  @Post("organizations/:organizationId/invitations/:invitationId/revoke")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("organization.manage_members")
  @ApiCookieAuth()
  @ApiParam({ name: "organizationId", format: "uuid" })
  @ApiParam({ name: "invitationId", format: "uuid" })
  @ApiOperation({ summary: "Revoke a pending invitation" })
  revoke(
    @CurrentSession() session: RequestSession,
    @Param("organizationId") organizationId: string,
    @Param("invitationId") invitationId: string,
  ) {
    return this.invitations.revoke(this.auth.requireSession(session), organizationId, invitationId);
  }

  @Patch("organizations/:organizationId/members/:membershipId")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("organization.manage_members")
  @ApiCookieAuth()
  @ApiParam({ name: "organizationId", format: "uuid" })
  @ApiParam({ name: "membershipId", format: "uuid" })
  @ApiOperation({ summary: "Suspend, remove, or reactivate a membership (soft history)" })
  updateMembership(
    @CurrentSession() session: RequestSession,
    @Param("organizationId") organizationId: string,
    @Param("membershipId") membershipId: string,
    @Body() body: MembershipStatusDto,
  ) {
    return this.memberships.updateStatus(
      this.auth.requireSession(session),
      organizationId,
      membershipId,
      body.status,
    );
  }

  @Post("organizations/:organizationId/members/:membershipId/roles")
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("organization.manage_roles")
  @ApiCookieAuth()
  @ApiParam({ name: "organizationId", format: "uuid" })
  @ApiParam({ name: "membershipId", format: "uuid" })
  @ApiOperation({ summary: "Assign a 0.2A Role template (high-risk; requires recent auth)" })
  assignRole(
    @CurrentSession() session: RequestSession,
    @Param("organizationId") organizationId: string,
    @Param("membershipId") membershipId: string,
    @Body() body: AssignRoleDto,
  ) {
    return this.memberships.assignRole(this.auth.requireSession(session), organizationId, membershipId, body);
  }

  @Post("invitations/accept")
  @ApiOperation({ summary: "Accept an organization invitation; creates User if needed" })
  async accept(@Body() body: AcceptInviteDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const issued = await this.invitations.accept({
      token: body.token,
      password: body.password,
      displayName: body.displayName,
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
    });
    setSessionCookie(res, issued.token);
    const view = await this.auth.sessionView(issued.session);
    return { organizationId: issued.organizationId, ...view };
  }
}
