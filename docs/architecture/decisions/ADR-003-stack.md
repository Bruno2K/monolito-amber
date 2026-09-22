# ADR-003 — NestJS + Next.js + TypeScript

## Status
Accepted

## Context
Architecture Baseline §12 names the stack. PF-1.0 must not invent a different runtime.

## Decision
TypeScript throughout. NestJS for `api`. Next.js for `web`. BullMQ worker scaffold (Redis only when jobs enabled). pnpm workspaces.

## Alternatives
- Fastify-only API — Nest may use Fastify later as an adapter; Express is the bootstrap adapter.
- npm/yarn — pnpm chosen at bootstrap (allowed; not a product decision).
- nx/turborepo — not required for this slice.

## Consequences
Shared types live in `packages/shared`. HTTP servers bind `0.0.0.0:$PORT`.

## Implementation Implications
CI typechecks every workspace package. Local filesystem is ephemeral on PaaS — no durable local writes.

## Supersedes
None
