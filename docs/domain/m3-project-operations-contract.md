# M3 Project Operations contract

**Status:** ACTIVE for M3.1 (LOCAL ONLY). Executable repo mirror of Issue [#30](https://github.com/Bruno2K/monolito-amber/issues/30) and Notion [M3.1](https://app.notion.com/p/3ec678e54c8d812d9f92d02f9f153568).
**Does not deliver** production Ops CRUD/UI. Schema application is M3.3+; this document plus `@amber/shared` tables are the freeze.

Canonical product design (reference only): Figma `fkE9SwcNlQG7m0HvcGQBw9`.

## Binding authority

| Source | Role |
| --- | --- |
| Notion M3.1 contract | Binding field/state/permission/route interpretations for M3 |
| Governor execution spec | Same interpretations; LOCAL ONLY authorization |
| R-1 (Operational Management Expansion) | Vision. M3.1 **closes** open R-1 decisions for M3 only |
| Execution Pack M3.4 sketch (“Phase/Discipline optional”) | Superseded for M3 by this contract: Deliverable **requires** `phaseId` and `disciplineId` |
| Platform Foundation (PF-1.x) | KEEP. Operations **extends**; it does not rewrite Identity, Documents, Coordination, Planning, or Governance |

No HUMAN_REQUIRED: the optional-vs-required wording in the Pack’s later WI sketch is resolved by the M3.1 page.

## KEEP / EXTEND / ADD

| Area | KEEP | EXTEND | ADD |
| --- | --- | --- | --- |
| Identity / tenancy / ProjectMembership | Session-bound org; deny-by-default; ACTIVE membership | — | — |
| Closed catalog | All 0.2A codes; nine role template **keys**; no `gate.override` | Additive Operations permission codes + template grants | `operations` module in catalog |
| Documents / Revisions | Immutability, current pointer, SoD | Historical `disciplineId` **strings preserved** | Optional later FK after catalog exists (expand, not rewrite) |
| Coordination / Planning / Governance | Issue ≠ Task; READY ≠ RELEASED; Formal Exception sole bypass | Optional additive links in M3.7 (non-authoritative) | — |
| Modules | Existing schemas | `org` catalogs (Discipline, Team) | `operations` schema: Phase, Deliverable, WorkPackage |
| Web | Foundation auth routes | Shell M2.1 in M3.2 | `/projects…` product routes (plan only here) |
| Figma M2 frames | Evidence for UX fidelity | Map PT prototype paths → English product routes | Structure surface |

## Aggregates

Phase ≠ Deliverable ≠ WorkPackage. Deliverable ≠ Document. WorkPackage ≠ Task. Issue ≠ Task.

### Phase

Project-scoped delivery phase. Dates do **not** transit status. Overlap is allowed. Sequence is unique among **non-archived** Phases of the same Project.

| Field | Required | Notes |
| --- | --- | --- |
| organizationId | yes | Denormalized tenancy; must match Project.organizationId |
| projectId | yes | Parent Project (empreendimento) |
| name | yes | |
| description | yes | Empty string allowed |
| sequence | yes | Integer; unique among non-archived Phases of the Project |
| plannedStartAt | no | Never auto-activates |
| plannedEndAt | no | Never auto-completes |
| actualStartAt | no | Recorded on explicit ACTIVE; not a status driver |
| actualEndAt | no | Recorded on explicit COMPLETED/CANCELLED; not a status driver |
| status | yes | See state machine |
| createdBy | yes | User id of creator |
| version | yes | Optimistic concurrency |
| archivedAt | no | Soft archive (Document pattern). Implied by uniqueness rule |
| createdAt / updatedAt | yes | |

**States:** `PLANNED → ACTIVE → COMPLETED`. `CANCELLED` from `PLANNED` or `ACTIVE`. `COMPLETED` and `CANCELLED` are terminal. No skip `PLANNED → COMPLETED`.

**Permissions:** `phase.create`, `phase.update` (fields, activate, cancel), `phase.complete` (ACTIVE → COMPLETED). Reads: `project.read`.

### Discipline

Organization-owned catalog. **Not** Project access. **Not** assignee. Historical string identifiers on Document / Issue / Task (`disciplineId`, `responsible_discipline_id`) are preserved; migration must not rename or remove existing data.

| Field | Required | Notes |
| --- | --- | --- |
| organizationId | yes | Catalog owner |
| code | yes | Case-insensitive unique per Organization |
| name | yes | |
| active | yes | Inactive catalog rows remain for history |
| sortOrder | no | Display order |
| createdAt / updatedAt | yes | |

Managed with existing `organization.manage_catalogs`. Visible in Project context via `project.read`. No `discipline.*` permission is invented.

### Deliverable

Business/technical outcome — not a file. `phaseId` and `disciplineId` are **required**. Code is unique case-insensitive within the Project among non-archived rows.

| Field | Required | Notes |
| --- | --- | --- |
| organizationId | yes | |
| projectId | yes | |
| phaseId | **yes** | Same Project |
| disciplineId | **yes** | Same Organization catalog |
| code | yes | Case-insensitive unique among non-archived in Project |
| title | yes | |
| description | yes | Empty string allowed |
| ownerProjectMembershipId | no | XOR with Team |
| ownerTeamId | no | XOR with user; same Organization; does **not** grant Project access |
| plannedStartAt / dueAt | no | Do not transit status (M4 schedule engine is out) |
| status | yes | |
| progressPercent | no | Stored optional; **not** auto-derived from WorkPackages in M3 |
| version | yes | CAS |
| archivedAt | no | Soft archive |
| createdAt / updatedAt | yes | |

**States (linear, explicit):** `PLANNED → IN_PROGRESS → IN_REVIEW → APPROVED → DELIVERED`. `CANCELLED` allowed from any state **before** `DELIVERED` (including `APPROVED`). `DELIVERED` and `CANCELLED` are terminal. `APPROVED` and `DELIVERED` are explicit actions (`deliverable.approve`, `deliverable.deliver`). No skip `IN_REVIEW → DELIVERED`.

**Ownership XOR:** zero owners, or exactly one. User and Team are mutually exclusive. User owner requires **ACTIVE** ProjectMembership (and therefore ACTIVE OrganizationMembership). Team owner must be the same Organization. Owner, Team, and Discipline **never** grant Project access. TeamMembership ≠ ProjectMembership.

**Delivery rule (M3):** every WorkPackage **still linked** is mandatory. `DELIVERED` requires all linked WorkPackages `DONE`. A still-linked `CANCELLED` WorkPackage **blocks** delivery until an **explicit** disassociation. No silent bypass. Formal Exception is **not** a Deliverable delivery bypass (`gate.override` remains forbidden).

**Permissions:** `deliverable.create`, `deliverable.update`, `deliverable.assign`, `deliverable.approve`, `deliverable.deliver`. Reads: `project.read`.

### WorkPackage

Operational breakdown unit. `phaseId` is required. `deliverableId` and `disciplineId` are optional. Optional `code` is unique case-insensitive among non-archived WorkPackages of the Project when present.

| Field | Required | Notes |
| --- | --- | --- |
| organizationId | yes | |
| projectId | yes | |
| phaseId | **yes** | Same Project |
| deliverableId | no | Same Project; when set, participates in delivery rule |
| disciplineId | no | Same Organization catalog |
| code | no | |
| title | yes | |
| description | yes | Empty string allowed |
| blockedReason | when BLOCKED | Required on enter BLOCKED; leaving BLOCKED clears/closes it with audit |
| ownerProjectMembershipId / ownerTeamId | no | Same XOR as Deliverable |
| plannedStartAt / dueAt | no | |
| status | yes | |
| version | yes | |
| archivedAt | no | |
| createdAt / updatedAt | yes | |

**States:** `PLANNED → ACTIVE`; `ACTIVE ↔ BLOCKED`; `ACTIVE → DONE`; `PLANNED | ACTIVE | BLOCKED → CANCELLED`. `DONE` and `CANCELLED` are terminal. No `BLOCKED → DONE` skip.

**Tasks:** M3.7 may add incidental Task links as context. They **do not** block `DONE` in M3. A future required-task policy needs its own contract. WorkPackage ≠ Task.

**Permissions:** `work_package.create`, `work_package.update` (fields, activate, block, cancel), `work_package.complete`. Reads: `project.read`.

## Role-template delta (additive)

| Template | Operations grants |
| --- | --- |
| PROJECT_COORDINATOR | All `phase.*`, `deliverable.*`, `work_package.*` listed above (management) |
| DISCIPLINE_COORDINATOR | `deliverable.create\|update\|assign`, `work_package.create\|update\|complete` within authorized Project/Discipline scope. **Not** Phase management, **not** `deliverable.approve` / `deliverable.deliver` (mirrors revision.approve staying off this template) |
| CONTRIBUTOR_DESIGNER, VIEWER, EXTERNAL_CONTRIBUTOR, REVIEWER, GOVERNANCE_APPROVER, AUDITOR | No Operations mutation |
| ORGANIZATION_ADMINISTRATOR | Unchanged operational grants. Discipline catalog via existing `organization.manage_catalogs` |

Seed already backfills missing permissions onto Organization-owned RoleDefinition copies.

## Canonical UI routes (plan only)

- `/projects` — visible Projects
- `/projects/:projectId/overview` — Visão Geral / Project Hub
- `/projects/:projectId/structure` — Phase and Discipline context
- `/projects/:projectId/deliverables` — Entregas; details via inspector/deep-link (URL preserved)
- Planner / `/planejamento` — **reserved for M4**. Do not implement in M3.

Portuguese Figma prototype paths remain evidence; they are not second product routes.

## Invariants (preserved)

Org → Project tenancy; active ProjectMembership for Project resource access; owner/Team/Discipline ≠ Project access; TeamMembership ≠ ProjectMembership; Phase ≠ Deliverable ≠ WorkPackage; Deliverable ≠ Document; WorkPackage ≠ Task; Issue ≠ Task; READY ≠ RELEASED; Exception ≠ SATISFIED; Formal Exception sole Gate bypass; revision immutability; audit append-only; server-side deny-by-default; no leak placeholders / hidden counts; immediate revoke on remove/suspend; no M4–M7 automation; no second design system.

## Out of scope (this WI and M3 generally as noted)

Ops CRUD UI (M3.2–M3.6); applying Prisma schema (M3.3+); cloud deploy; Gate Templates; Gantt; calendars/chat; auto-complete / auto-release / auto-resolve; ResourceAllocation / TimeEntry (M8); inventing permissions; `gate.override`.

## Executable encoding

State tables, XOR, delivery rule, seed completeness, and route collision live in `@amber/shared` (`operations.ts`, `m3-routes.ts`, `m3-seed-design.ts`) and are asserted in CI unit + security tests.
