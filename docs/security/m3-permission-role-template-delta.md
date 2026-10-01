# M3.1 permission and role-template delta

Additive closed-catalog extension authorized by Notion M3.1 / ADR-018. **Never** `gate.override`.

## New permission codes

All project-scoped except Discipline catalog writes (existing org-scoped `organization.manage_catalogs`).

| Code | Module | Action |
| --- | --- | --- |
| `phase.create` | operations | Create Phase |
| `phase.update` | operations | Fields, PLANNED→ACTIVE, CANCELLED |
| `phase.complete` | operations | ACTIVE→COMPLETED |
| `deliverable.create` | operations | Create Deliverable |
| `deliverable.update` | operations | Fields, linear transitions except approve/deliver |
| `deliverable.assign` | operations | Ownership XOR |
| `deliverable.approve` | operations | IN_REVIEW→APPROVED |
| `deliverable.deliver` | operations | APPROVED→DELIVERED (delivery rule) |
| `work_package.create` | operations | Create WorkPackage |
| `work_package.update` | operations | Fields, activate, BLOCKED, CANCELLED |
| `work_package.complete` | operations | ACTIVE→DONE |

Reads: `project.read` on an authorized Project. **Not invented:** `phase.read`, `deliverable.read`, `work_package.read`, `discipline.*`, `gate.override`.

## Role templates (keys unchanged; grants additive)

| Key | Delta |
| --- | --- |
| PROJECT_COORDINATOR | + all eleven Operations codes (management) |
| DISCIPLINE_COORDINATOR | + `deliverable.create\|update\|assign`, `work_package.create\|update\|complete` |
| CONTRIBUTOR_DESIGNER | none |
| VIEWER | none |
| EXTERNAL_CONTRIBUTOR | none |
| REVIEWER_REVISION_APPROVER | none |
| GOVERNANCE_APPROVER | none |
| AUDITOR | none |
| ORGANIZATION_ADMINISTRATOR | none of the new project-scoped codes; Discipline catalog already covered by `organization.manage_catalogs` |

Still nine templates. Seed upserts catalog rows and **additively** inserts missing `role_permissions` on Organization-owned copies (`prisma/seed.ts`). Templates remain non-operational grants (ADR-013).

## Scope of Discipline Coordinator

Mutations apply only inside the authorized Project (ACTIVE ProjectMembership + assignment) and, when a Deliverable/WP has `disciplineId`, within that catalog row’s Organization. This WI does not invent a second “discipline assignment” permission; Project role assignment remains the grant vehicle.

## MFA / high-risk

No new MFA-required template keys. Operations codes are **not** added to `HIGH_RISK_PERMISSIONS` (those stay Formal Exception / `gate.release` / org security). Do not invent SoD that copies revision publisher rules onto Deliverable unless a later contract says so. Delivery rule is data-completeness, not Gate bypass.

## Evidence

- `packages/shared/src/permissions.ts`
- `packages/shared/src/role-templates.ts`
- `packages/shared/src/operations.security.test.ts`
- `packages/shared/src/permissions.test.ts`
- `pnpm assert:no-gate-override`
