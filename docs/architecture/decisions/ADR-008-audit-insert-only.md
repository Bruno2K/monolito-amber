# ADR-008 — Audit insert-only + read ACL

## Status
Accepted (F-09 CLOSED at specification level)

## Context
Audit is a dedicated schema, separate from operational logs. Historical integrity must survive later LGPD anonymization of display data.

## Decision
Application credentials receive INSERT and SELECT on `audit.audit_events` and **no UPDATE/DELETE**. Reads require `organization.read_audit` plus the actor’s active Organization/Project scope. Auditor is the read-only default template.

## Alternatives
- Mix audit into app logs — rejected.
- Allow app UPDATE for “corrections” — rejected: append-only.

## Consequences
Migrations create role `amber_app` and REVOKE UPDATE/DELETE. Tests fail if those privileges exist.

## Implementation Implications
Legal retention periods remain OPEN (F-10). Architecture must not preclude controlled anonymization.

## Supersedes
None
