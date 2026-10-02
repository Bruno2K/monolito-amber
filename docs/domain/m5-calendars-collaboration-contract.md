# M5 Calendars & Collaboration contract

**Status:** Binding freeze for M5.1. Implementation of persistence services is M5.2/M5.4; UX is M5.3/M5.5.  
**Issue:** [#82](https://github.com/Bruno2K/monolito-amber/issues/82).  
**Sources:** R-1.3, R-1.5, M5 pack M5.0 clarifications, activation tip `9159889…`.

Executable tables live in `@amber/shared` `calendar.ts` and `messaging.ts`. Prisma DDL is additive in `calendar` / `messaging` schemas.

---

## Calendar

Organization-bound. Exactly one owner (`ownerOrganizationMembershipId`). Private by default. Unlimited calendars per user (per ACTIVE membership). Org membership alone does **not** expose private calendars.

Stored status: `ACTIVE | ARCHIVED`. Archive sets `archivedAt`. Archive/delete of a Calendar or Event **never** deletes Task / Milestone / Deliverable / Gate.

Owner rights are implicit and cannot be removed by a grant. Owner is **not** stored as a VIEWER/EDITOR row.

### Inactive owner freeze (M5.0)

Suspension/removal of the owner membership:

1. Revokes the owner session (existing identity floor).
2. Retains the Calendar and history.
3. Does **not** auto-transfer ownership.
4. Does **not** open an administrator content backdoor (`calendar.admin` is reserved and fail-closed; it does not imply private content).
5. Existing valid grantees may **read**.
6. Mutations and grant administration are unavailable until the **same** owner membership is ACTIVE again.

Recovery/transfer is deferred and requires a future explicit audited policy.

### Grants (R05)

`CalendarAccessGrant` targets exactly one principal: USER (`organizationMembershipId`) or TEAM (`teamId`) — XOR. Roles: `VIEWER | EDITOR`. Same Organization only. Duplicate **active** grants for the same principal/calendar are rejected (partial unique indexes).

| Actor | Read | Manual event mutate | Grant admin | Rename / archive | Mutate source Task/… |
| --- | --- | --- | --- | --- | --- |
| Active owner | yes | yes | yes | yes | no |
| EDITOR (effective) | yes | yes | no | no | no |
| VIEWER (effective) | yes | no | no | no | no |
| Inactive owner | no (session revoked) | no | no | no | no |
| Grantee while owner inactive | yes if path still active | no | no | no | no |
| Org Admin without grant | no | no | no | no | no |
| Org member without grant | no | no | no | no | no |

**Overlapping grants (M5.0):** effective authority = max role across current paths (`EDITOR > VIEWER`). Every provenance remains visible. Revoking one path does not revoke another. Archived/inactive Team paths are ineffective but historically preserved (`revokedAt` / Team `archivedAt`).

Team-derived access evaluates **current** ACTIVE `TeamMembership`. Removal is immediate.

Calendar access **never** grants Project access. Team membership **never** grants Project access.

### Events and time (R03, R08)

Kind: `MANUAL | REFERENCED`.

Timed events persist UTC instants (`startsAt` / `endsAt`) **plus** an IANA `timeZone`. All-day events persist local dates (`allDayStartDate` / `allDayEndDate`) and must **not** store UTC instants. Invalid or ambiguous DST is rejected unless explicitly disambiguated. The server is authoritative (`assertAuthoritativeInstant`).

`endsAt` / all-day end cannot precede start.

### Referenced projections (R07)

Initial `referenceType`: `TASK | MILESTONE | DELIVERABLE | GATE`. Stored as type+id — **no** FK to source tables. Optional `linkedProjectId` is a routing hint, not authority.

Authorization is two-dimensional: Calendar access **and** current source authorization. MVP **omits** protected referenced details when the source is missing, archived, or unauthorized. Persisted titles/dates must not leak as live snapshots (`projectReferencedEvent`).

Calendar edits never silently mutate source lifecycle.

### My Schedule (R08)

Read model / overlay. May combine owned calendars, direct grants, Team grants, and authorized project planning dates. Source toggles are client filters over an authorized merge. Duplicate source identities are deduplicated. Windowing/pagination is cursor + time range (allowlisted). Overlay does not copy ownership.

Transport: correctness must hold with refresh/polling. Presence is not required.

---

## Messaging

### Conversation (R04, R06)

Organization-scoped. Kinds: `DIRECT | TEAM`. No cross-Organization conversation.

**DIRECT:** exactly two OrganizationMembership participants. Canonical identity = unordered pair of immutable membership IDs (`participant_low_id < participant_high_id`). Unique per Organization. Shared Project is **not** required. A new membership ID does not inherit old Direct history.

**TEAM:** bound to exactly one Team. One primary conversation per Team (`team_id` UNIQUE). Access = current ACTIVE TeamMembership + ACTIVE OrgMembership. Archived Team is **read-only** retained history. Later join sees retained history in MVP.

Removed/suspended OrgMembership loses access immediately. Removed Team members lose Team chat immediately. Historical authorship remains attributable.

Participation never grants linked Amber resource access. Chat is **not** the system of record for technical/governance decisions.

### Message (R09)

Append-forward. Author must currently have write access. Author may edit (sets `editedAt`) or tombstone (`deletedAt`). No hard delete. Version/CAS on edit/tombstone. Attachments are **out of scope**.

Ordering: server `createdAt` + stable `id` tie-breaker. Cursor pagination.

**Unread:** authorized Messages from **others** after the per-user watermark (`lastReadCreatedAt`, `lastReadMessageId`). Own sends, edits, and tombstones do not create unread. Read-state is not audit-critical.

**Search/snippet:** authorized conversations only. No inaccessible existence or count leaks.

**Deep links:** references only. Target authorization is re-evaluated on open. Previews must not reveal protected target metadata.

Org Admin / Project Coordinator / Auditor / non-member Team manager **cannot** read Direct or Team content merely by role.

---

## AuthZ / privacy (R10)

See [m5-permission-catalog.md](../security/m5-permission-catalog.md).

Normal create/read/share/send requires no new role-template permissions. Reserved `calendar.admin` / `message.moderate` are fail-closed and unassigned.

External members: may use personal Calendars and eligible Direct chat; Team chat only via TeamMembership; directory/autocomplete follows R-1.5 (no unrestricted internal directory).

Frontend guards are usability only.

---

## Mutations, audit, CAS, outbox (R11)

Every Calendar/Messaging mutation (M5.2/M5.4) must:

1. Authenticate and bind session Organization.
2. Load actor OrganizationMembership (ACTIVE).
3. Load target and verify same Organization.
4. Evaluate owner/grant/participation (not `project.read` for private content).
5. Re-authorize referenced sources on read/action.
6. Require `Idempotency-Key` on listed POSTs (`CALENDAR_MUTATIONS_REQUIRE_IDEMPOTENCY`, `MESSAGING_MUTATIONS_REQUIRE_IDEMPOTENCY`).
7. Require `expectedVersion` / CAS on listed updates.
8. Insert audit for material events (ADR-008). MessageSent is operational history, not Audit.
9. Optionally emit outbox types in `OUTBOX_EVENT_TYPES`.
10. Carry `correlationId`.

Audit events added to `SECURITY_AUDIT_EVENTS`: `CALENDAR_*`, `DIRECT_CONVERSATION_CREATED`, `TEAM_CONVERSATION_CREATED`, `MESSAGE_EDITED`, `MESSAGE_DELETED`. Audit must not copy private event/message bodies when metadata suffices.

---

## API / read-model boundaries (R14)

Planned paths: `packages/shared/src/m5-routes.ts` and [m5-openapi-plan.md](../api/m5-openapi-plan.md). They are **not** in `api/openapi/openapi.json` on this WI. M5.2/M5.4 generate OpenAPI from Nest decorators.

Read models (My Schedule, unread, inbox) may be eventually consistent for counts, but **must** re-check authorization before serving sensitive details after revocation.

---

## Explicit non-goals

ResourceAllocation / TimeEntry; attachments; moderation queues; external calendar sync; presence/typing/read receipts; voice/video; threads/reactions; automatic cascade from chat/calendar into governed state; cloud deploy.
