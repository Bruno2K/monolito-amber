# Tenancy

- Organization is the tenant. User is a global identity.
- Org membership ≠ project membership.
- Active Organization is **session-bound**.
- `POST /api/v1/auth/active-organization` re-validates ACTIVE membership, updates the session, audits the switch.
- Path `:organizationId` / `:projectId` and body ids are routing hints. Mismatch → 403.
- Deny-by-default when binding is missing.
- Membership states: `INVITED`, `ACTIVE`, `SUSPENDED`, `REMOVED` (soft history).
- EXTERNAL users: explicit org+project membership only; no org-wide directory, project list, or audit.
- Every tenant-owned table has `organization_id` (audit events may omit it for pre-org security events).
