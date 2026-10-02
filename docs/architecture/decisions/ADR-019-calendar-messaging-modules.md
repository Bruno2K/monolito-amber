# ADR-019 — Calendar and Messaging modules

## Status
Proposed (M5.1 — LOCAL ONLY). Accepted when this WI is independently reviewed and merged.

## Context
R-1.3 / R-1.5 and the M5 pack require user-owned private Calendars and Direct/Team Messaging without turning collaboration into Project authorization or a second Planning store. Planning already owns Task/Milestone. Operations owns Deliverable. Governance owns Gate. Those sources must stay authoritative when referenced from a Calendar.

## Decision
- Add PostgreSQL schemas `calendar` and `messaging` (ADR-002). Feature code does not join across module schemas.
- Calendar owns `Calendar`, `CalendarAccessGrant`, `CalendarEvent`. Exactly one owner OrganizationMembership. Private by default. Sharing is explicit USER/TEAM VIEWER/EDITOR. Owner is not a grant row.
- Messaging owns `Conversation`, `Message`, `MessageReadState`. DIRECT identity is the unordered OrganizationMembership pair. TEAM is one primary conversation per Team; access is current TeamMembership.
- Closed catalog gains reserved `calendar.admin` and `message.moderate` only. They are not assigned to role templates and fail closed. Normal Calendar/Messaging access is ownership/grant/participation.
- Referenced events store type+id only — no FK to Task/Milestone/Deliverable/Gate. Projection re-reads authorized source facts.
- Migrations are forward-only and additive. No ResourceAllocation, TimeEntry, attachment, or moderation tables.

## Alternatives
- Reuse Planning dates as the only calendar — rejected (R-1: Calendar is first-class collaboration).
- Org-wide default Calendar visibility — rejected (private by default).
- Approximate Calendar/Messaging with `project.read` — rejected (R-1.5; Calendar access ≠ Project access).
- Implement Nest/Next feature surfaces in this WI — rejected (M5.2–M5.5).

## Consequences
M5.2/M5.4 implement services on this schema. M5.3/M5.5 implement UX. Reviewers can check grant/unread/time tables in `@amber/shared` without inferring M6+ coordination or M8 resources.

## Implementation Implications
- Prisma models + `20261002070000_m5_1_calendar_messaging_baseline`.
- Shared contract: `packages/shared/src/calendar.ts`, `messaging.ts`, reserved catalog rows.
- OpenAPI paths are planned, not generated, until M5.2/M5.4.

## Supersedes
None. Extends ADR-002 / ADR-005 / ADR-008 / ADR-010.
