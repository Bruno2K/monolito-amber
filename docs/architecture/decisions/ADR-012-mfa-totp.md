# ADR-012 — MFA TOTP foundation

## Status
Accepted (PF-1.1 / 0.2A §9–§10)

## Context
Organization Administrators and Governance Approvers must use MFA. Recovery codes are generated once and stored hashed. High-risk org security/role changes and Formal Exception approval require recent authentication.

## Decision
TOTP is the MVP method. The authenticator secret is stored encrypted (it must be recoverable to verify). Recovery codes are SHA-256 hashed. Enrollment and login challenges use short-lived hashed tokens. `Session.lastReauthAt` is the freshness hook (15 minutes).

## Alternatives
- Hash-only TOTP secret — rejected: cannot verify later.
- WebAuthn first — deferred.
- Permanent lockout for MFA failure — rejected (DoS).

## Consequences
Privileged roles can sign in only after enrollment (or a one-session enrollment-required login). Recovery codes can be regenerated only after password or TOTP re-auth.

## Implementation Implications
No Formal Exception entity is created; SoD and freshness helpers exist for later Governance.

## Supersedes
PF-1.0 MFA skeleton (`secret_hash` only)
