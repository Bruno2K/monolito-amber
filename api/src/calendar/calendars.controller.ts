import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
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
import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";
import { AuthService } from "../auth/auth.service";
import { CurrentSession } from "../auth/current-session.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/session.types";
import { CalendarsService } from "./calendars.service";
import { EventsService } from "./events.service";

class ListCalendarsQueryDto {
  @ApiPropertyOptional({ description: "Case-insensitive name filter over authorized calendars only." })
  @IsOptional()
  @IsString()
  q?: string;
}

class CreateCalendarDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: "America/Sao_Paulo" })
  @IsString()
  @MinLength(1)
  timeZone!: string;

  @ApiPropertyOptional({ description: "Ignored. Session Organization is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;
}

class UpdateCalendarDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timeZone?: string;

  @ApiProperty({ description: "Required CAS token." })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ description: "Ignored. Session Organization is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;
}

class ArchiveCalendarDto {
  @ApiProperty({ description: "Required CAS token." })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ description: "Ignored. Session Organization is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;
}

class CreateGrantDto {
  @ApiProperty({ enum: ["USER", "TEAM"] })
  @IsString()
  principalKind!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationMembershipId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiProperty({ enum: ["VIEWER", "EDITOR"] })
  @IsString()
  role!: string;

  @ApiPropertyOptional({ description: "Ignored. Session Organization is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;
}

class ChangeGrantDto {
  @ApiProperty({ enum: ["VIEWER", "EDITOR"] })
  @IsString()
  role!: string;

  @ApiPropertyOptional({ description: "Ignored. Session Organization is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;
}

class ShareTargetsQueryDto {
  @ApiPropertyOptional({ description: "Autocomplete query. EXTERNAL callers never receive the org-wide directory." })
  @IsOptional()
  @IsString()
  q?: string;
}

class EventWindowQueryDto {
  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  limit?: string;
}

class CreateEventDto {
  @ApiPropertyOptional({ enum: ["MANUAL", "REFERENCED"], default: "MANUAL" })
  @IsOptional()
  @IsString()
  kind?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsBoolean()
  allDay!: boolean;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsString()
  startsAt?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsString()
  endsAt?: string;

  @ApiPropertyOptional({ example: "America/Sao_Paulo" })
  @IsOptional()
  @IsString()
  timeZone?: string;

  @ApiPropertyOptional({ example: "2026-10-02" })
  @IsOptional()
  @IsString()
  allDayStartDate?: string;

  @ApiPropertyOptional({ example: "2026-10-02" })
  @IsOptional()
  @IsString()
  allDayEndDate?: string;

  @ApiPropertyOptional({ description: "Naive local wall time. Server resolves DST." })
  @IsOptional()
  @IsString()
  localStartsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  localEndsAt?: string;

  @ApiPropertyOptional({ example: "-03:00" })
  @IsOptional()
  @IsString()
  chosenOffset?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsString()
  linkedProjectId?: string;

  @ApiPropertyOptional({ enum: ["TASK", "MILESTONE", "DELIVERABLE", "GATE"] })
  @IsOptional()
  @IsString()
  referenceType?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional({ description: "Ignored. Session Organization is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;
}

class UpdateEventDto {
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
  @IsBoolean()
  allDay?: boolean;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsString()
  startsAt?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsString()
  endsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timeZone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  allDayStartDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  allDayEndDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  localStartsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  localEndsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chosenOffset?: string;

  @ApiProperty({ description: "Required CAS token." })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ description: "Ignored. Session Organization is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;
}

class DeleteEventDto {
  @ApiProperty({ description: "Required CAS token." })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ description: "Ignored. Session Organization is authoritative." })
  @IsOptional()
  @IsString()
  organizationId?: string;
}

@ApiTags("calendars")
@Controller("calendars")
@UseGuards(SessionGuard)
@ApiCookieAuth()
export class CalendarsController {
  constructor(
    private readonly calendars: CalendarsService,
    private readonly events: EventsService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List calendars the caller owns or is granted. Org membership alone does not enumerate private calendars.",
  })
  list(@CurrentSession() session: RequestSession, @Query() query: ListCalendarsQueryDto) {
    return this.calendars.list(this.auth.requireSession(session), query);
  }

  @Post()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({ summary: "Create a private user-owned Calendar. Unlimited per ACTIVE membership." })
  create(
    @CurrentSession() session: RequestSession,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateCalendarDto,
  ) {
    return this.calendars.create(this.auth.requireSession(session), idempotencyKey, body);
  }

  @Get(":calendarId/share-targets")
  @ApiParam({ name: "calendarId", format: "uuid" })
  @ApiOperation({
    summary: "Owner-only share-target autocomplete. EXTERNAL callers never receive an unrestricted org directory.",
  })
  shareTargets(
    @CurrentSession() session: RequestSession,
    @Param("calendarId") calendarId: string,
    @Query() query: ShareTargetsQueryDto,
  ) {
    return this.calendars.shareTargets(this.auth.requireSession(session), calendarId, query);
  }

  @Get(":calendarId/grants")
  @ApiParam({ name: "calendarId", format: "uuid" })
  @ApiOperation({ summary: "Grant provenance. Owner sees all paths; grantees see their own. Owner is not a grant row." })
  listGrants(@CurrentSession() session: RequestSession, @Param("calendarId") calendarId: string) {
    return this.calendars.listGrants(this.auth.requireSession(session), calendarId);
  }

  @Post(":calendarId/grants")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "calendarId", format: "uuid" })
  @ApiOperation({ summary: "Owner-only USER or TEAM VIEWER/EDITOR grant. Same Organization only." })
  createGrant(
    @CurrentSession() session: RequestSession,
    @Param("calendarId") calendarId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateGrantDto,
  ) {
    return this.calendars.createGrant(this.auth.requireSession(session), calendarId, idempotencyKey, body);
  }

  @Patch(":calendarId/grants/:grantId")
  @ApiParam({ name: "calendarId", format: "uuid" })
  @ApiParam({ name: "grantId", format: "uuid" })
  @ApiOperation({ summary: "Change one grant role. Other paths remain." })
  changeGrant(
    @CurrentSession() session: RequestSession,
    @Param("calendarId") calendarId: string,
    @Param("grantId") grantId: string,
    @Body() body: ChangeGrantDto,
  ) {
    return this.calendars.changeGrantRole(this.auth.requireSession(session), calendarId, grantId, body);
  }

  @Delete(":calendarId/grants/:grantId")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "calendarId", format: "uuid" })
  @ApiParam({ name: "grantId", format: "uuid" })
  @ApiOperation({ summary: "Revoke one grant path immediately. Other valid paths remain." })
  revokeGrant(
    @CurrentSession() session: RequestSession,
    @Param("calendarId") calendarId: string,
    @Param("grantId") grantId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.calendars.revokeGrant(this.auth.requireSession(session), calendarId, grantId, idempotencyKey);
  }

  @Get(":calendarId/events")
  @ApiParam({ name: "calendarId", format: "uuid" })
  @ApiOperation({ summary: "Windowed events. Unauthorized referenced source details are omitted." })
  listEvents(
    @CurrentSession() session: RequestSession,
    @Param("calendarId") calendarId: string,
    @Query() query: EventWindowQueryDto,
  ) {
    return this.events.list(this.auth.requireSession(session), calendarId, query);
  }

  @Post(":calendarId/events")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "calendarId", format: "uuid" })
  @ApiOperation({ summary: "Create a MANUAL or REFERENCED event. Referenced write does not mutate the source." })
  createEvent(
    @CurrentSession() session: RequestSession,
    @Param("calendarId") calendarId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateEventDto,
  ) {
    return this.events.create(this.auth.requireSession(session), calendarId, idempotencyKey, body);
  }

  @Patch(":calendarId/events/:eventId")
  @ApiParam({ name: "calendarId", format: "uuid" })
  @ApiParam({ name: "eventId", format: "uuid" })
  @ApiOperation({ summary: "Update a manual event. Cannot silently mutate Task/Milestone/Deliverable/Gate." })
  updateEvent(
    @CurrentSession() session: RequestSession,
    @Param("calendarId") calendarId: string,
    @Param("eventId") eventId: string,
    @Body() body: UpdateEventDto,
  ) {
    return this.events.update(this.auth.requireSession(session), calendarId, eventId, body);
  }

  @Delete(":calendarId/events/:eventId")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "calendarId", format: "uuid" })
  @ApiParam({ name: "eventId", format: "uuid" })
  @ApiOperation({ summary: "Archive an event. Never cascade-deletes source objects." })
  deleteEvent(
    @CurrentSession() session: RequestSession,
    @Param("calendarId") calendarId: string,
    @Param("eventId") eventId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: DeleteEventDto,
  ) {
    return this.events.remove(this.auth.requireSession(session), calendarId, eventId, idempotencyKey, body);
  }

  @Post(":calendarId/archive")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiParam({ name: "calendarId", format: "uuid" })
  @ApiOperation({ summary: "Archive a Calendar. Events and referenced sources are preserved." })
  archive(
    @CurrentSession() session: RequestSession,
    @Param("calendarId") calendarId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: ArchiveCalendarDto,
  ) {
    return this.calendars.archive(this.auth.requireSession(session), calendarId, idempotencyKey, body);
  }

  @Get(":calendarId")
  @ApiParam({ name: "calendarId", format: "uuid" })
  @ApiOperation({ summary: "Calendar metadata. Inaccessible ids deny without existence leak." })
  get(@CurrentSession() session: RequestSession, @Param("calendarId") calendarId: string) {
    return this.calendars.get(this.auth.requireSession(session), calendarId);
  }

  @Patch(":calendarId")
  @ApiParam({ name: "calendarId", format: "uuid" })
  @ApiOperation({ summary: "Rename or update description. Active owner only. EDITOR cannot rename." })
  update(
    @CurrentSession() session: RequestSession,
    @Param("calendarId") calendarId: string,
    @Body() body: UpdateCalendarDto,
  ) {
    return this.calendars.update(this.auth.requireSession(session), calendarId, body);
  }
}
