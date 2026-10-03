import { Body, Controller, Get, Headers, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Min, MinLength, ValidateNested } from "class-validator";
import { AuthService } from "../auth/auth.service";
import { CurrentSession } from "../auth/current-session.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/session.types";
import { RESOURCE_LINK_TYPES } from "./messaging.codec";
import { MessagesService } from "./messages.service";

class ResourceLinkDto {
  @ApiProperty({ enum: RESOURCE_LINK_TYPES })
  @IsIn(RESOURCE_LINK_TYPES)
  type!: (typeof RESOURCE_LINK_TYPES)[number];

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  id!: string;
}

class ListMessagesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pageSize?: string;
}

class SendMessageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  body!: string;

  @ApiPropertyOptional({ type: [ResourceLinkDto], description: "Optional resource references. Data, not authority." })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResourceLinkDto)
  resourceLinks?: ResourceLinkDto[];

  @ApiPropertyOptional({ description: "Ignored. Session Organization is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;
}

class EditMessageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  body!: string;

  @ApiProperty({ description: "Required CAS token." })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ type: [ResourceLinkDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResourceLinkDto)
  resourceLinks?: ResourceLinkDto[];
}

class TombstoneMessageDto {
  @ApiProperty({ description: "Required CAS token." })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

class ReadStateDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  lastReadMessageId!: string;
}

@ApiTags("messaging")
@Controller("conversations/:conversationId")
@UseGuards(SessionGuard)
@ApiCookieAuth()
@ApiParam({ name: "conversationId", format: "uuid" })
export class MessagesController {
  constructor(
    private readonly messages: MessagesService,
    private readonly auth: AuthService,
  ) {}

  @Get("messages")
  @ApiOperation({
    summary: "Cursor-ordered messages. Server createdAt + id tie-break. Tombstone body is omitted.",
    description:
      "Authorized resource previews include projectId only after an independent target authorization. Unauthorized previews omit title and projectId. Conversation access does not grant Project access.",
  })
  list(
    @CurrentSession() session: RequestSession,
    @Param("conversationId") conversationId: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.messages.list(this.auth.requireSession(session), conversationId, query);
  }

  @Post("messages")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({ summary: "Send a message. Own send does not create unread for the author." })
  send(
    @CurrentSession() session: RequestSession,
    @Param("conversationId") conversationId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: SendMessageDto,
  ) {
    return this.messages.send(this.auth.requireSession(session), conversationId, idempotencyKey, body);
  }

  @Patch("messages/:messageId")
  @ApiParam({ name: "messageId", format: "uuid" })
  @ApiOperation({ summary: "Author edit. Sets editedAt. Does not bump others' unread. expectedVersion required." })
  edit(
    @CurrentSession() session: RequestSession,
    @Param("conversationId") conversationId: string,
    @Param("messageId") messageId: string,
    @Body() body: EditMessageDto,
  ) {
    return this.messages.edit(this.auth.requireSession(session), conversationId, messageId, body);
  }

  @Post("messages/:messageId/tombstone")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "messageId", format: "uuid" })
  @ApiOperation({ summary: "Author tombstone. No hard delete. Audit MESSAGE_DELETED without body." })
  tombstone(
    @CurrentSession() session: RequestSession,
    @Param("conversationId") conversationId: string,
    @Param("messageId") messageId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: TombstoneMessageDto,
  ) {
    return this.messages.tombstone(
      this.auth.requireSession(session),
      conversationId,
      messageId,
      idempotencyKey,
      body,
    );
  }

  @Put("read-state")
  @ApiOperation({ summary: "Advance the per-user watermark. Monotonic. Not audit-critical." })
  updateReadState(
    @CurrentSession() session: RequestSession,
    @Param("conversationId") conversationId: string,
    @Body() body: ReadStateDto,
  ) {
    return this.messages.updateReadState(this.auth.requireSession(session), conversationId, body);
  }
}
