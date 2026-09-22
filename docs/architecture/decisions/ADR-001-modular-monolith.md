# ADR-001 — Modular Monolith

## Status
Accepted

## Context
Amber needs strong transactions on the golden path (revision current, role assignment, later gate release / Formal Exception). A services split would break those transactions without evidence of scale.

## Decision
Ship a Modular Monolith: one API deployable with in-process module boundaries, plus `web` and `worker` processes in the same monorepo.

## Alternatives
- Microservices per module — rejected: premature; breaks strong TX (0.1 / 0.8).
- Kubernetes from day one — rejected: ops cost; no evidence.
- Worker inside the API process in production — rejected: multi-instance unsafe for jobs.

## Consequences
Module owners stay explicit. Cross-module table joins are forbidden in feature code.

## Implementation Implications
Layout is `web/` `api/` `worker/` `packages/shared/` `prisma/` `docs/`. PF-1.0 implements the skeleton only.

## Supersedes
None
