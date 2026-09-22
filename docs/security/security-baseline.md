# Security baseline (PF-1.5)

| Finding | Spec status | Foundation evidence |
| --- | --- | --- |
| F-01 catalog / templates / SoD | CLOSED_AT_SPECIFICATION_LEVEL | Seed + SoD primitives (no fake entities) |
| F-02 dual bypass | RESOLVED_BY_0.5 | CI forbids `gate.override` / `forceRelease` |
| F-03 AuthN floors | CLOSED_AT_SPECIFICATION_LEVEL | Argon2id, lockout, hashed tokens, cookie sessions, MFA fail-closed for privileged roles |
| F-04 isolation | Implemented | HTTP + unit negatives; fail closed if skipped |
| F-08 malware | Policy CLOSED; vendor OPEN | `scan_status` + fail-closed tests |
| F-09 audit | CLOSED | Insert-only role + denial tests; security events redact secrets |
| F-10 retention | OPEN legal | Anonymization-compatible; do not invent periods |
| F-11 CAS / idempotency | Implemented for Document current pointer + coordination + planning writes | make-current CAS + Idempotency-Key on publish/approve/reject/make-current/assess/resolve/issue create and status / task create+DONE+dependency / milestone create+achieve |
| Impact auto-create | Implemented | Exactly one PENDING_ANALYSIS case per change event; never auto-IMPACTED / auto-Issues |
| Planning isolation | Implemented | Task/Milestone tenant-bound; assignee ACTIVE ProjectMembership; cycle checks stay in-project |

Security test files must exist and must not be `.skip` — the gate test fails the build if they are omitted or skipped.

No production secrets in the repository. `.env.example` only.
