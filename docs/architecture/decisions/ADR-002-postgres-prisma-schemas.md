# ADR-002 — PostgreSQL + Prisma, schema-per-module

## Status
Accepted

## Context
The system of record must support multi-tenant rows, strong transactions, and versioned migrations. Separate databases per module were considered and rejected.

## Decision
One PostgreSQL database. Prefer PostgreSQL schemas as module namespaces (`identity`, `org`, `project`, `document`, `audit`, `jobs`, …). Prisma Migrate + Prisma Client is the MVP ORM. UUIDs for public identifiers.

## Alternatives
- DB-per-module — rejected: distributed data plane without need.
- TypeORM / Drizzle / Knex-only as baseline — rejected: Prisma chosen for NestJS fit; revisit via ADR if migrations become a bottleneck.
- Table prefixes instead of schemas — acceptable fallback if tooling hurts; schemas preferred.

## Consequences
Staging always migrates before production. Expand → migrate → contract for breaking changes. No manual production DDL.

## Implementation Implications
`prisma/` holds schema + versioned migrations. RLS is future hardening, not MVP enforcement.

## Supersedes
None
