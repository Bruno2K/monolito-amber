import { CalendarStateError, DenyByDefaultError } from "./errors.js";
import type { MembershipStatus } from "./tenancy.js";
import { isUsableMembership } from "./membership.js";

/**
 * M5 Calendar contract — executable tables for ownership, grants, time,
 * referenced projections, and My Schedule. Persistence/API/UX are M5.2/M5.3.
 * Access is owner/grant based. Role templates do not grant private Calendar content.
 */

export const CALENDAR_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type CalendarStatus = (typeof CALENDAR_STATUSES)[number];

export const CALENDAR_GRANT_ROLES = ["VIEWER", "EDITOR"] as const;
export type CalendarGrantRole = (typeof CALENDAR_GRANT_ROLES)[number];

export const CALENDAR_GRANT_PRINCIPAL_KINDS = ["USER", "TEAM"] as const;
export type CalendarGrantPrincipalKind = (typeof CALENDAR_GRANT_PRINCIPAL_KINDS)[number];

export const CALENDAR_EVENT_KINDS = ["MANUAL", "REFERENCED"] as const;
export type CalendarEventKind = (typeof CALENDAR_EVENT_KINDS)[number];

export const CALENDAR_REFERENCE_TYPES = ["TASK", "MILESTONE", "DELIVERABLE", "GATE"] as const;
export type CalendarReferenceType = (typeof CALENDAR_REFERENCE_TYPES)[number];

export const CALENDAR_FIELDS = [
  "organizationId",
  "ownerOrganizationMembershipId",
  "name",
  "description",
  "timeZone",
  "status",
  "archivedAt",
  "version",
  "createdAt",
  "updatedAt",
] as const;

export const CALENDAR_ACCESS_GRANT_FIELDS = [
  "organizationId",
  "calendarId",
  "principalKind",
  "organizationMembershipId",
  "teamId",
  "role",
  "revokedAt",
  "createdByOrganizationMembershipId",
  "createdAt",
  "updatedAt",
] as const;

export const CALENDAR_EVENT_FIELDS = [
  "organizationId",
  "calendarId",
  "kind",
  "title",
  "description",
  "allDay",
  "startsAt",
  "endsAt",
  "timeZone",
  "allDayStartDate",
  "allDayEndDate",
  "linkedProjectId",
  "referenceType",
  "referenceId",
  "createdByOrganizationMembershipId",
  "version",
  "archivedAt",
  "createdAt",
  "updatedAt",
] as const;

export const MY_SCHEDULE_SOURCE_KINDS = [
  "OWNED_CALENDAR",
  "DIRECT_GRANT",
  "TEAM_GRANT",
  "AUTHORIZED_PROJECT_DATE",
] as const;
export type MyScheduleSourceKind = (typeof MY_SCHEDULE_SOURCE_KINDS)[number];

export type CalendarMutationAction =
  | "read"
  | "mutate_manual_event"
  | "admin_grant"
  | "rename"
  | "archive";

export interface CalendarGrantPath {
  kind: CalendarGrantPrincipalKind;
  role: CalendarGrantRole;
  /** Current ACTIVE OrgMembership (and ACTIVE TeamMembership for TEAM paths). */
  active: boolean;
  revoked?: boolean;
  /** Archived/inactive Team paths are ineffective but historically preserved. */
  archivedTeam?: boolean;
}

export interface CalendarOwnerContext {
  ownerMembershipId: string;
  ownerMembershipStatus: MembershipStatus;
}

const IANA_NAME = /^(UTC|Etc\/UTC|[A-Za-z_]+\/[A-Za-z0-9_+\-\/]+)$/;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertCalendarName(name: string): void {
  if (name.trim().length === 0) {
    throw new CalendarStateError("Calendar name is required");
  }
}

export function assertIanaTimeZone(value: string): void {
  const trimmed = value.trim();
  if (!IANA_NAME.test(trimmed)) {
    throw new CalendarStateError(`Invalid or non-IANA time zone '${value}'`);
  }
}

export type DstResolution = "UNAMBIGUOUS" | "AMBIGUOUS" | "INVALID";

