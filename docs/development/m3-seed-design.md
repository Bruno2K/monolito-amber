# M3.1 test-data / seed design

Deterministic, synthetic, **no real PII**. Idempotent or resettable on a disposable database. Writer for Phase/Discipline/Team/memberships/Deliverable/WorkPackage is `prisma/m3-seed.ts` (opt-in `AMBER_SEED_M3=1`). WorkPackage CRUD APIs are implemented in M3.5. M4.8 adds Planning fixtures via `prisma/m4-seed.ts` on the same flag — see [m4-seed-design.md](./m4-seed-design.md).

## Inventory

| Class | Count / coverage |
| --- | --- |
| Organizations | 2 — `amber-demo-alpha`, `amber-demo-beta` |
| Projects | 2 in Org A (`Alpha Tower`, `Alpha Plant`) + 1 in Org B (`Beta Campus`) |
| Users | coordinator A/B, discipline coordinator A, contributor A, viewer A, external A, suspended A, removed A, unauthorized (no membership), team-only A (TeamMembership without ProjectMembership) |
| Org membership | ACTIVE / SUSPENDED / REMOVED; INTERNAL + EXTERNAL |
| Project membership | ACTIVE / SUSPENDED / REMOVED on Project A1; coordinator on A2; coordinator B on B1 |
| Teams | Alpha Structure Team (Org A), Beta MEP Team (Org B); team-only user on Alpha Structure Team with **no** ProjectMembership |
| Disciplines | ≥3 in Org A (`ARCH`/`architecture`, `STR`/`structure`, `MEP`/`mep`) + ARCH in Org B. Historical identifier strings preserved as codes |
| Phases | PLANNED, ACTIVE, COMPLETED on A1; ACTIVE on A2; PLANNED on B1 |
| Deliverables | PLANNED + user owner; IN_PROGRESS + Team owner; IN_REVIEW + no owner; APPROVED + user owner; Org B PLANNED (cross-tenant) |
| WorkPackages | PLANNED, ACTIVE, BLOCKED (with reason), DONE, CANCELLED |

Emails use `@amber.test` only (`coordinator.a@amber.test`, …). Display names are prefixed `Seed`.

## Reset

- Local: `pnpm prisma migrate reset` then `pnpm prisma:seed` (catalog) and `AMBER_SEED_M3=1 pnpm prisma:seed` (this dataset). Default catalog seed stays user-empty so integration tests can bootstrap the first User.
- Keys are stable slugs (`org-a`, `project-a1`, `del-a1-planned-user`) so re-runs upsert.
- Cloud/shared staging seed is **not** authorized in M3.1 (LOCAL ONLY).

## Negative scenarios (must remain in the pack)

1. Org A coordinator cannot read Org B Project / Deliverable / WorkPackage by path or body id.
2. Org B coordinator cannot read Org A ids.
3. Unauthorized user: omit-not-leak on every Operations list (no existence counts).
4. SUSPENDED and REMOVED ProjectMembership: immediate revoke (existing session 401 / empty lists).
5. Viewer cannot mutate Phase / Deliverable / WorkPackage.
6. External collaborator cannot see Org directory or Org A’s second Project.
7. Team owner on a Deliverable does not grant Team members Project access.
8. Linked CANCELLED WorkPackage blocks `deliverable.deliver` until disassociate.
9. User owner whose ProjectMembership is not ACTIVE is rejected.
10. Contributor cannot call `deliverable.approve` / `deliverable.deliver` / `phase.complete`.

## Completeness tests

`packages/shared/src/m3-seed-design.test.ts` fails CI if Organizations/Projects/roles/membership states/Disciplines/Phase-Deliverable-WP representatives/cross-tenant negatives/PII policy regress.
