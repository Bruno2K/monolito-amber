# State machines

Encoded for implementers. Coordination/Planning/Gate machines are **not** wired as APIs in PF-1.3.

## Organization membership
`INVITED → ACTIVE → SUSPENDED | REMOVED`  
`REMOVED → INVITED` on re-invitation (same row; soft history).

## Project membership
`ACTIVE → SUSPENDED | REMOVED`  
`SUSPENDED → ACTIVE | REMOVED`  
`REMOVED → ACTIVE` when the same historical member is re-added. ACTIVE OrgMembership is required for ACTIVE ProjectMembership.

## Document
`ACTIVE | ARCHIVED` — archive is soft; no hard-delete in product flows.

## Revision (0.3 / PF-1.3)
`DRAFT → PUBLISHED → UNDER_REVIEW → APPROVED | REJECTED`

- DRAFT is mutable. Immutability of published bytes/checksum starts at PUBLISHED.
- REJECTED is preserved.
- Currentness is **not** a status. It is `Document.currentRevisionId`.
- There is no terminal `SUPERSEDED` status. An APPROVED Revision that is no longer current stays APPROVED and may be made current again (rollback).
- Publish ≠ approve ≠ make-current.

## Impact (0.4 + Final Reconciliation)
`PENDING_ANALYSIS → IMPACTED | NOT_IMPACTED → RESOLVED`  
Auto-created as PENDING_ANALYSIS on `CurrentRevisionChanged`. **Not implemented in PF-1.3** — outbox event only.

## Issue
`OPEN → IN_ANALYSIS → IN_PROGRESS → READY_FOR_REVIEW → RESOLVED → CLOSED`  
Sides: REJECTED, CANCELLED, REOPENED.

## Task (0.5)
`TODO → IN_PROGRESS → BLOCKED | DONE` (CANCELLED side). BLOCKED requires `blocked_reason`.

## Milestone (0.5)
`PLANNED | AT_RISK | ACHIEVED | MISSED | CANCELLED` — AT_RISK preferably derived.

## Gate (0.5)
`NOT_READY | BLOCKED | READY | RELEASED | RELEASED_WITH_EXCEPTION`  
READY ≠ RELEASED. RELEASED_WITH_EXCEPTION ≠ RELEASED.

## Formal Exception (0.5)
`REQUESTED → APPROVED | REJECTED`; `APPROVED → REVOKED`.
