# State machines

Encoded for implementers. Product Document/Coordination/Planning/Gate machines are **not** wired as APIs in PF-1.2.

## Organization membership
`INVITED → ACTIVE → SUSPENDED | REMOVED`  
`REMOVED → INVITED` on re-invitation (same row; soft history).

## Project membership
`ACTIVE → SUSPENDED | REMOVED`  
`SUSPENDED → ACTIVE | REMOVED`  
`REMOVED → ACTIVE` when the same historical member is re-added. ACTIVE OrgMembership is required for ACTIVE ProjectMembership.

## Document
`ACTIVE | ARCHIVED`

## Revision (0.3)
`DRAFT → PUBLISHED → UNDER_REVIEW → APPROVED | REJECTED`  
APPROVED may become SUPERSEDED when another becomes current.

## Impact (0.4 + Final Reconciliation)
`PENDING_ANALYSIS → IMPACTED | NOT_IMPACTED → RESOLVED`  
Auto-created as PENDING_ANALYSIS on `CurrentRevisionChanged`. No auto Issues.

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
