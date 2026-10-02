# M5.1 AuthZ / permission catalog mapping

**Status:** R-1.5 reconciled against activation-time `permissions.ts` / `authz.ts`.  
**Issue:** [#82](https://github.com/Bruno2K/monolito-amber/issues/82).

## Closed catalog delta (additive)

| Code | Module | Scope | Assigned to templates? | Semantics |
| --- | --- | --- | --- | --- |
| `calendar.admin` | calendar | reserved (not org, not project) | **no** | Future explicit org intervention. Does **not** grant routine private Calendar content. Fail-closed in `assertPermission`. High-risk. |
| `message.moderate` | messaging | reserved | **no** | Future moderation only. Not M5 MVP. Fail-closed. High-risk. |

No `calendar.read` / `calendar.create` / `message.send` codes. Those actions are **ownership / grant / participation**.

Intentionally **not** added in M5.1 (R15 / not required to freeze Calendar/Messaging):

- `team.read|create|update|manage_members|archive` — Team chat and Team grants evaluate `TeamMembership`, not new role codes.
- `resource_allocation.*` / `time_entry.*` — M8.
- Any attachment or moderation product permission besides the reserved stub.

## Role templates

Unchanged grants. Org Admin, Auditor, Project Coordinator, Viewer, External **do not** receive private Calendar or Message content.

| Capability | Authority |
| --- | --- |
| Create own Calendar | ACTIVE OrganizationMembership |
| Owner mutate / share / archive | Same owner membership ACTIVE |
| VIEWER / EDITOR | `CalendarAccessGrant` + current principal ACTIVE |
| Team-derived Calendar | ACTIVE TeamMembership on an unrevoked TEAM grant |
| Direct send/read | Pair membership + both ACTIVE at create; actor ACTIVE now |
| Team chat | ACTIVE TeamMembership; archived Team → read-only |
| Referenced Task/… preview | Calendar access **and** source `project.read` (or source-specific) |
| Project dates on My Schedule | Current ProjectMembership + `project.read` |

## External / directory / autocomplete

- External members may own personal Calendars and use eligible Direct chat.
- External Team chat only via TeamMembership.
- Sharing search returns eligible same-Organization principals only; no unrestricted internal directory for EXTERNAL (`denyExternalOrgWideAccess` remains).
- Autocomplete/search must not leak inaccessible Calendar/Conversation existence or counts.

## Contextual AuthZ vs existing `AuthzContext`

`AuthzContext` stays org/project. Calendar/Messaging evaluation is **additional** (`calendarActionAllowed`, `directConversationAccess`, `teamConversationAccess`). Reserved catalog codes must not be treated as project-scoped (`isProjectScopedPermission` excludes them) so they cannot be “satisfied” by a Project role assignment.

## Immediate revocation

SUSPENDED/REMOVED OrgMembership → no Calendar interactive access, no Messaging, no Team-derived paths. ProjectMembership removal does **not** remove unrelated personal Calendars or Direct/Team rights; it does remove Project-referenced details that require Project authorization.

## Tests

`packages/shared/src/calendar.security.test.ts`, `messaging.security.test.ts`, `api/test/security/m51-baseline.security.test.ts`.
