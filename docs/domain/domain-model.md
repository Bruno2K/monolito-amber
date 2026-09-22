# Domain model (foundation view)

Core chain (APPROVED 0.1): **Revision → Impact → Issue → Task → Milestone → Gate**.

PF-1.6 implements Document + Revision + Impact Analysis + Issue + Task + Milestone + Gate on that chain.

## Aggregates (working hypothesis from 0.1)

Organization, Project, Document, Issue, Task, Milestone, Gate.

PF-1.6 persists Document, Revision, Impact Analysis, Issue, Task, TaskDependency, Milestone, Gate, GateRequirement, FormalException, and GateReleaseDecision. Document is the stable logical artifact (Project + Organization). Revision is one version of that Document. Impact Analysis is the at-most-one case created by a current-base change. Issue is the coordination problem / pendência. Task is executable Planning work (Task ≠ Issue). Milestone is an explicit project checkpoint. Gate is the governance checkpoint over typed requirements. Formal Exception is the sole requirement-specific bypass.

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
- READY ≠ RELEASED. Evaluation never auto-releases a Gate.
- Formal Exception is the sole bypass. It does not mark a requirement SATISFIED. RELEASED ≠ RELEASED_WITH_EXCEPTION.
- Governance reads Documents / Coordination / Planning via adapters and does not mutate upstream.
- Exception is requirement-specific. Requester cannot approve/reject own Exception or release using it.
- After RELEASED_WITH_EXCEPTION, revoke/expiry of a covering Exception + still UNSATISFIED → BLOCKED. Historical release evidence is immutable.
