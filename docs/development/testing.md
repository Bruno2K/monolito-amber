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

Do not skip isolation / SoD / session / audit / malware / CAS / MFA / member-management tests. The security-gate test fails CI if they are skipped.

### F-04 tenant-isolation evidence

| Test | Where |
| --- | --- |
| Session-bound org is the only authority | `packages/shared/src/tenancy.security.test.ts` |
| Forged client/path orgId denied | `api/test/security/tenant-isolation.security.test.ts` |
| Org A cannot read Org B by path | `api/test/integration/f04-tenant-isolation.integration.test.ts` |
| Forged org-switch denied | same |
| Unauthenticated deny-by-default | same |
| Suspended member cannot switch back | same |
| EXTERNAL cannot read org directory | same |
| Removed member cannot read org | same |
| Org B cannot manage Org A members | same |
