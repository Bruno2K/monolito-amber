# ADR-009 — scan_status fail-closed (vendor OPEN)

## Status
Accepted (F-08 trust policy CLOSED; vendor implementation choice)

## Context
Binaries live in private S3-compatible storage (MinIO locally) with provider-managed SSE. Metadata and checksum land in PostgreSQL after complete-upload.

## Decision
Every stored object has `scan_status`: `PENDING` | `CLEAN` | `BLOCKED`.

- PENDING / scan failure → fail closed (no download/preview)
- CLEAN → eligible for authorized access
- BLOCKED → deny + security event
- Scanner unavailable for new uploads → fail closed; async retry; alert after exhaustion

Vendor is **not** chosen in PF-1.0.

## Alternatives
- Fail-open while PENDING — rejected.
- Skip the hook until a vendor is picked — rejected.

## Consequences
PF-1.0 implements the enum, policy helpers, and fail-closed tests. Document upload workflow is a later slice.

## Implementation Implications
Comments and this ADR must stay in the repo so later slices cannot silently drop the policy.

## Supersedes
None
