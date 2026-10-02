# M4.9 — Findings

Severity is not reduced without new evidence. Feature freeze: corrections from findings only. Maximum three loops.

## Closed on this branch

| ID | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| M49-01 | MINOR | `GET …/planning` OpenAPI / controller summary still said “later Marcos” after M4.7 shipped the Marcos projection. | **FIXED** — summary now names List / Kanban / Gantt / Marcos. Description already described the schedule payload. No product contract change. |
| M49-02 | MINOR | `docs/ux/evidence/m4.8/INDEX.md` listed `gantt-date-*`, `authz-search-empty-*`, `authz-viewer-preview-*` as if committed on the tip. Those files are Local RC CI artifacts. | **FIXED** — INDEX now distinguishes committed PNGs (22 files) from CI-regenerated extras. Requirement M4.8-R09 remains ATENDIDO via committed overview PNGs + Playwright. |
| M49-03 | MINOR | M4.3 / M4.4 / M4.6 evidence READMEs named per-slice PNGs that were never committed. | **FIXED** — READMEs now point at the M4.8 pack as the canonical committed viewport evidence. |

## Open — accepted residuals (do not block Engineer handoff)

| ID | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| F-08 | Residual OPEN | Malware scan vendor not chosen; fail-closed on non-CLEAN | Keep OPEN. ADR-009. |
| F-10 | Residual OPEN | Legal retention periods undefined | Keep OPEN. Do not invent periods. |
| RPO-RTO | Residual OPEN | No numeric RPO/RTO target in architecture docs | Keep OPEN. Honest gap; not a silent ATENDIDO. |
| PaaS | Residual OPEN | MVP host vendor unset; cloud deploy disabled | Keep OPEN. M4 is LOCAL ONLY. |
| WIN-PS1 | Accepted residual | Native Windows PowerShell host not executed | Supported path = Docker Desktop + WSL2 + bash. |
| M3 Exit Gate | FAIL — ACCEPTED | Shared staging / PaaS SHA unproven | Accepted debt — not M4 scope. |

## Not found

- BLOCKER product/security/UX defects on the candidate tip: **none** from this Engineer pass.
- IMPORTANT product/security/UX defects requiring a correction loop: **none**.
- DESVIO DE ESCOPO versus authorized M4 contracts: **none**. No M5 / cloud work.

## Explicitly not absorbed

UI Polish B (#74) / D / C inventário stays on the parallel UX track. Gantt visual residuals that are polish-only are **not** M4.9 feature work.

Independent Reviewer must re-inspect the full diff and raw evidence. Engineer must not self-pass the Exit Gate.
