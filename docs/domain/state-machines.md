# State machines

Encoded for implementers. Gate machines are **not** wired as APIs in PF-1.5.

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
Auto-created as PENDING_ANALYSIS on `CurrentRevisionChanged` / `NewBaseEstablished` (exactly one case per change event). Assessment is explicit. Resolve is denied while linked Issues are open/active (including RESOLVED).

## Issue
`OPEN → IN_ANALYSIS → IN_PROGRESS → READY_FOR_REVIEW → RESOLVED → CLOSED`  
Sides: REJECTED, CANCELLED, REOPENED.  
`RESOLVED` ≠ `CLOSED`. Origin is IMPACT | MANUAL (server-derived).

## Task (0.5 / PF-1.5)
`TODO → IN_PROGRESS → BLOCKED | DONE` (CANCELLED side). BLOCKED requires `blockedReason`. Lateness is derived — there is no OVERDUE status. IN_PROGRESS is denied while a finish-to-start prerequisite is not DONE.

## Milestone (0.5 / PF-1.5)
Stored: `PLANNED | ACHIEVED | CANCELLED`. Derived on read: `AT_RISK` (late linked Task) or `MISSED` (past `targetDate` while still PLANNED). ACHIEVED is explicit. See ADR-016.

## Gate (0.5)
`NOT_READY | BLOCKED | READY | RELEASED | RELEASED_WITH_EXCEPTION`  
READY ≠ RELEASED. RELEASED_WITH_EXCEPTION ≠ RELEASED.

## Formal Exception (0.5)
`REQUESTED → APPROVED | REJECTED`; `APPROVED → REVOKED`.
