# M5 OpenAPI / read-model plan

**Status:** Planned only. `api/openapi/openapi.json` is **unchanged** by M5.1. Nest generation is M5.2 (Calendar) and M5.4 (Messaging).  
**Issue:** [#82](https://github.com/Bruno2K/monolito-amber/issues/82).  
**Prefix:** `/api/v1`. Errors: RFC 7807 + `correlationId`. Session Organization is authoritative.

## KEEP

All current Identity, Org, Project, Document, Coordination, Planning, Operations, Governance, catalog, and file-trust paths. Especially:

| Method | Path | Note |
| --- | --- | --- |
| GET | `/api/v1/catalog/permissions` | Will include reserved `calendar.admin` / `message.moderate` after seed |
| GET | `/api/v1/catalog/role-templates` | Templates **unchanged** (no private Calendar/Message grants) |
| GET | `/api/v1/projects/{projectId}/planning` | Source for authorized My Schedule project dates |
| GET | `/api/v1/projects/{projectId}/hub` | Must not embed private Calendar/Message bodies |

## ADD (not generated in M5.1)

Canonical list: `packages/shared/src/m5-routes.ts` (`M5_PLANNED_API_ROUTES`). Collision-tested against today’s OpenAPI (`m5-routes.test.ts`).

Calendar family (M5.2): `/api/v1/calendars`, grants, events, `GET /api/v1/schedule`.  
Messaging family (M5.4): `/api/v1/conversations`, messages, read-state, search.

Auth column is owner/grant/participation — **not** `project.read` for private content. Referenced previews re-authorize the source (often `project.read` on that Project).

Idempotency-Key and CAS flags are on the planned rows. Cursor pagination for events, schedule, messages, inbox.

404-vs-403 follows existing omit/no-existence-leak convention for inaccessible tenant resources.

## Fail-closed stubs (this WI)

- Shared AuthZ functions deny reserved codes and encode grant/participation floors.
- Planned paths are documented and **absent** from generated OpenAPI.
- No Nest `calendar` / `messaging` modules.

## Forbidden path tokens

`gate.override`, `attachments`, `moderation`, `resource-allocations`, `time-entries`, `external-sync` (`M5_FORBIDDEN_API_PATH_TOKENS`).
