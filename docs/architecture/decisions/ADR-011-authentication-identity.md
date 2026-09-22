# ADR-011 — Authentication Identity separate from User

## Status
Accepted (PF-1.1)

## Context
0.2 / 0.2A keep business User identity separate from authentication methods so EMAIL_PASSWORD can be joined later by Entra, Google, or SSO_ONLY without rewriting Organization Membership.

## Decision
`User` is the global business identity. `AuthenticationIdentity` owns provider-specific data (`provider` + `identifier`). MVP persists `EMAIL_PASSWORD` and attaches `PasswordCredential` to that identity, not to membership. Reserved provider values: `ENTRA`, `GOOGLE`, `SSO_ONLY`.

## Alternatives
- Keep `PasswordCredential.userId` from PF-1.0 — rejected: encodes email/password into the business identity.
- One row per future SSO provider on `User` — rejected: not SSO-compatible.

## Consequences
Login, reset, and MFA challenges resolve through `AuthenticationIdentity`. Membership never stores credentials.

## Implementation Implications
Additive PF-1.1 migration introduces `authentication_identities` and re-points `password_credentials`.

## Supersedes
PF-1.0 User↔PasswordCredential direct coupling
