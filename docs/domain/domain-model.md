# Domain model (foundation view)

Core chain (APPROVED 0.1): **Revision → Impact → Issue → Task → Milestone → Gate**.

PF-1.3 implements Document + Revision on that chain. It does **not** implement Impact, Issue, Task, Milestone, or Gate.

## Aggregates (working hypothesis from 0.1)

Organization, Project, Document, Issue, Task, Milestone, Gate.

PF-1.3 persists Document and Revision. Document is the stable logical artifact (Project + Organization). Revision is one version of that Document.

## Invariants already enforced in code

- No cross-org access without membership + authorization.
- Session-bound active Organization; deny-by-default.
- Amber Role Templates are not operational grants; Organization-owned RoleDefinitions are.
- Organization membership ≠ project membership; project-scoped AuthZ requires ACTIVE ProjectMembership + assignment.
- Client `organizationId` / `projectId` / `documentId` / `revisionId` never establish authority.
- Closed permission catalog; Formal Exception sole bypass.
- Audit rows are append-only.
- File access fail-closed unless `scan_status=CLEAN`.
- Published revision content is immutable; correction = new revision.
- One current valid revision per Document via `currentRevisionId`; change is explicit, CAS-protected, and audited.
- Publisher cannot approve, reject, or make-current their own Revision.

## Invariants reserved for later slices

- Approving Formal Exception does not satisfy the requirement.
- `CurrentRevisionChanged` creates an Impact Analysis case only (Coordination / 0.4).
