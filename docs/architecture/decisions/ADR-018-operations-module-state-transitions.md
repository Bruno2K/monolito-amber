# ADR-018 — Operations module and state transitions

## Status
Proposed (M3.1 — LOCAL ONLY). Accepted when this WI is independently reviewed and merged.

## Context
M2 completed product-experience evidence without production Ops UI. R-1 expands Amber into project operations (Phase, Discipline, Deliverable, WorkPackage, Team) while preserving Platform Foundation. Issue #30 / Notion M3.1 closes field, lifecycle, ownership, permission, and route decisions so M3.2+ cannot invent domain.

Existing modules already own Project, Document, Issue, Task, Milestone, and Gate. Those semantics must not be reused for delivery structure. Document.disciplineId and Issue/Task `responsible_discipline_id` are catalog-pending **strings**, not FKs.

ADR-005 seeded only the 0.2A catalog. M3.1 authorizes an **additive** closed-catalog extension — not invented codes and never `gate.override`.

## Decision
- Introduce an **Operations** module (PostgreSQL schema `operations`) that owns `Phase`, `Deliverable`, and `WorkPackage`. Feature code does not join across module schemas (ADR-001 / ADR-002).
- Organization-owned **Discipline** catalog and minimal **Team** / TeamMembership live in schema `org` (catalog/collaboration subjects). They do not grant Project access. Discipline is managed with existing `organization.manage_catalogs`.
- Phase states: `PLANNED → ACTIVE → COMPLETED`; `CANCELLED` from `PLANNED`/`ACTIVE`; terminal `COMPLETED`/`CANCELLED`. Dates do not transit state. Overlap allowed. Sequence unique among non-archived Phases of a Project.
- Deliverable states (linear, explicit): `PLANNED → IN_PROGRESS → IN_REVIEW → APPROVED → DELIVERED`; `CANCELLED` before `DELIVERED`. `phaseId` and `disciplineId` required. Ownership XOR: none or exactly one of ACTIVE ProjectMembership or same-Org Team. Delivery requires every still-linked WorkPackage `DONE`; linked `CANCELLED` blocks until explicit disassociation.
- WorkPackage states: `PLANNED → ACTIVE`; `ACTIVE ↔ BLOCKED`; `ACTIVE → DONE`; cancel from non-terminal. `phaseId` required. `BLOCKED` requires `blockedReason`; leaving BLOCKED clears/closes the reason with audit. Incidental Task links do not block DONE in M3.
- AuthZ: additive project-scoped codes `phase.create|update|complete`, `deliverable.create|update|assign|approve|deliver`, `work_package.create|update|complete`. Reads via `project.read`. PROJECT_COORDINATOR receives management; DISCIPLINE_COORDINATOR receives Deliverable/WP mutation except approve/deliver and Phase management; Contributor/Viewer/External receive none.
- UI routes are planned only (`/projects`, `…/overview`, `…/structure`, `…/deliverables`). Planner is M4.
- Migrations are forward-only and additive. Historical Discipline identifier strings are preserved (no destructive rename/remove).

## Alternatives
- Reuse Task as WorkPackage or Document as Deliverable — rejected (Issue ≠ Task; Deliverable ≠ Document; WorkPackage ≠ Task).
- Optional Phase/Discipline on Deliverable (Pack M3.4 sketch) — rejected for M3 by the M3.1 binding (required FKs).
- Invent `phase.read` / `deliverable.read` — rejected; authorized reads use `project.read`.
- `gate.override` or silent delivery despite CANCELLED WPs — rejected (ADR-007; M3.1 delivery rule).
- Persist Team as Project access — rejected (TeamMembership ≠ ProjectMembership).
- Implement schema/UI in this WI — rejected (M3.1 is contract/test-data readiness).

## Consequences
Reviewers can check state tables in `@amber/shared` without inferring M4 schedule rules or M7 Gate UX. Later slices apply the migration plan and generate OpenAPI from Nest decorators (ADR-004). Seed backfill already adds missing template permissions to org-owned RoleDefinitions.

## Implementation Implications
- Docs: `docs/domain/m3-project-operations-contract.md` plus this ADR.
- Code: `packages/shared/src/operations.ts` and additive rows in `permissions.ts` / `role-templates.ts`.
- Prisma models and Nest modules are **not** created in M3.1.
- CI: permission uniqueness, no `gate.override`, transition tables, route collision, seed completeness, contract consistency.

## Supersedes
Amends ADR-005 only by **authorized additive catalog codes** for Operations. Does not restore `gate.override`. Does not reopen READY ≠ RELEASED or Formal Exception as sole Gate bypass (ADR-007 / ADR-017).
