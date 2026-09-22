# Identity and authorization

Source: APPROVED [0.2](https://app.notion.com/p/3e2678e54c8d81a4b99bca837516b5b8) / [0.2A](https://app.notion.com/p/3e3678e54c8d819fa690f4ade50c4e10). Implemented in PF-1.1; reconciled in PF-1.1R; project context in PF-1.2.

## Identities

- `User` is the global business identity.
- `AuthenticationIdentity` owns provider-specific data. MVP provider: `EMAIL_PASSWORD`. Reserved: `ENTRA`, `GOOGLE`, `SSO_ONLY`.
- Organization Membership never stores credentials.

## AuthN floors

- Argon2id required; bcrypt only if Argon2id is unavailable.
- Password min 12, max ≥128; no composition theater.
- Rate limit + progressive backoff; lock after 10 failures / 15 minutes.
- Invite tokens hashed, single-use, 7 days. Org-admin only. Re-invite invalidates the previous token.
- Reset tokens hashed, 30 minutes; success revokes all sessions.
- Opaque HttpOnly Secure SameSite sessions; hash stored; 12h inactive / 7d absolute.
- MFA TOTP required for Organization Administrator and Governance Approver.
- Privileged permissions from those roles **fail closed** until MFA is enrolled (restricted session: enroll / challenge / logout remain available).
- Recovery codes hashed; regenerate only after re-authentication.
- High-risk re-auth (`Session.lastReauthAt`, 15 minutes) for Formal Exception approve and org security/role changes.
- Login rate limit is **process-local / in-memory**. Correct for a single API instance. Horizontal (multi-instance) API scaling needs shared limiter state; do not add Redis solely for this constraint.
- `POST /api/v1/auth/register` is **first-instance bootstrap only** (zero Users). It is not public product self-signup. Later Users are created by accepting an organization invitation.

## AuthZ

Closed catalog only. Amber Role Templates are product-owned baselines (`organizationId = null`). They are **not** operational grants.

On Organization create, Amber instantiates Organization-owned `RoleDefinition` rows (permission mappings + `sourceTemplateKey` / `templateKey` lineage). Project role assignment references those org-owned rows only.

Resource-level SoD:

1. Publisher cannot approve/reject or make-current that Revision.
2. Exception requester cannot approve/reject or release via that Exception.
3. `project.assign_roles` cannot self-grant outside existing project authority (including Org Admin acting through that permission).

Org-scoped permissions (organization.*, `project.create`, `project.archive`) come from org-level RoleBindings. Project-scoped permissions require ACTIVE ProjectMembership + ProjectRoleAssignment in that Project. Org-level binding never implies every Project.

Authorization context: User + Session + active Org + ACTIVE OrgMembership + (when project-scoped) Project in that Org + ACTIVE ProjectMembership + assigned roles + permission + ownership + SoD. Deny by default.

PF-1.1 / PF-1.1R shipped SoD primitives without creating fake Gate/Exception entities. PF-1.3 enforces Revision publisher SoD on approve/reject/make-current.

## Audit read

Listing/read requires `organization.read_audit` + tenant/project scope.
