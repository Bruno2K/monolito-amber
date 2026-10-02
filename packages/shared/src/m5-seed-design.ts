/**
 * M5 seed / fixture plan. Synthetic identities only (@amber.test).
 * M5.1 does not write Calendar/Messaging rows. M5.2/M5.4 apply this plan.
 * Reuses M3/M4 orgs, memberships, Teams, and Planning/Operations sources.
 */

export const M5_SEED_APPLIED_IN_M51 = false;
/** Calendar rows are written by M5.2 (`prisma/m5-seed.ts`) when `AMBER_SEED_M3=1`. Messaging remains M5.4. */
export const M5_SEED_CALENDARS_APPLIED_IN_M52 = true;

export interface M5SeedCalendar {
  key: string;
  orgKey: string;
  ownerUserKey: string;
  name: string;
  timeZone: string;
  status: "ACTIVE" | "ARCHIVED";
}

export interface M5SeedGrant {
  calendarKey: string;
  principalKind: "USER" | "TEAM";
  userKey?: string;
  teamKey?: string;
  role: "VIEWER" | "EDITOR";
  revoked?: boolean;
}

export interface M5SeedEvent {
  key: string;
  calendarKey: string;
  kind: "MANUAL" | "REFERENCED";
  title: string;
  allDay: boolean;
  referenceType?: "TASK" | "MILESTONE" | "DELIVERABLE" | "GATE";
  referenceKey?: string;
}

export interface M5SeedConversation {
  key: string;
  orgKey: string;
  kind: "DIRECT" | "TEAM";
  userKeys?: readonly [string, string];
  teamKey?: string;
}

export const M5_SEED_CALENDARS: readonly M5SeedCalendar[] = [
  {
    key: "cal-owner-private",
    orgKey: "org-a",
    ownerUserKey: "coord-a",
    name: "Coordinator private",
    timeZone: "America/Sao_Paulo",
    status: "ACTIVE",
  },
  {
    key: "cal-shared-editor",
    orgKey: "org-a",
    ownerUserKey: "coord-a",
    name: "Shared with contributor EDITOR",
    timeZone: "America/Sao_Paulo",
    status: "ACTIVE",
  },
  {
    key: "cal-team-grant",
    orgKey: "org-a",
    ownerUserKey: "coord-a",
    name: "Team-shared VIEWER",
    timeZone: "UTC",
    status: "ACTIVE",
  },
  {
    key: "cal-inactive-owner",
    orgKey: "org-a",
    ownerUserKey: "suspended-a",
    name: "Frozen owner calendar",
    timeZone: "UTC",
    status: "ACTIVE",
  },
];

export const M5_SEED_GRANTS: readonly M5SeedGrant[] = [
  { calendarKey: "cal-shared-editor", principalKind: "USER", userKey: "contributor-a", role: "EDITOR" },
  { calendarKey: "cal-shared-editor", principalKind: "TEAM", teamKey: "team-a-structure", role: "VIEWER" },
  { calendarKey: "cal-team-grant", principalKind: "TEAM", teamKey: "team-a-structure", role: "VIEWER" },
  { calendarKey: "cal-inactive-owner", principalKind: "USER", userKey: "contributor-a", role: "VIEWER" },
];

export const M5_SEED_EVENTS: readonly M5SeedEvent[] = [
  {
    key: "evt-manual-timed",
    calendarKey: "cal-owner-private",
    kind: "MANUAL",
    title: "Manual timed",
    allDay: false,
  },
  {
    key: "evt-manual-allday",
    calendarKey: "cal-shared-editor",
    kind: "MANUAL",
    title: "Manual all-day",
    allDay: true,
  },
  {
    key: "evt-ref-task",
    calendarKey: "cal-shared-editor",
    kind: "REFERENCED",
    title: "must-not-be-source-of-truth",
    allDay: false,
    referenceType: "TASK",
    referenceKey: "task-a1-todo",
  },
];

export const M5_SEED_CONVERSATIONS: readonly M5SeedConversation[] = [
  { key: "dm-coord-contributor", orgKey: "org-a", kind: "DIRECT", userKeys: ["coord-a", "contributor-a"] },
  { key: "team-a-chat", orgKey: "org-a", kind: "TEAM", teamKey: "team-a-structure" },
];

export const M5_SEED_NEGATIVES = {
  crossTenantCalendarInvisible: true,
  orgMembershipDoesNotListPrivateCalendars: true,
  teamChatDoesNotGrantProject: true,
  calendarGrantDoesNotGrantProject: true,
  orgAdminDoesNotReadDirectMessages: true,
  newMembershipDoesNotInheritDirect: true,
  inaccessibleConversationOmitsUnread: true,
} as const;

export const M5_SEED_PROHIBITED = [
  "ResourceAllocation",
  "TimeEntry",
  "attachment",
  "moderation queue",
  "external calendar sync",
  "Vercel",
  "Railway",
] as const;
