# ADR-016 — Planning Tasks, Dependencies, and Derived Milestone Risk

## Status
Accepted (PF-1.5)

## Context
APPROVED 0.5 separates Planning (what work must happen, by whom, by when) from Governance (whether the project may advance). Task ≠ Issue. A Task may be standalone or linked to an Issue (Issue → 0..N Tasks). Completing a Task does not resolve an Issue and does not achieve a Milestone.

0.5 lists Milestone states `PLANNED | AT_RISK | ACHIEVED | MISSED | CANCELLED` and says AT_RISK should preferably be derived. 0.7 leaves exact AT_RISK thresholds as an open business question. Inventing day-windows, percent-complete, or “critical Task” cutoffs would create a product policy that 0.5 does not authorize.

0.2A already contains `task.*` and `milestone.*`. Adding new permission codes would invent AuthZ semantics.

Gates, Gate Requirements, and Formal Exceptions remain out of this slice.

## Decision
- Planning owns `Task`, `TaskDependency`, and `Milestone` in the `planning` schema. Coordination continues to own Issue. Completing a Task never writes Issue or Milestone status.
- Task lifecycle is `TODO → IN_PROGRESS → BLOCKED | DONE` with `CANCELLED` as a side state. `BLOCKED` requires `blockedReason`. There is no `OVERDUE` status; lateness is derived from due date + completion state (`DONE` / `CANCELLED` are never late).
- Optional `issueId` and `milestoneId` must be the same Organization and Project. Assignment requires an ACTIVE ProjectMembership (and ACTIVE OrganizationMembership) in that Project.
- Dependencies are finish-to-start only. The server rejects self-edges, duplicates, cross-project pairs, and cycles. Cycle detection walks only same-Project edges already loaded for the authorized Project — it never traverses another tenant’s graph.
- A Task cannot move to `IN_PROGRESS` while any finish-to-start predecessor is not `DONE` (including `CANCELLED` predecessors).
- Milestone stored status is explicit only: `PLANNED | ACHIEVED | CANCELLED`. `ACHIEVED` is an explicit `milestone.achieve` action. Clients cannot patch AT_RISK or MISSED.
- Documented derivation baseline (no invented thresholds):
  - explicit ACHIEVED / CANCELLED always win;
  - MISSED = still PLANNED and `targetDate` is in the past;
  - AT_RISK = still PLANNED and at least one linked Task is late;
  - otherwise PLANNED.
- AuthZ uses existing `task.*` / `milestone.*`. Path and body `projectId` / `organizationId` are routing hints. Server session + membership is authoritative.
- Idempotency-Key is required for Task create, status/DONE, dependency create, Milestone create, and achieve.
- Optional outbox events: `TaskCreated`, `TaskAssigned`, `TaskBlocked`, `TaskCompleted`, `MilestoneCreated`, `MilestoneAchieved`. No Redis/BullMQ. No Planning UI. No `gate.override`.

## Alternatives
- Persist AT_RISK / MISSED as client-writable statuses — rejected: 0.5 prefers derivation; 0.7 leaves thresholds open.
- Invent “N days before target” or “critical Task” AT_RISK rules — rejected: undocumented business policy.
- Auto-achieve Milestone when all linked Tasks are DONE — rejected: achieve is explicit; Task done ≠ Milestone achieve.
- Auto-resolve Issue when its Tasks are DONE — rejected: Issue ≠ Task.
- Start-to-start / finish-to-finish / Gantt / critical path — rejected: 0.5 MVP is finish-to-start only.
- Add `impact.*`-style new planning permissions — rejected: closed 0.2A catalog already has `task.*` / `milestone.*`.
- Implement Gates / Formal Exceptions in this slice — rejected: PF-1.5 non-goal.

## Consequences
Planning APIs return `late` on Tasks and both `recordedStatus` and derived `status` on Milestones. Reviewers can check the derivation without inferring hidden thresholds. A later Governance slice may consume Milestone state; it must not mutate Planning rows.

## Implementation Implications
Migration `20260922220000_pf_1_5_planning_tasks_milestones`. Schema `planning`. Tenant-binding triggers on Task / Milestone / TaskDependency. Same-Project cycle check in `@amber/shared`.

## Supersedes
None. Completes the Planning half of ADR-007-12 / 0.5 without opening Governance.
