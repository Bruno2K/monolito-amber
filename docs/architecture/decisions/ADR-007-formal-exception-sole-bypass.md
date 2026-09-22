# ADR-007 — Formal Exception is the sole Gate bypass

## Status
Accepted (F-02 RESOLVED_BY_0.5)

## Context
Gates evaluate mandatory requirements. READY does not auto-RELEASE. Approving an exception does not mark the requirement satisfied. `RELEASED_WITH_EXCEPTION` ≠ `RELEASED`.

## Decision
The only advance-despite-blocker path is a Formal Exception scoped to a specific GateRequirement, then explicit release. No `gate.override` permission, `forceRelease` flag, override boolean, or silent bypass.

## Alternatives
- `override=true` / `forceRelease` on Gate release — rejected.
- Exception approve flips `satisfied` — rejected (0.5 invariant).

## Consequences
OpenAPI and seed must not document override operations. Governance feature UI is out of PF-1.0.

## Implementation Implications
CI greps seed, schema, and OpenAPI for forbidden tokens.

## Supersedes
Stale `gate.override` examples in 0.2