/** Server is authoritative. Ambiguous DST must be disambiguated; invalid is rejected. */
export function assertAuthoritativeInstant(input: {
  resolution: DstResolution;
  chosenOffset?: string | null;
}): void {
  if (input.resolution === "INVALID") {
    throw new CalendarStateError("Invalid local wall time for the given IANA zone");
  }
  if (input.resolution === "AMBIGUOUS" && !input.chosenOffset) {
    throw new CalendarStateError("Ambiguous DST instant must be explicitly disambiguated");
  }
}

export function assertAllDayLocalDate(value: string, label = "all-day date"): void {
  if (!LOCAL_DATE.test(value)) {
    throw new CalendarStateError(`${label} must be a local YYYY-MM-DD date`);
  }
}

export function assertEventTimeBounds(input: {
  allDay: boolean;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  timeZone?: string | null;
  allDayStartDate?: string | null;
  allDayEndDate?: string | null;
}): void {
  if (input.allDay) {
    if (!input.allDayStartDate) {
      throw new CalendarStateError("All-day events persist local calendar dates");
    }
    assertAllDayLocalDate(input.allDayStartDate, "allDayStartDate");
    if (input.allDayEndDate) {
      assertAllDayLocalDate(input.allDayEndDate, "allDayEndDate");
      if (input.allDayEndDate < input.allDayStartDate) {
        throw new CalendarStateError("All-day end cannot precede start");
      }
    }
    if (input.startsAt || input.endsAt || input.timeZone) {
      throw new CalendarStateError("All-day events must not store UTC instants or IANA zone");
    }
    return;
  }
  if (!input.startsAt) {
    throw new CalendarStateError("Timed events persist a UTC start instant");
  }
  if (!input.timeZone) {
    throw new CalendarStateError("Timed events persist an IANA time zone");
  }
  assertIanaTimeZone(input.timeZone);
  if (input.allDayStartDate || input.allDayEndDate) {
    throw new CalendarStateError("Timed events must not store local all-day dates");
  }
  if (input.endsAt) {
    const start = new Date(input.startsAt).getTime();
    const end = new Date(input.endsAt).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
      throw new CalendarStateError("Event end cannot precede start");
    }
  }
}

export function assertGrantPrincipalXor(input: {
  principalKind: CalendarGrantPrincipalKind;
  organizationMembershipId?: string | null;
  teamId?: string | null;
}): void {
  const hasUser = Boolean(input.organizationMembershipId);
  const hasTeam = Boolean(input.teamId);
  if (input.principalKind === "USER" && !(hasUser && !hasTeam)) {
    throw new CalendarStateError("USER grant requires organizationMembershipId and no teamId");
  }
  if (input.principalKind === "TEAM" && !(hasTeam && !hasUser)) {
    throw new CalendarStateError("TEAM grant requires teamId and no organizationMembershipId");
  }
}

export function grantRoleRank(role: CalendarGrantRole): number {
  return role === "EDITOR" ? 2 : 1;
}

/** Effective authority is the maximum current role across active paths (EDITOR > VIEWER). */
export function effectiveCalendarRole(paths: readonly CalendarGrantPath[]): CalendarGrantRole | null {
  let best: CalendarGrantRole | null = null;
  for (const path of paths) {
    if (!path.active || path.revoked || path.archivedTeam) {
      continue;
    }
    if (!best || grantRoleRank(path.role) > grantRoleRank(best)) {
      best = path.role;
    }
  }
  return best;
}

export function remainingCalendarRoleAfterRevoke(
  paths: readonly CalendarGrantPath[],
  revokedIndex: number,
): CalendarGrantRole | null {
  return effectiveCalendarRole(paths.filter((_, index) => index !== revokedIndex));
}

export function ownerMembershipIsActive(status: MembershipStatus): boolean {
  return isUsableMembership(status);
}

/**
 * Inactive owner freeze (M5.0): Calendar+history retained; no auto-transfer;
 * mutations and grant administration unavailable; existing valid grantees may read.
 */
