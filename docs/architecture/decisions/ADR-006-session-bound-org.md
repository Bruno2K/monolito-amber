# ADR-006 — Session-bound active Organization

## Status
Accepted (F-04 implemented in PF-1.1)

## Context
User identity is global; Organization is the tenant. Client-supplied `organizationId` / `projectId` must never establish authority.

## Decision
The authenticated session carries `activeOrganizationId` set at login or via `POST /api/v1/auth/active-organization` after ACTIVE membership revalidation. Path org mismatch → 403. Deny-by-default if binding is missing. EXTERNAL membership never implies org-wide directory, project list, or audit.

## Alternatives
- Trust path/body orgId — rejected: F-04.
- PostgreSQL RLS as MVP enforcement — deferred (candidate ADR-006-11).

## Consequences
Org-switch is an explicit, audited server action. Subsequent requests use the new binding only.

## Implementation Implications
PF-1.1 binds `amber_session` (HttpOnly, Secure outside local, SameSite=Lax), re-validates ACTIVE membership on switch, audits `ORG_SWITCHED`, and ships HTTP F-04 negatives.

## Supersedes
None
