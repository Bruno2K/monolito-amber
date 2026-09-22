# API conventions

- Prefix: `/api/v1`
- Contract: OpenAPI 3.1 at `api/openapi/openapi.json`
- Errors: `application/problem+json` with `type`, `title`, `status`, `detail`, `instance`, `correlationId`, `code`
- Correlation: accept `X-Correlation-Id` or generate a UUID
- Pagination (later): cursor for large lists; allowlisted sort/filter
- Idempotency-Key required for publish, approve, reject, make-current (later: gate release, exception approve)
- AuthZ uses the closed 0.2A catalog
- Download/preview denied unless `scan_status=CLEAN`
- Browser sessions: `amber_session` HttpOnly cookie (opaque token; server stores hash)

Identity & Organizations routes:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/health` | Liveness |
| POST | `/api/v1/auth/register` | First-instance bootstrap only (zero users). Not public self-signup. |
| POST | `/api/v1/auth/login` | Login / MFA challenge |
| POST | `/api/v1/auth/logout` | Revoke current session |
| POST | `/api/v1/auth/logout-all` | Revoke all sessions |
| GET | `/api/v1/auth/session` | Session-bound org + permissions; optional `projectId` is routing intent |
| POST | `/api/v1/auth/active-organization` | Explicit org-switch |
| POST | `/api/v1/auth/password/forgot` | Request reset (no enumeration) |
| POST | `/api/v1/auth/password/reset` | Consume reset; revoke sessions |
| POST | `/api/v1/auth/mfa/enroll` | Start TOTP enrollment |
| POST | `/api/v1/auth/mfa/enroll/verify` | Verify TOTP; issue recovery codes |
| POST | `/api/v1/auth/mfa/challenge` | Complete MFA login |
| POST | `/api/v1/auth/mfa/recovery-codes` | Regenerate recovery codes |
| POST | `/api/v1/auth/reauthenticate` | High-risk freshness |
| POST | `/api/v1/organizations` | Create org + admin membership |
| GET | `/api/v1/organizations` | Caller's memberships |
| GET | `/api/v1/organizations/:organizationId` | Session-bound org |
| GET | `/api/v1/organizations/:organizationId/members` | Directory (not EXTERNAL) |
| POST | `/api/v1/organizations/:organizationId/invitations` | Invite (Org-admin) |
| POST | `/api/v1/organizations/:organizationId/invitations/:id/revoke` | Revoke invite |
| POST | `/api/v1/invitations/accept` | Accept invite |
| PATCH | `/api/v1/organizations/:organizationId/members/:id` | Suspend/remove/reactivate |
| POST | `/api/v1/organizations/:organizationId/members/:id/roles` | Assign org-owned RoleDefinition |
| GET | `/api/v1/organizations/:organizationId/roles` | List org-owned RoleDefinitions |
| PATCH | `/api/v1/organizations/:organizationId/roles/:roleId` | Configure org-owned role (closed catalog) |
| POST | `/api/v1/organizations/:organizationId/projects` | Create Project + actor coordinator membership |
| GET | `/api/v1/organizations/:organizationId/projects` | Org-wide project list (not EXTERNAL) |
| GET | `/api/v1/projects` | Caller's ACTIVE project memberships |
| GET | `/api/v1/projects/:projectId` | Project read after membership + role check |
| PATCH | `/api/v1/projects/:projectId` | Update project metadata |
| POST | `/api/v1/projects/:projectId/archive` | Archive (org-scoped) |
| GET | `/api/v1/projects/:projectId/members` | List ProjectMembership |
| POST | `/api/v1/projects/:projectId/members` | Add existing Org member |
| PATCH | `/api/v1/projects/:projectId/members/:id` | Suspend/remove/reactivate |
| POST | `/api/v1/projects/:projectId/members/:id/roles` | Assign org-owned role on Project |
| GET | `/api/v1/catalog/permissions` | Closed catalog |
| GET | `/api/v1/catalog/role-templates` | Amber Role Templates (not grants) |
| GET | `/api/v1/files/:objectId/access` | Fail-closed file-trust check |
| PUT / GET | `/api/v1/files/objects/:token` | Redeem short-lived server-minted upload/download grant |
| POST | `/api/v1/projects/:projectId/documents` | Create Document |
| GET | `/api/v1/projects/:projectId/documents` | List Documents |
| GET | `/api/v1/projects/:projectId/documents/:documentId` | Read Document |
| POST | `/api/v1/projects/:projectId/documents/:documentId/archive` | Soft-archive Document |
| GET / POST | `/api/v1/projects/:projectId/documents/:documentId/revisions` | List / create DRAFT Revision |
| GET / PATCH | `/api/v1/projects/:projectId/documents/:documentId/revisions/:revisionId` | Read / update DRAFT |
| POST | `.../revisions/:revisionId/upload-url` | Mint tenant-bound upload URL |
| POST | `.../revisions/:revisionId/complete-upload` | Confirm bytes + checksum; scan PENDING |
| POST | `.../revisions/:revisionId/publish` | Publish DRAFT (Idempotency-Key) |
| POST | `.../revisions/:revisionId/review` | PUBLISHED → UNDER_REVIEW |
| POST | `.../revisions/:revisionId/approve` | Approve (SoD; Idempotency-Key) |
| POST | `.../revisions/:revisionId/reject` | Reject + reason (preserved; SoD) |
| POST | `.../revisions/:revisionId/make-current` | CAS current pointer / rollback (SoD) |
| GET | `.../revisions/:revisionId/download-url` | Short-lived GET after CLEAN |

`GET /api/v1/auth/session?projectId=` treats `projectId` as routing intent and returns the union of org-scoped + that Project's assignments after server verification.
