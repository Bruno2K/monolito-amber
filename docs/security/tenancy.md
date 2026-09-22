# Tenancy

- Organization is the tenant. User is a global identity.
- Org membership ≠ project membership.
- Active Organization is **session-bound**.
- `POST /api/v1/auth/active-organization` re-validates ACTIVE membership, updates the session, audits the switch.
- Path `:organizationId` / `:projectId` and body/query ids are routing hints. Mismatch → 403.
- Deny-by-default when binding is missing.
- Organization membership states: `INVITED`, `ACTIVE`, `SUSPENDED`, `REMOVED` (soft history).
- Project membership states: `ACTIVE`, `SUSPENDED`, `REMOVED` (soft history). ACTIVE OrgMembership is required before ACTIVE ProjectMembership.
- Non-ACTIVE ProjectMembership loses project access immediately. Org suspension/removal overrides all Project access.
- EXTERNAL users: explicit org+project membership + assigned roles only; no org-wide directory, project list, audit, other tenants, or unrelated projects.
- Every tenant-owned table has `organization_id` (audit events may omit it for pre-org security events).
