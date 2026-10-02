/**
 * M5 UI and API routes. Calendar product pages ship in M5.3.
 * Messaging UI stays planned until M5.5. Product IA is English.
 * Portuguese Figma paths remain prototype-only.
 */

export type M5RouteLifecycle = "planned" | "prototype-only";

export interface M5UiRoutePlan {
  path: string;
  lifecycle: M5RouteLifecycle;
  purpose: string;
  implementedIn: "m5.3" | "m5.5" | "figma-prototype";
}

export interface M5ApiRoutePlan {
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  path: string;
  auth: string;
  idempotency: boolean;
  cas: boolean;
  purpose: string;
  implementedIn: "m5.2" | "m5.4";
}

export const M5_PLANNED_UI_ROUTES: readonly M5UiRoutePlan[] = [
  {
    path: "/calendars",
    lifecycle: "planned",
    purpose: "Meus Calendários hub — owned, direct-shared, Team-shared",
    implementedIn: "m5.3",
  },
  {
    path: "/calendars/:calendarId",
    lifecycle: "planned",
    purpose: "Calendar month/week/day (+ optional agenda) views",
    implementedIn: "m5.3",
  },
  {
    path: "/calendars/:calendarId/share",
    lifecycle: "planned",
    purpose: "Owner-only USER/TEAM VIEWER/EDITOR grant administration",
    implementedIn: "m5.3",
  },
  {
    path: "/calendars/schedule",
    lifecycle: "planned",
    purpose: "My Schedule overlay — toggles, TZ, all-day, windowing",
    implementedIn: "m5.3",
  },
  {
    path: "/messages",
    lifecycle: "planned",
    purpose: "Conversation inbox — Direct | Team; unread watermark",
    implementedIn: "m5.5",
  },
  {
    path: "/messages/:conversationId",
    lifecycle: "planned",
    purpose: "Direct or Team transcript + composer",
    implementedIn: "m5.5",
  },
];

export const M5_PROTOTYPE_ONLY_UI_ROUTES: readonly M5UiRoutePlan[] = [
  {
    path: "/calendarios",
    lifecycle: "prototype-only",
    purpose: "M2.3 Figma prototype path; not a Next.js product route",
    implementedIn: "figma-prototype",
  },
  {
    path: "/mensagens",
    lifecycle: "prototype-only",
    purpose: "M2.4 Figma prototype path; not a Next.js product route",
    implementedIn: "figma-prototype",
  },
];

export const M5_PLANNED_CALENDAR_API_ROUTES: readonly M5ApiRoutePlan[] = [
  {
    method: "GET",
    path: "/api/v1/calendars",
    auth: "ACTIVE OrgMembership; list only owned/granted calendars",
    idempotency: false,
    cas: false,
    purpose: "Authorized Calendar directory. Org membership alone does not enumerate private calendars.",
    implementedIn: "m5.2",
  },
  {
    method: "POST",
    path: "/api/v1/calendars",
    auth: "ACTIVE OrgMembership (owner). No role permission.",
    idempotency: true,
    cas: false,
    purpose: "Create private Calendar. Unlimited per owner membership.",
    implementedIn: "m5.2",
  },
  {
    method: "GET",
    path: "/api/v1/calendars/{calendarId}",
    auth: "owner (active) or effective grant",
    idempotency: false,
    cas: false,
    purpose: "Calendar metadata. Inaccessible ids omit/404 — no existence leak.",
    implementedIn: "m5.2",
  },
  {
    method: "PATCH",
    path: "/api/v1/calendars/{calendarId}",
    auth: "active owner only",
    idempotency: false,
    cas: true,
    purpose: "Rename / description. EDITOR cannot rename.",
    implementedIn: "m5.2",
  },
  {
    method: "POST",
    path: "/api/v1/calendars/{calendarId}/archive",
    auth: "active owner only",
    idempotency: true,
    cas: true,
    purpose: "Archive Calendar. Does not delete referenced source objects.",
    implementedIn: "m5.2",
  },
  {
    method: "GET",
    path: "/api/v1/calendars/{calendarId}/grants",
    auth: "active owner (admin) or grantee (own provenance)",
    idempotency: false,
    cas: false,
    purpose: "Grant list with multi-path provenance. Owner is not a grant row.",
    implementedIn: "m5.2",
  },
  {
    method: "POST",
    path: "/api/v1/calendars/{calendarId}/grants",
    auth: "active owner only",
    idempotency: true,
    cas: false,
    purpose: "USER or TEAM VIEWER/EDITOR grant. Same Organization only.",
    implementedIn: "m5.2",
  },
  {
    method: "PATCH",
    path: "/api/v1/calendars/{calendarId}/grants/{grantId}",
    auth: "active owner only",
    idempotency: false,
    cas: false,
    purpose: "Change grant role. Does not revoke other paths.",
    implementedIn: "m5.2",
  },
  {
    method: "DELETE",
    path: "/api/v1/calendars/{calendarId}/grants/{grantId}",
    auth: "active owner only",
    idempotency: true,
    cas: false,
    purpose: "Revoke one path immediately. Other valid paths remain.",
    implementedIn: "m5.2",
  },
  {
    method: "GET",
    path: "/api/v1/calendars/{calendarId}/events",
    auth: "owner or effective grant; referenced sources re-authorized",
    idempotency: false,
    cas: false,
    purpose: "Windowed events. Unauthorized referenced details omitted.",
    implementedIn: "m5.2",
  },
  {
    method: "POST",
    path: "/api/v1/calendars/{calendarId}/events",
    auth: "active owner or EDITOR",
    idempotency: true,
    cas: false,
    purpose: "Create MANUAL or REFERENCED event. Referenced write does not mutate source.",
    implementedIn: "m5.2",
  },
  {
    method: "PATCH",
    path: "/api/v1/calendars/{calendarId}/events/{eventId}",
    auth: "active owner or EDITOR (manual only)",
    idempotency: false,
    cas: true,
    purpose: "Update manual event. Cannot silently mutate Task/Milestone/Deliverable/Gate.",
    implementedIn: "m5.2",
  },
  {
    method: "DELETE",
    path: "/api/v1/calendars/{calendarId}/events/{eventId}",
    auth: "active owner or EDITOR (manual)",
    idempotency: true,
    cas: true,
    purpose: "Archive/delete event. Never cascade-deletes source objects.",
    implementedIn: "m5.2",
  },
  {
    method: "GET",
    path: "/api/v1/schedule",
    auth: "ACTIVE OrgMembership; per-source re-auth",
    idempotency: false,
    cas: false,
    purpose: "My Schedule merge. Source toggles, TZ, all-day, cursor windowing.",
    implementedIn: "m5.2",
  },
];

