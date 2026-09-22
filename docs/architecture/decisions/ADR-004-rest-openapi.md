# ADR-004 — REST `/api/v1` + OpenAPI 3.1

## Status
Accepted

## Context
Public partner GraphQL/gRPC is out of MVP. Nest decorators are the contract source.

## Decision
URI prefix `/api/v1`. OpenAPI 3.1 generated from NestJS decorators; CI validates the artifact and forbids `gate.override` / `forceRelease`. Errors use RFC 7807 Problem Details with `correlationId`.

## Alternatives
- GraphQL MVP — rejected: extra surface.
- Trust path `:orgId` as AuthZ — rejected: F-04.
- OpenAPI 3.0 only — rejected: 0.7 requires 3.1.

## Consequences
Identity/session routes live under `/api/v1/auth/...`. Path org/project ids are routing hints.

## Implementation Implications
`pnpm openapi:generate` and `pnpm openapi:validate` are harness/CI commands.

## Supersedes
None
