# M4 Planning & Scheduling contract

**Status:** ACTIVE for M4.1 (LOCAL ONLY). Executable repo freeze of Issue [#54](https://github.com/Bruno2K/monolito-amber/issues/54) and Notion [M4.1](https://app.notion.com/p/3ec678e54c8d8103beafc69c3bb51edc).  
**Does not deliver** Planning UI, schema application, or new handlers. M4.2–M4.9 remain LOCKED until Governor Exit Gate PASS on this WI.

Canonical visual reference (not a second IA): Figma `fkE9SwcNlQG7m0HvcGQBw9`, page `04 — Telas`.  
Canonical code encoding already on `main`: `@amber/shared` `planning.ts`, ADR-016, PF-1.5 APIs.

M3 Exit Gate **FAIL — ACCEPTED** is accepted debt — not this contract’s scope. Do not claim M3 COMPLETE.

## Binding authority

| Source | Role |
| --- | --- |
| Notion M4.1 + M4 Execution Pack | Binding interpretations for M4 |
| Governor execution spec | Same; LOCAL ONLY; M4.1 READY only |
| ADR-016 | Accepted Planning machine, FS deps, derived Milestone risk |
| 0.5 Planning, Gates & Exceptions | APPROVED. Task ≠ Issue. ACHIEVED explicit |
| 0.2A closed catalog | `task.*` / `milestone.*` only. No invented codes |
| Platform Foundation + M3 Operations | KEEP. Planning **extends** read-links; it does not rewrite Identity, Documents, Coordination, Operations, or Governance |

## KEEP / EXTEND / ADD

| Area | KEEP | EXTEND | ADD (later WIs) |
| --- | --- | --- | --- |
| Task / Milestone / TaskDependency tables | PF-1.5 + M3.7 columns | — | Indexes/seed only if proven necessary |
| State machines | `planning.ts` | — | — |
| Permissions | 0.2A codes + templates | — | **No** new permission codes |
| Entity APIs | Existing `/tasks` `/milestones` | CAS/idempotency tightening | Unified `GET …/planning` |
| Web | Shell M2.1 / M3 product routes | — | `/projects/:projectId/planner` |
| Governance | Read adapter | — | Must not mutate Planning |
| Hub | `upcomingMilestones` signal | — | Must not become a second planner |

## Invariants (non-negotiable)

1. Issue ≠ Task. WorkPackage ≠ Task. Deliverable ≠ Document. TeamMembership ≠ ProjectMembership.
2. DONE and ACHIEVED are **explicit** authorized commands. No silent cascades.
3. Dates and progress do **not** transit Task, Milestone, Phase, Deliverable, Issue, or Gate status.
4. Dependencies are finish-to-start, same-Project only. No auto date propagation.
5. List, Kanban, Gantt, and Marcos are projections of **one** Planning dataset.
6. Every read model, count, filter, search result, and linked-resource preview is **re-authorized**.
7. Formal Exception remains the sole Gate bypass. No `gate.override`.
8. LOCAL ONLY. No Vercel / Railway / public URL / M5 in this milestone.

---

## Task lifecycle (R05)

Encoded: `packages/shared/src/planning.ts` `TASK_TRANSITIONS`.

```
TODO → IN_PROGRESS → BLOCKED | DONE
CANCELLED is a side state from TODO | IN_PROGRESS | BLOCKED
DONE and CANCELLED are terminal
```

| Rule | Contract |
| --- | --- |
| Create | Always `TODO` |
| `TODO → DONE` or `TODO → BLOCKED` | **Forbidden** (no skip) |
| `BLOCKED → DONE` | **Forbidden** (must return to `IN_PROGRESS` first) |
| BLOCKED | Requires non-empty `blockedReason`. Leaving BLOCKED clears the reason |
| DONE | Requires `task.complete` (or `POST …/status` with `task.complete`). Sets `completedAt`. Explicit |
| CANCELLED | `task.update`. Terminal. Never late |
| IN_PROGRESS | Denied while any FS predecessor is not `DONE` (a `CANCELLED` predecessor still blocks — it is not `DONE`) |
| Lateness | Derived: `dueDate < now` and status ∉ {DONE, CANCELLED}. There is **no** `OVERDUE` status |
| Dates / progress | PATCH may change `dueDate`, `plannedStartAt`, `progressPercent`; they never write `status` |
| Linked aggregates | Task DONE does not resolve an Issue, achieve a Milestone, complete a WorkPackage, deliver a Deliverable, or evaluate a Gate |

Assignee is not a status. Assignment uses `POST …/assign` and requires ACTIVE ProjectMembership (and ACTIVE OrganizationMembership) in that Project. Unassign (`assigneeUserId: null`) is allowed for `task.assign`.

---

## Milestone stored vs derived (R06)

Stored (`planning.milestones.status` CHECK): **`PLANNED | ACHIEVED | CANCELLED`**.

Derived on every authorized read (`deriveMilestoneStatus`, ADR-016) — **no invented thresholds**:

| Derived `status` | When |
| --- | --- |
| ACHIEVED | stored ACHIEVED (always wins) |
| CANCELLED | stored CANCELLED (always wins) |
| MISSED | still PLANNED and `targetDate` is in the past |
| AT_RISK | still PLANNED and at least one linked Task is `late` |
| PLANNED | otherwise |

API DTO already returns `recordedStatus` (stored) and `status` (derived). Clients **cannot** PATCH AT_RISK or MISSED. ACHIEVE is `POST …/achieve` (`milestone.achieve`). CANCEL is `POST …/cancel` (`milestone.update`). Terminal stored states cannot be field-updated.

Figma chips “Planejado / Em risco / Concluído” map to derived/stored values above. Figma “Bloqueado” on a Marco (`194:7033`) is **documentary-only** — Milestone has no BLOCKED stored state.

---

## Dependencies (R07)

MVP: **same-Project finish-to-start**.

| Rejection | How |
| --- | --- |
| Self-edge | SQL CHECK + `assertAcyclicDependency` |
| Duplicate pair | UNIQUE `(predecessor, successor)` + service |
| Cycle | `wouldCreateCycle` over **same-Project** edges only |
| Cross-Project / cross-Org | Tenant trigger + `DenyByDefaultError` |
| Type ≠ `FINISH_TO_START` | SQL CHECK + `assertFinishToStartType` |
| Successor already `IN_PROGRESS` or `BLOCKED` and predecessor not `DONE` | `PlanningStateError` |
| Successor → `IN_PROGRESS` while any predecessor is not `DONE` | `prerequisitesBlockStart` |

No start-to-start, finish-to-finish, lag/lead calendar engine, or automatic successor date shift. Gantt drags that would propagate dates are **rejected** (M4.6). Unlink (delete edge) is the additive M4.4 command `DELETE …/tasks/{taskId}/dependencies/{dependencyId}` (`task.update` + `Idempotency-Key`). Create remains `POST …/dependencies`.

---

## Single Planning read-model (R08)

One normalized query is the source for List, Kanban, Gantt, and Marcos. It is **not** a second schedule database. Timeline writes go to Task / Milestone / TaskDependency commands already defined.

### Planned endpoint (M4.2 — do not implement in M4.1)

`GET /api/v1/projects/{projectId}/planning`

AuthZ: session + ACTIVE OrganizationMembership + ACTIVE ProjectMembership + `project.read`. Path `projectId` is a routing hint. Unauthorized projects are **omitted** (404/deny-by-default), never a leaked empty count of another tenant.

Query (illustrative): `view=list|kanban|gantt|milestones` is a **projection hint**. The payload always contains the same record sets; views must not fetch a parallel store.

### Payload (normative shape)

```
PlanningReadModel {
  projectId
  organizationId
  generatedAt
  tasks: PlanningTaskRead[]      // existing Task DTO + kanbanColumn
  milestones: PlanningMilestoneRead[]  // recordedStatus + derived status
  dependencies: PlanningDependencyRead[]
}
```

`PlanningTaskRead` = current Task DTO plus:

| Extra field | Derivation |
| --- | --- |
| `late` | existing `isTaskLate` |
| `kanbanColumn` | `PLANEJADAS` / `EM_ANDAMENTO` / `EM_RISCO` / `BLOQUEADAS` / `null` (DONE/CANCELLED) per [gap analysis](./m4.1-gap-analysis.md) |

Existing `GET …/tasks` and `GET …/milestones` remain entity APIs. The Planning query **reuses** `TasksService.toDto` / `MilestonesService.toDto` (or equivalent). It must not invent a Hub-style second aggregation table.

### Re-authorization

Every call re-runs AuthZ. Linked Issue / Deliverable / WorkPackage / Phase / Milestone **previews** are re-authorized individually. After revoke or cross-tenant id, omit the preview without a placeholder title or hidden count. Deep links (`?inspect=`, `?milestone=`) re-authorize at the destination. Filters that would reveal unauthorized ids fail closed.

Governance and Hub may **read** this model (or the same tables) and must not write Planning rows.

---

## AuthZ matrix (R09)

Closed catalog. Reads: `project.read`. No `task.read` / `milestone.read`. Server session + membership is authoritative.

### Membership floors (all operations)

| Actor state | Read / list / read-model | Any mutation |
| --- | --- | --- |
| No session | 401 | 401 |
| ACTIVE Org + ACTIVE Project + grant | per permission | per permission |
| EXTERNAL_CONTRIBUTOR ACTIVE on **that** Project | yes if `project.read` | only granted `task.*` |
| EXTERNAL on another Project / org directory | omit / deny | deny |
| ProjectMembership SUSPENDED | deny (session revoked / omit) | deny |
| ProjectMembership REMOVED | deny | deny |
| OrgMembership SUSPENDED / REMOVED | deny (overrides Project) | deny |
| TeamMembership only | deny (≠ Project access) | deny |
| Deliverable/WP owner or Discipline catalog row only | deny | deny |
| Cross-Organization id | deny / omit | deny |

Immediate revoke: an existing cookie after suspend/remove cannot list or mutate Planning.

### Operation × permission × template

| Operation | Permission | PROJECT_COORDINATOR | DISCIPLINE_COORDINATOR | CONTRIBUTOR_DESIGNER | EXTERNAL_CONTRIBUTOR | VIEWER | AUDITOR | REVIEWER | GOVERNANCE_APPROVER | ORG_ADMIN |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Read / list / planning query | `project.read` | yes | yes | yes | yes | yes | yes | yes | **no** (template has no `project.read`) | yes |
| Task create | `task.create` | yes | yes | no | no | no | no | no | no | no |
| Task field update | `task.update` | yes | yes | yes | yes | no | no | no | no | no |
| Task assign | `task.assign` | yes | yes | no | no | no | no | no | no | no |
| Task start / block / cancel | `task.update` | yes | yes | yes | yes | no | no | no | no | no |
| Task complete (DONE) | `task.complete` | yes | yes | yes | yes | no | no | no | no | no |
| Dependency create | `task.update` | yes | yes | yes | yes | no | no | no | no | no |
| Milestone create | `milestone.create` | yes | **no** | no | no | no | no | no | no | no |
| Milestone update / cancel | `milestone.update` | yes | **no** | no | no | no | no | no | no | no |
| Milestone achieve | `milestone.achieve` | yes | **no** | no | no | no | no | no | no | no |

Notes:

- CONTRIBUTOR / EXTERNAL may update/complete Tasks (including assigned-work flows) but cannot create or assign. Product UI may further constrain to assignee; the **server** still requires the permission codes above and ACTIVE membership — it does not invent `task.update_own`.
- ORGANIZATION_ADMINISTRATOR has `project.read` but **not** `task.*` / `milestone.*`. Admin is not a Planning superuser.
- GOVERNANCE_APPROVER has no Planning grants and no `project.read` on the template. Gate evaluation may consume the Planning adapter without granting Planning mutation.
- MFA / `HIGH_RISK_PERMISSIONS` are unchanged. Planning codes are not high-risk.

---

## Audit, idempotency, optimistic concurrency (R10)

### Audit (every mutation)

Append-only `audit.audit_events` (ADR-008). Actor, org, project, resource, correlation id, redacted payload. Required event types (already emitted unless noted):

| Mutation | Event(s) |
| --- | --- |
| Task create | `TASK_CREATED` |
| Task field update | `TASK_DUE_DATE_CHANGED` and/or `TASK_DELIVERY_REFS_UPDATED` when those fields change; other field writes still increment `version` and must remain attributable (M4.3 may emit `TASK_UPDATED` if a dedicated event is added — additive, not a second table) |
| Assign | `TASK_ASSIGNED` |
| Status | `TASK_STATUS_CHANGED` + `TASK_BLOCKED` / `TASK_COMPLETED` / `TASK_CANCELLED` as applicable |
| Dependency create | `TASK_DEPENDENCY_CREATED` |
| Milestone create | `MILESTONE_CREATED` |
| Milestone field update | `MILESTONE_DATE_CHANGED` / `MILESTONE_DELIVERY_REFS_UPDATED` |
| Achieve | `MILESTONE_ACHIEVED` |
| Cancel | `MILESTONE_CANCELLED` |

`TASK_COMPLETED` payload already records cascade flags as `false`. Keep that honesty.

### Idempotency

`Idempotency-Key` is required (ADR-016 + this freeze) for:

- Task create, status transition, complete
- Dependency create
- Milestone create, achieve
- **M4.3+:** Task assign
- **M4.7+:** Milestone cancel

Replay returns the stored response and must not duplicate rows or extra audit/outbox for the same key+hash. PATCH field updates are CAS-protected; if an Idempotency-Key is sent it must replay, not double-apply.

**Baseline gap (truthful, not silently patched):** `POST …/milestones/:id/cancel` still does not require Idempotency-Key on this tip (M4.7). **M4.3 closed** the Task assign gap: `POST …/tasks/:id/assign` requires `Idempotency-Key`.

### Optimistic concurrency (CAS)

Task and Milestone carry integer `version`. M4 mutations that update those rows **must** accept `expectedVersion` and fail closed on mismatch (Foundation `cas` helper — typically 409). Lost-update is not last-write-wins.

**Baseline gap:** Milestone writes may still treat `expectedVersion` as optional until M4.7. **M4.3 closed** the Task write gap: create is new-row (no CAS); every Task field PATCH / assign / status / start / block / unblock / complete / cancel requires `expectedVersion`. Dependency edges have no `version`; create uniqueness + idempotency is the concurrency control.

Outbox events stay optional companions (ADR-016). No Redis/BullMQ Planning worker.
