# Testing

| Suite | Command | Notes |
| --- | --- | --- |
| Unit | `pnpm test:unit` | Domain/policy helpers + web shell (nav, errors, context) |
| Security stubs | `pnpm test:security` | Fail closed if files missing or skipped |
| Integration | `pnpm test:integration` | Testcontainers Postgres, or `TEST_DATABASE_URL` (includes M3.2 shell + M3.3 Phase/Discipline) |
| Web E2E (mock API) | `pnpm --filter @amber/web test:e2e` | Playwright UI against `mock-api.mjs` (not Local RC evidence) |
| **Web E2E Local RC** | `pnpm local-rc:e2e` | Playwright golden + negatives against **real** local API+Postgres |
| OpenAPI | `pnpm openapi:generate && pnpm openapi:validate` | 3.1 + no override tokens |
| Migrations | `pnpm prisma:validate` | Versioned SQL + audit grants |

Integration prefers Testcontainers (`@testcontainers/postgresql`). When Docker is unavailable (some agent VMs), set:

```bash
TEST_DATABASE_URL=postgresql://amber:amber@127.0.0.1:5432/amber_test
```

and migrate that database first.

Do not skip isolation / SoD / session / audit / malware / CAS / MFA / member-management / ProjectMembership / contextual RBAC / external isolation / Document-Revision / Coordination / Planning / Governance tests. The security-gate test fails CI if they are skipped.

### F-04 tenant-isolation evidence

| Test | Where |
| --- | --- |
| Session-bound org is the only authority | `packages/shared/src/tenancy.security.test.ts` |
| Forged client/path orgId denied | `api/test/security/tenant-isolation.security.test.ts` |
| Org A cannot read Org B by path | `api/test/integration/f04-tenant-isolation.integration.test.ts` |
| Forged org-switch denied | same |
| Unauthenticated deny-by-default | same |
| Suspended member old session is `401 SESSION_REVOKED` on protected ops | same |
| EXTERNAL cannot read org directory | same |
| Removed member old session is `401 SESSION_REVOKED`; relogin cannot read org | same |
| Org B cannot manage Org A members | same |

### PF-1.2 ProjectMembership / contextual RBAC evidence

| Test | Where |
| --- | --- |
| Org-scoped binding is not implicit project access | `packages/shared/src/authz.test.ts` |
| Union only inside the selected Project | same |
| Global templates are not operational grants | `packages/shared/src/tenancy.security.test.ts` |
| Forged path/body projectId denied | `api/test/security/tenant-isolation.security.test.ts` |
| Coordinator cannot self-escalate / invite / edit roles | `api/test/security/project-membership.security.test.ts` + integration |
| EXTERNAL isolation (directory / list / other projects) | `api/test/security/external-isolation.security.test.ts` + integration |
| HTTP ProjectMembership lifecycle + org override | `api/test/integration/project-membership.integration.test.ts` |

### PF-1.3 Document / Revision evidence

| Test | Where |
| --- | --- |
| Lifecycle + immutability + naming | `packages/shared/src/revision.test.ts` + integration |
| Publisher SoD / file-trust / CAS | `packages/shared/src/document-revision.security.test.ts` |
| Tenant-bound object keys | `packages/shared/src/storage-keys.test.ts` |
| HTTP publish/approve/make-current/rollback/isolation | `api/test/integration/documents-revisions.integration.test.ts` |

### PF-1.4 Coordination / Impact evidence

| Test | Where |
| --- | --- |
| Impact / Issue state machines | `packages/shared/src/impact.test.ts`, `issue.test.ts` |
| At-most-one change key + no auto-IMPACTED | `packages/shared/src/coordination.security.test.ts` |
| HTTP auto-create / assess / resolve / Issue lifecycle / isolation | `api/test/integration/coordination-impact.integration.test.ts` |

### PF-1.5 Planning / Tasks / Milestones evidence

