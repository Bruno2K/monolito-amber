# Domain model (foundation view)

Core chain (APPROVED 0.1): **Revision → Impact → Issue → Task → Milestone → Gate**.

PF-1.5 implements Document + Revision + Impact Analysis + Issue + Task + Milestone on that chain. It does **not** implement Gate.

## Aggregates (working hypothesis from 0.1)

Organization, Project, Document, Issue, Task, Milestone, Gate.

PF-1.5 persists Document, Revision, Impact Analysis, Issue, Task, TaskDependency, and Milestone. Document is the stable logical artifact (Project + Organization). Revision is one version of that Document. Impact Analysis is the at-most-one case created by a current-base change. Issue is the coordination problem / pendência. Task is executable Planning work (Task ≠ Issue). Milestone is an explicit project checkpoint.

## Invariants already enforced in code

- No cross-org access without membership + authorization.
- Session-bound active Organization; deny-by-default.
- Amber Role Templates are not operational grants; Organization-owned RoleDefinitions are.
- Organization membership ≠ project membership; project-scoped AuthZ requires ACTIVE ProjectMembership + assignment.
- Client `organizationId` / `projectId` / `documentId` / `revisionId` / `impactId` / `issueId` never establish authority.
- Closed permission catalog; Formal Exception sole bypass.
- Audit rows are append-only.
- File access fail-closed unless `scan_status=CLEAN`.
- Published revision content is immutable; correction = new revision.
- One current valid revision per Document via `currentRevisionId`; change is explicit, CAS-protected, and audited.
- Publisher cannot approve, reject, or make-current their own Revision.
- `CurrentRevisionChanged` creates exactly one Impact Analysis case (`PENDING_ANALYSIS`); never auto-IMPACTED or auto-Issues.
- Impact assessment records assessor, time, and rationale. Impact resolve is denied while linked Issues are open/active (including RESOLVED).
- Issue origin is IMPACT | MANUAL (server-derived). RESOLVED ≠ CLOSED. Severity ≠ Priority. Discipline ≠ assignee.
- Coordination never mutates Document current revision, Revision lifecycle, or file-trust.
- Task ≠ Issue. Standalone Tasks are allowed. Issue → 0..N Tasks. Completing a Task does not resolve an Issue and does not achieve a Milestone.
- Task assignment requires ACTIVE ProjectMembership. Client `taskId` / `milestoneId` never establish authority.
- Task dependencies are finish-to-start only; self / duplicate / cycle / cross-project edges are rejected. Cycle checks walk same-Project edges only.
- A Task cannot move to IN_PROGRESS while a finish-to-start prerequisite is not DONE.
- Task lateness is derived. Milestone AT_RISK / MISSED are derived (ADR-016). ACHIEVED is explicit.

## Invariants reserved for later slices

- Approving Formal Exception does not satisfy the requirement (Planning / Governance).