export const M5_PLANNED_MESSAGING_API_ROUTES: readonly M5ApiRoutePlan[] = [
  {
    method: "GET",
    path: "/api/v1/conversations",
    auth: "ACTIVE OrgMembership; currently authorized conversations only",
    idempotency: false,
    cas: false,
    purpose: "Inbox. No inaccessible conversation ids or unread counts.",
    implementedIn: "m5.4",
  },
  {
    method: "POST",
    path: "/api/v1/conversations/direct",
    auth: "both memberships ACTIVE in same Organization",
    idempotency: true,
    cas: false,
    purpose: "Find-or-create DIRECT by unordered OrganizationMembership pair.",
    implementedIn: "m5.4",
  },
  {
    method: "GET",
    path: "/api/v1/conversations/{conversationId}",
    auth: "current Direct participant or ACTIVE TeamMembership",
    idempotency: false,
    cas: false,
    purpose: "Conversation metadata. Inaccessible → omit/404.",
    implementedIn: "m5.4",
  },
  {
    method: "GET",
    path: "/api/v1/conversations/{conversationId}/messages",
    auth: "current conversation access",
    idempotency: false,
    cas: false,
    purpose: "Cursor-ordered messages. Server-authoritative createdAt + id tie-break.",
    implementedIn: "m5.4",
  },
  {
    method: "POST",
    path: "/api/v1/conversations/{conversationId}/messages",
    auth: "read_write conversation access",
    idempotency: true,
    cas: false,
    purpose: "Send. Own send does not create unread for the author.",
    implementedIn: "m5.4",
  },
  {
    method: "PATCH",
    path: "/api/v1/conversations/{conversationId}/messages/{messageId}",
    auth: "author + current access",
    idempotency: false,
    cas: true,
    purpose: "Author edit. Sets editedAt. Audit MESSAGE_EDITED. Does not bump others' unread.",
    implementedIn: "m5.4",
  },
  {
    method: "POST",
    path: "/api/v1/conversations/{conversationId}/messages/{messageId}/tombstone",
    auth: "author + current access",
    idempotency: true,
    cas: true,
    purpose: "Soft-delete. Author/timestamp remain. No hard delete. Audit MESSAGE_DELETED.",
    implementedIn: "m5.4",
  },
  {
    method: "PUT",
    path: "/api/v1/conversations/{conversationId}/read-state",
    auth: "current conversation access",
    idempotency: false,
    cas: false,
    purpose: "Advance per-user watermark. Not audit-critical.",
    implementedIn: "m5.4",
  },
  {
    method: "GET",
    path: "/api/v1/conversations/search",
    auth: "currently authorized conversations only",
    idempotency: false,
    cas: false,
    purpose: "Snippet search. No inaccessible existence/count leaks.",
    implementedIn: "m5.4",
  },
];

export const M5_PLANNED_API_ROUTES: readonly M5ApiRoutePlan[] = [
  ...M5_PLANNED_CALENDAR_API_ROUTES,
  ...M5_PLANNED_MESSAGING_API_ROUTES,
];

export const M5_FORBIDDEN_API_PATH_TOKENS = [
  "gate.override",
  "attachments",
  "moderation",
  "resource-allocations",
  "time-entries",
  "external-sync",
] as const;
