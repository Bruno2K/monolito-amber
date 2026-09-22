# Domain model (foundation view)

Core chain (APPROVED 0.1): **Revision → Impact → Issue → Task → Milestone → Gate**.

PF-1.1 does **not** implement that chain. It implements Identity & Organizations so later slices do not invent AuthN/AuthZ policy.

## Aggregates (working hypothesis from 0.1)

Organization, Project, Document, Issue, Task, Milestone, Gate.

## Invariants already enforced in code

- No cross-org access without membership + authorization.
- Session-bound active Organization; deny-by-default.
- Closed permission catalog; Formal Exception sole bypass.
- Audit rows are append-only.
- File access fail-closed unless `scan_status=CLEAN`.

## Invariants reserved for later slices

- Published revision content is immutable; correction = new revision.
- One current valid revision per Document; change is explicit + audited.
- Approving Formal Exception does not satisfy the requirement.
- `CurrentRevisionChanged` creates an Impact Analysis case only.