export function calendarActionAllowed(input: {
  actorMembershipId: string;
  actorMembershipStatus: MembershipStatus;
  owner: CalendarOwnerContext;
  grantPaths: readonly CalendarGrantPath[];
  action: CalendarMutationAction;
}): boolean {
  if (!isUsableMembership(input.actorMembershipStatus)) {
    return false;
  }
  const actorIsOwner = input.actorMembershipId === input.owner.ownerMembershipId;
  const ownerActive = ownerMembershipIsActive(input.owner.ownerMembershipStatus);
  const effective = effectiveCalendarRole(input.grantPaths);

  if (input.action === "read") {
    if (actorIsOwner && ownerActive) {
      return true;
    }
    return effective !== null;
  }

  if (!ownerActive) {
    return false;
  }

  if (actorIsOwner) {
    return true;
  }

  if (input.action === "mutate_manual_event") {
    return effective === "EDITOR";
  }

  return false;
}

export function assertCalendarActionAllowed(
  input: Parameters<typeof calendarActionAllowed>[0],
): void {
  if (!calendarActionAllowed(input)) {
    throw new DenyByDefaultError(`Calendar ${input.action} denied`);
  }
}

export function orgMembershipAloneExposesPrivateCalendar(): boolean {
  return false;
}

export function calendarAccessGrantsProjectAccess(): boolean {
  return false;
}

export function teamMembershipGrantsProjectAccess(): boolean {
  return false;
}

export function calendarEditsMutateSourceLifecycle(): boolean {
  return false;
}

export function inactiveOwnerAutoTransfers(): boolean {
  return false;
}

export interface ReferencedEventProjectionInput {
  hasCalendarAccess: boolean;
  sourceExists: boolean;
  sourceDeletedOrArchived: boolean;
  sourceAuthorized: boolean;
  persistedSnapshotTitle?: string | null;
  liveSourceTitle?: string | null;
}

/**
 * Referenced events re-read authorized source facts. MVP omits protected details.
 * Persisted snapshots must never leak as live title/date/status.
 */
export function projectReferencedEvent(input: ReferencedEventProjectionInput): {
  omit: boolean;
  title?: string;
} {
  if (!input.hasCalendarAccess) {
    return { omit: true };
  }
  if (!input.sourceExists || input.sourceDeletedOrArchived || !input.sourceAuthorized) {
    return { omit: true };
  }
  return { omit: false, title: input.liveSourceTitle ?? undefined };
}

export function referencedEventUsesStaleSnapshot(input: {
  projectedTitle: string | undefined;
  persistedSnapshotTitle: string;
  liveSourceTitle: string;
}): boolean {
  if (input.projectedTitle === undefined) {
    return false;
  }
  return (
    input.projectedTitle === input.persistedSnapshotTitle &&
    input.persistedSnapshotTitle !== input.liveSourceTitle
  );
}

export function myScheduleIncludesSource(input: {
  sourceKind: MyScheduleSourceKind;
  calendarAuthorized: boolean;
  projectAuthorized: boolean;
  sourceToggleEnabled: boolean;
}): boolean {
  if (!input.sourceToggleEnabled) {
    return false;
  }
  if (input.sourceKind === "AUTHORIZED_PROJECT_DATE") {
    return input.projectAuthorized;
  }
  return input.calendarAuthorized;
}

export function dedupeScheduleItemsBySourceIdentity<T extends { sourceIdentity: string }>(
  items: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.sourceIdentity)) {
      continue;
    }
    seen.add(item.sourceIdentity);
    out.push(item);
  }
  return out;
}

export const CALENDAR_AUDIT_EVENTS = [
  "CALENDAR_CREATED",
  "CALENDAR_UPDATED",
  "CALENDAR_ARCHIVED",
  "CALENDAR_SHARED",
  "CALENDAR_GRANT_ROLE_CHANGED",
  "CALENDAR_ACCESS_REVOKED",
  "CALENDAR_EVENT_CREATED",
  "CALENDAR_EVENT_UPDATED",
  "CALENDAR_EVENT_DELETED",
] as const;

export const CALENDAR_MUTATIONS_REQUIRE_IDEMPOTENCY = [
  "create_calendar",
  "archive_calendar",
  "create_grant",
  "revoke_grant",
  "change_grant_role",
  "create_event",
  "update_event",
  "delete_event",
] as const;

export const CALENDAR_MUTATIONS_REQUIRE_CAS = [
  "rename_calendar",
  "archive_calendar",
  "update_event",
  "delete_event",
] as const;
