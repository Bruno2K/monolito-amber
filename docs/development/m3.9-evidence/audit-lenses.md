# M3.9 — Audit lenses

Judged on candidate branch `m3-9-exit-gate-audit` against homologated Local RC tip `61042767…` plus this WI’s tests/docs. Not a Governor claim.

## Product / domain

| Check | Result | Evidence |
| --- | --- | --- |
| Phase / Deliverable / WorkPackage distinct | Pass | Separate tables, routes, inspectors |
| Explicit state machines | Pass | `packages/shared/src/operations.ts`; ADR-018 |
| Ownership XOR + ACTIVE ProjectMembership | Pass | CHECKs + `m34`/`m35` |
| Project Hub is derived, not SoT | Pass | `hubInventedHealthStatus() === false`; GET-only |
| No cascade Task→WP→Deliverable/Milestone | Pass | ADV-07 |
| OVERDUE is a signal, not a status | Pass | `overdueIsDeliverableStatus() === false` |
| Formal Exception sole bypass; READY ≠ RELEASED; Exception ≠ SATISFIED | Pass | ADR-007; governance + `GateReadAdapter` |
| Issue ≠ Task; Deliverable ≠ Document; WP ≠ Task | Pass | M3.7 floors |
| Org/Team ≠ Project | Pass | ADV-04 |
| M4 not implemented or claimed | Pass | `M4_RESERVED_UI_ROUTES`; no `web/app/**/planner`; nav `coming-later` |

## Security / privacy

| Check | Result | Evidence |
| --- | --- | --- |
| Tenant / project isolation | Pass | F-04 + Ops INT + Local RC ADV-01/02 |
| ProjectMembership authority | Pass | ACTIVE required; team-only denied |
| Additive closed catalog | Pass | `phase.*` / `deliverable.*` / `work_package.*` |
| External user isolation | Pass | `external.a@amber.test` Local RC |
| Immediate revocation | Pass | ADV-03/09 |
| Enumeration / count / search | Pass | ADV-08 |
| Linked-resource reauthorization | Pass | ADV-10; M3.7 both-side AuthZ |
| Audit append-only | Pass | ADV-13; SQL REVOKE UPDATE/DELETE |
| No `gate.override` | Pass | ADV-14; `scripts/assert-no-gate-override.ts` |

## Engineering

| Check | Result | Evidence |
| --- | --- | --- |
| Migration chain forward-only | Pass | `init` → PF-1.1…1.6 → M3.3 → M3.4 → M3.5 → M3.7 (no M3.6 table) |
| Seed / upgrade | Pass | `prisma:migrate` + `AMBER_SEED_M3=1` |
| OpenAPI 3.1 | Pass | `pnpm openapi:generate && pnpm openapi:validate` |
| Idempotency / CAS | Pass | ADV-11/12; F-11 baseline now lists Operations (M39-01) |
| Tests + CI gates | Pass when candidate CI is green | QG-1 list in INDEX |
| Hub query bounds | Pass | take ≤ 50; performance baseline |
| Observability | Pass | health/ready + `correlationId` |
| Rollback | Pass locally | reset rehearsal; no down-migration promised |
| No unrelated drift | Pass | this WI = audit evidence + F-11 doc + ADV tests |

## UX

| Check | Result | Evidence |
| --- | --- | --- |
| Shell M2.1 coherence | Pass | `AppShell` / `Sidebar` / `Header` / `StateScreen` |
| Figma fidelity (functional) | Pass as Local RC | file `fkE9SwcNlQG7m0HvcGQBw9`; route map |
| System states | Pass | empty / loading / error / no-permission / revoked |
| 1440×900 and 1180×820 | Pass | Playwright projects |
| Keyboard / focus / names / contrast / reduced motion | Pass | axe `violations: []`; [manual-focus-review.md](../m3-rc1-evidence/manual-focus-review.md) |
| Prototype vs real routes | Pass | `FIGMA_PROTOTYPE_ROUTE_MAP` vs canonical EN routes |
| Blocking clipping / overflow | Pass | RC1 focus review § overflow @ 1180 |

## Operations

| Check | Result | Evidence |
| --- | --- | --- |
| Local RC isolation | Pass | compose postgres + minio |
| Local deployed SHA | Pass | `/ready` `GIT_SHA` |
| E2E real stack | Pass | Local RC golden + negatives |
| Test accounts | Pass | `@amber.test` seed users |
| Health / logs | Pass | runbook |
| Reset / rollback | Pass | `rehearse-reset.sh` |
| Shared staging URL | **NÃO COMPROVADO / HUMAN_REQUIRED** | no Vercel/Railway project or credentials |
| PaaS image SHA | **NÃO COMPROVADO / HUMAN_REQUIRED** | `deploy-cloud.yml` disabled |

Windows native PS1 host remains an **accepted residual**. Supported path = Docker Desktop + WSL2 + bash ([m3-windows-local-rc.md](../m3-windows-local-rc.md)).
