# Identity and authorization

Source: APPROVED [0.2A](https://app.notion.com/p/3e3678e54c8d819fa690f4ade50c4e10).

## AuthN floors

- Argon2id required; bcrypt only if Argon2id is unavailable.
- Password min 12, max ≥128; no composition theater.
- Rate limit + progressive backoff; lock after 10 failures / 15 minutes.
- Invite tokens hashed, single-use, 7 days.
- Reset tokens hashed, 30 minutes; success revokes all sessions.
- Opaque HttpOnly Secure SameSite sessions; hash stored; 12h inactive / 7d absolute.
- MFA TOTP required for Organization Administrator and Governance Approver.
- High-risk re-auth for Formal Exception approve and org security/role changes.

## AuthZ

Closed catalog only. Roles are templates composed from that catalog. Resource-level SoD:

1. Publisher cannot approve/reject or make-current that Revision.
2. Exception requester cannot approve/reject or release via that Exception.
3. Project role assignment cannot self-grant outside existing admin authority.

## Audit read

Listing/read requires `organization.read_audit` + tenant/project scope.
