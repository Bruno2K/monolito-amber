# ADR index

Material decisions encoded for PF-1.0 and PF-1.1. Format: Status / Context / Decision / Alternatives / Consequences / Implementation Implications / Supersedes.

Candidates from 0.6–0.8 that are **not** yet product slices (Planning/Governance tables, Impact handler) stay documented here as accepted architecture, not as implemented workflows.

| ID | Title |
| --- | --- |
| [ADR-001](./ADR-001-modular-monolith.md) | Modular Monolith |
| [ADR-002](./ADR-002-postgres-prisma-schemas.md) | PostgreSQL + Prisma, schema-per-module |
| [ADR-003](./ADR-003-stack.md) | NestJS + Next.js + TypeScript |
| [ADR-004](./ADR-004-rest-openapi.md) | REST `/api/v1` + OpenAPI 3.1 |
| [ADR-005](./ADR-005-closed-catalog-rbac.md) | Contextual RBAC from 0.2A closed catalog |
| [ADR-006](./ADR-006-session-bound-org.md) | Session-bound active Organization |
| [ADR-007](./ADR-007-formal-exception-sole-bypass.md) | Formal Exception sole Gate bypass |
| [ADR-008](./ADR-008-audit-insert-only.md) | Audit insert-only + `organization.read_audit` |
| [ADR-009](./ADR-009-scan-status-fail-closed.md) | `scan_status` fail-closed (vendor OPEN) |
| [ADR-010](./ADR-010-outbox-idempotency.md) | Transactional outbox + Idempotency-Key + optimistic version |
| [ADR-011](./ADR-011-authentication-identity.md) | Authentication Identity separate from User |
| [ADR-012](./ADR-012-mfa-totp.md) | MFA TOTP foundation + freshness hooks |
| [ADR-013](./ADR-013-org-owned-roles-project-membership.md) | Org-owned RoleDefinitions + ProjectMembership |
| [ADR-014](./ADR-014-revision-immutability-explicit-current.md) | Revision immutability & explicit current revision |
