# Security baseline (PF-1.0)

| Finding | Spec status | Foundation evidence |
| --- | --- | --- |
| F-01 catalog / templates / SoD | CLOSED_AT_SPECIFICATION_LEVEL | Seed + SoD stubs |
| F-02 dual bypass | RESOLVED_BY_0.5 | CI forbids `gate.override` / `forceRelease` |
| F-03 AuthN floors | CLOSED_AT_SPECIFICATION_LEVEL | Policy constants + session helpers |
| F-04 isolation | Design present; tests required | Fail-closed stubs |
| F-08 malware | Policy CLOSED; vendor OPEN | `scan_status` + fail-closed tests |
| F-09 audit | CLOSED | Insert-only role + denial tests |
| F-10 retention | OPEN legal | Anonymization-compatible; do not invent periods |
| F-11 CAS / idempotency | Design present | Helpers + table + stubs |

Security test files must exist and must not be `.skip` — the gate test fails the build if they are omitted or skipped.

No production secrets in the repository. `.env.example` only.