| Test | Where |
| --- | --- |
| Task / Milestone state machines + lateness + cycle | `packages/shared/src/planning.test.ts` |
| Catalog / no OVERDUE / derived AT_RISK | `packages/shared/src/planning.security.test.ts` |
| HTTP lifecycle / deps / isolation / no auto-resolve | `api/test/integration/planning-tasks-milestones.integration.test.ts` |

### PF-1.6 Governance / Gates / Formal Exceptions evidence (Tests A–I)

| Test | Where |
| --- | --- |
| A Evaluation of seven types | `packages/shared/src/governance.test.ts`, `api/test/integration/governance-gates-exceptions.integration.test.ts` |
| B READY ≠ RELEASED | same |
| C SoD (requester ≠ approve / release) | same + `packages/shared/src/sod.security.test.ts` |
| D RELEASED_WITH_EXCEPTION + UNSATISFIED visible | same |
| E revoke → BLOCKED; historical release immutable | same |
| F Isolation negatives | same |
| G MFA + recent-auth | same |
| H No upstream mutation | same |
| I No `gate.override` | `scripts/assert-no-gate-override.ts`, `packages/shared/src/governance.security.test.ts` |

### M3.1 Operations contract evidence

| Test | Where |
| --- | --- |
| Phase / Deliverable / WorkPackage transition tables, XOR, delivery rule | `packages/shared/src/operations.test.ts` |
| Permission uniqueness, no `gate.override`, role-template delta | `packages/shared/src/operations.security.test.ts`, `permissions.test.ts` |
| Route collision (UI vs foundation pages; API vs OpenAPI) | `packages/shared/src/m3-routes.test.ts` |
| Seed scenario completeness (2 orgs, roles, negatives, no PII) | `packages/shared/src/m3-seed-design.test.ts` |
| Artifact + REQ matrix + migration hygiene | `packages/shared/src/m3-contract.consistency.test.ts` |

### M3.3 Phase & Discipline evidence

| Test | Where |
| --- | --- |
| State machine, dates, unique sequence | `packages/shared/src/operations.test.ts` |
| Isolation, permission matrix, CAS, audit/outbox, seed | `api/test/integration/m33-phase-discipline.integration.test.ts` |
| Security floors | `api/test/security/operations-phase.security.test.ts` |
| Structure UI | `web/e2e/structure.spec.ts`, `web/lib/operations.test.ts` |

### M3.4 Deliverable evidence

| Test | Where |
| --- | --- |
| Isolation, permission matrix, CAS, delivery guard, seed | `api/test/integration/m34-deliverable.integration.test.ts` |
| Security floors | `api/test/security/operations-deliverable.security.test.ts` |
| Entregas UI | `web/e2e/deliverables.spec.ts` |

### M3.5 WorkPackage evidence

| Test | Where |
| --- | --- |
| Transitions, blockedReason, no-cascade | `packages/shared/src/operations.test.ts` |
| Isolation, permission, CAS, idempotency, delivery-guard, audit/outbox | `api/test/integration/m35-work-package.integration.test.ts` |
| Security floors | `api/test/security/operations-work-package.security.test.ts` |
| Pacotes UI + Entregas inspector | `web/e2e/work-packages.spec.ts`, `web/e2e/deliverables.spec.ts` |

### M3.6 Hub / M3.7 traceability

| Test | Where |
| --- | --- |
| Hub read model | `api/test/integration/m36-project-hub.integration.test.ts`, `web/e2e/overview.spec.ts` |
| Cross-domain context | `api/test/integration/m37-traceability.integration.test.ts`, inspectors in Entregas/Pacotes E2E |

### M3.8 Local RC (real persistence)

| Test | Where |
| --- | --- |
| Happy path (sign-in → org → project → Phase → Deliverable → WP → Hub → context → logout) | `web/e2e/local-rc/golden-path.spec.ts` |
| Negatives matrix | `web/e2e/local-rc/negatives.spec.ts` |
| Viewport / a11y evidence | `docs/development/m3.8-evidence/` |
| REQ map | `docs/domain/m3.8-requirements-traceability.md` |
| Bootstrap | `docs/development/m3.8-local-rc-runbook.md` |

