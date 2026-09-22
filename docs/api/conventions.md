# API conventions

- Prefix: `/api/v1`
- Contract: OpenAPI 3.1 at `api/openapi/openapi.json`
- Errors: `application/problem+json` with `type`, `title`, `status`, `detail`, `instance`, `correlationId`, `code`
- Correlation: accept `X-Correlation-Id` or generate a UUID
- Pagination (later): cursor for large lists; allowlisted sort/filter
- Idempotency-Key required later for publish, make-current, gate release, exception approve
- AuthZ uses the closed 0.2A catalog
- Download/preview denied unless `scan_status=CLEAN`

Foundation routes:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/health` | Liveness |
| GET | `/api/v1/auth/session` | Session-bound org |
| POST | `/api/v1/auth/active-organization` | Org-switch stub |
| GET | `/api/v1/catalog/permissions` | Closed catalog |
| GET | `/api/v1/catalog/role-templates` | Default templates |
| GET | `/api/v1/files/:objectId/access` | Fail-closed file-trust check |
