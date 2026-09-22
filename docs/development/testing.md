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

Do not skip isolation / SoD / session / audit / malware / CAS tests. The security-gate test fails CI if they are skipped.
