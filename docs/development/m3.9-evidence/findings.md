# M3.9 — Findings

Severity is not reduced without new evidence. Feature freeze: corrections from findings only.

## Closed on this branch

| ID | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| M39-01 | MINOR | F-11 security baseline listed CAS/idempotency for Document / coordination / planning only, while Operations already implements `expectedVersion` + `Idempotency-Key`. | **FIXED** — [security-baseline.md](../../security/security-baseline.md) now names Operations writes. No product contract change. |

## Open — accepted residuals (do not block Engineer handoff)

| ID | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| F-08 | Residual OPEN | Malware scan vendor not chosen; fail-closed on non-CLEAN | Keep OPEN. ADR-009. |
| F-10 | Residual OPEN | Legal retention periods undefined | Keep OPEN. Do not invent periods. |
| RPO-RTO | Residual OPEN | No numeric RPO/RTO target in architecture docs | Keep OPEN. Honest gap; not a silent ATENDIDO. |
| PaaS | Residual OPEN | MVP host vendor unset; cloud deploy disabled | Keep OPEN. |
| WIN-PS1 | Accepted residual | Native Windows PowerShell host not executed | Supported path = Docker Desktop + WSL2 + bash. |

## Open — HUMAN_REQUIRED (blocks Governor Exit Gate, not a product BLOCKER)

| ID | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| M39-STAGING | HUMAN_REQUIRED | Shared staging / public URL / PaaS deployed SHA cannot be proven | Vercel list for this repo is empty. Do not create paid accounts or invent secrets. Mark Operations rows NÃO COMPROVADO. |

## Not found

- BLOCKER product/security/UX defects on the candidate tip: **none** from this Engineer pass.
- IMPORTANT product/security/UX defects requiring a correction loop: **none**. Staging cloud is classified HUMAN_REQUIRED, not IMPORTANT-with-workaround.
- DESVIO DE ESCOPO versus authorized M3 contracts: **none**. M4 planner remains reserved.

Independent Reviewer must re-inspect the full diff and raw evidence. Engineer must not self-pass.
