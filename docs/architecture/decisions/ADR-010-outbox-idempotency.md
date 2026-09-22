# ADR-010 — Outbox, Idempotency-Key, optimistic version

## Status
Accepted (F-11 design; feature evidence later)

## Context
Make-current, gate release, and Formal Exception decide are contended writes. Dual-write to a queue loses events on crash.

## Decision
- Integer `version` + compare-and-swap helper on contended aggregates.
- `Idempotency-Key` table (`jobs.idempotency_records`) for replay-safe POSTs.
- `jobs.outbox_messages` written in the same transaction as the domain write.
- Job handlers take an idempotency key; exhaustion goes to `jobs.dead_letters`.

`CurrentRevisionChanged` will auto-create an Impact Analysis case (`PENDING_ANALYSIS`) only — not IMPACTED rows, not Issues. Handler belongs to the Coordination slice.

## Alternatives
- Last-write-wins — rejected.
- Dual-write Redis without outbox — rejected.
- Event sourcing / CQRS — rejected.

## Consequences
Foundation ships tables + helpers, not product flows.

## Implementation Implications
Required operations (later): publish, make-current, gate release, exception approve.

## Supersedes
None
