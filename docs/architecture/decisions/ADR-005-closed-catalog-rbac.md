# ADR-005 — Contextual RBAC from the 0.2A closed catalog

## Status
Accepted (F-01 CLOSED_AT_SPECIFICATION_LEVEL)

## Context
Organizations compose roles; they cannot invent permission semantics. 0.2 listed an illustrative `gate.override` that Final Reconciliation removed.

## Decision
Seed **only** the closed 0.2A permission catalog and the nine default Role templates. AuthZ is deny-by-default. SoD is enforced at action/resource level (revision, Formal Exception, role-management).

## Alternatives
- Invent permissions at bootstrap — forbidden.
- Keep `gate.override` from stale 0.2 examples — forbidden (F-02 / 0.5).

## Consequences
CI asserts the catalog and OpenAPI contain no `gate.override`. Role template permission sets are derived from 0.2A §2 semantics, not new codes.

## Implementation Implications
`packages/shared` is the source of truth; Prisma seed upserts Amber Role Templates from that module. PF-1.2 instantiates Organization-owned RoleDefinitions from those templates; templates themselves are not operational grants. See ADR-013.

## Supersedes
Stale 0.2 illustrative `gate.override` string
