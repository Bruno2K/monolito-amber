import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID } from "class-validator";
import { AuthService } from "../auth/auth.service";
import { CurrentSession } from "../auth/current-session.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/session.types";
import { ConversationsService } from "./conversations.service";

class InboxQueryDto {
  @ApiPropertyOptional({ description: "Cursor from the previous inbox page." })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: "Page size 1–100. Default 50." })
  @IsOptional()
  @IsString()
  pageSize?: string;

  @ApiPropertyOptional({ enum: ["DIRECT", "TEAM"] })
  @IsOptional()
  @IsString()
  kind?: string;
}

class SearchQueryDto {
  @ApiPropertyOptional({ description: "Case-insensitive snippet search over authorized messages only." })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pageSize?: string;
}

class FindOrCreateDirectDto {
  @ApiProperty({ format: "uuid", description: "Peer OrganizationMembership in the session Organization." })
  @IsUUID()
  organizationMembershipId!: string;

  @ApiPropertyOptional({ description: "Ignored. Session Organization is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;
}

class EnsureTeamConversationDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  teamId!: string;

  @ApiPropertyOptional({ description: "Ignored. Session Organization is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;
}

@ApiTags("messaging")
@Controller("conversations")
@UseGuards(SessionGuard)
@ApiCookieAuth()
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      "Authorized inbox. Direct participation or current TeamMembership only. Inaccessible conversations are omitted.",
  })
  list(@CurrentSession() session: RequestSession, @Query() query: InboxQueryDto) {
    return this.conversations.list(this.auth.requireSession(session), query);
  }

  @Get("search")
  @ApiOperation({
    summary: "Snippet search over currently authorized conversations. No inaccessible existence or count leaks.",
  })
  search(@CurrentSession() session: RequestSession, @Query() query: SearchQueryDto) {
    return this.conversations.search(this.auth.requireSession(session), query);
  }

  @Post("direct")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({
    summary: "Find-or-create a DIRECT conversation for an unordered same-Organization membership pair.",
  })
  findOrCreateDirect(
    @CurrentSession() session: RequestSession,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: FindOrCreateDirectDto,
  ) {
    return this.conversations.findOrCreateDirect(this.auth.requireSession(session), idempotencyKey, body);
  }

  @Post("team")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({
    summary: "Ensure the unique TEAM conversation for a Team the actor currently belongs to.",
  })
  ensureTeam(
    @CurrentSession() session: RequestSession,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: EnsureTeamConversationDto,
  ) {
    return this.conversations.ensureTeam(this.auth.requireSession(session), idempotencyKey, body);
  }

  @Get(":conversationId")
  @ApiParam({ name: "conversationId", format: "uuid" })
  @ApiOperation({ summary: "Conversation metadata. Inaccessible ids omit — no existence leak." })
  get(@CurrentSession() session: RequestSession, @Param("conversationId") conversationId: string) {
    return this.conversations.get(this.auth.requireSession(session), conversationId);
  }
}
