# Testing

| Suite | Command | Notes |
| --- | --- | --- |
| Unit | `pnpm test:unit` | Domain/policy helpers |
| Security stubs | `pnpm test:security` | Fail closed if files missing or skipped |
| Integration | `pnpm test:integration` | Testcontainers Postgres, or `TEST_DATABASE_URL` |
| OpenAPI | `pnpm openapi:generate && pnpm openapi:validate` | 3.1 + no override tokens |
| Migrations | `pnpm prisma:validate` | Versioned SQL + audit grants |

Integration prefers Testcontainers (`@testcontainers/postgresql`). When Docker is unavailable (some agent VMs), set:

```bash
TEST_DATABASE_URL=postgresql://amber:amber@127.0.0.1:5432/amber_test
```

and migrate that database first.

Do not skip isolation / SoD / session / audit / malware / CAS / MFA / member-management / ProjectMembership / contextual RBAC / external isolation / Document-Revision / Coordination / Planning tests. The security-gate test fails CI if they are skipped.

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
