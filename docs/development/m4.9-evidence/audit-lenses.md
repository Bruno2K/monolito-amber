# M4.9 — Audit lenses

Judged on candidate branch `m4-9-final-audit-exit-gate` against homologated Local RC tip `76d44de8…` plus this WI’s tests/docs. Not a Governor claim.

## Product / domain

| Check | Result | Evidence |
| --- | --- | --- |
| Issue ≠ Task | Pass | Separate `coordination.issues` / `planning.tasks`; UI “Issue relacionada”; `issueEqualsTask() === false` |
| WorkPackage ≠ Task; Deliverable ≠ Document; TeamMembership ≠ ProjectMembership | Pass | Separate schemas; `traceability.ts` floors; assignee requires ACTIVE ProjectMembership |
| Explicit Task / Milestone machines | Pass | `packages/shared/src/planning.ts`; DONE / ACHIEVED only via authorized POSTs |
| Dates / progress do not transit state | Pass | PATCH rejects `status`; `progressPercent100MarksTaskDone()` false; Milestone PATCH rejects client status |
| Lateness / AT_RISK / MISSED derived; no OVERDUE Task status | Pass | `isTaskLate`; `deriveMilestoneRisk`; `TASK_STATUSES` |
| FS-only deps; no self/dup/cycle/cross-tenant | Pass | SQL UNIQUE + CHECKs; `assertAcyclicDependency`; M4.4 HTTP |
| Successor cannot start while predecessor ≠ DONE | Pass | `assertPrerequisitesDone`; golden path |
| No automatic date propagation | Pass | `assertNoScheduleDatePropagation`; HTTP-02 |
| No cascade Task complete → Issue/Deliverable/WP/Phase/Milestone/Gate | Pass | `snapshotSiblings()`; cascade flags false |
| Formal Exception sole Gate bypass | Pass | ADR-007; `FORBIDDEN_PERMISSIONS` |
| Governance reads Planning only | Pass | `api/src/governance/adapters/planning.adapter.ts` find-only |
| List/Kanban/Gantt/Marcos = one Planning SoT | Pass | `GET …/planning`; no `Schedule`/`Gantt` Prisma model |

## Security / privacy

| Check | Result | Evidence |
| --- | --- | --- |
| Tenant / project isolation | Pass | M4.8-HTTP-01; `m4-8-authz.spec.ts`; QG-ADV-01 |
| ProjectMembership authority | Pass | ACTIVE required; team-only denied |
| Additive closed catalog | Pass | `task.*` / `milestone.*`; reads `project.read` |
| External user isolation | Pass | `planning-task-operations` ADV-03; `external-isolation.security.test.ts` |
| Immediate revocation | Pass | session + membership reload; Local RC revoked deep-link |
| Enumeration / count / search | Pass | omit-not-leak; no “1 item oculto” |
| Linked-resource reauthorization | Pass | previews scoped `{ organizationId, projectId }`; inspect omit |
| Audit append-only | Pass | ADV-13; SQL REVOKE; `AuditService.insert` |
| No `gate.override` | Pass | ADV-14; `pnpm assert:no-gate-override` |

## Engineering

| Check | Result | Evidence |
| --- | --- | --- |
| Migration chain forward-only | Pass | init → PF-1.1…1.6 → M3.3–M3.5 → M3.7; **no M4.2–M4.8.1 DDL** |
| Seed / upgrade | Pass | `AMBER_SEED_M3=1`; `rehearse-m4-upgrade.sh` |
| OpenAPI 3.1 | Pass | planning paths; M49-01 closed “later Marcos” summary |
| Idempotency / CAS | Pass | Task writes; Milestone achieve/cancel. Honest: Milestone PATCH CAS-only |
| Tests + CI gates | Pass when candidate CI is green | QG-1 list in INDEX |
| Planner query bounds | Pass | pageSize ≤ 50; schedule take 500; M4.8-PERF-01 |
| Observability | Pass | health/ready + `correlationId` + `redactSecrets` |
| Rollback | Pass locally | reset / upgrade rehearsal; no down-migration promised |
| No unrelated drift | Pass | this WI = audit evidence + MINOR honesty + OpenAPI summary |

## UX

| Check | Result | Evidence |
| --- | --- | --- |
| Shell M2.1 coherence | Pass | Planejamento in `PROJECT_NAV`; `AppShell` |
| Figma fidelity (functional) | Pass as Local RC | file `fkE9SwcNlQG7m0HvcGQBw9`; per-WI figma-trace |
| System states | Pass | empty / filtered / loading / error / forbidden / archived |
| 1440×900 and 1180×820 | Pass | Playwright projects + M4.8 PNG pack |
| Keyboard / focus / names / contrast / reduced motion | Pass | axe planner views; Gantt textual alternative; Kanban menu move |
| Textual Gantt alternatives | Pass | always-visible date form + read-only table |
| Blocking clipping / overflow | Pass | List hides secondary columns at 1180; Kanban/Gantt controlled H-scroll |
| M4.8.1 Marcos create + Gantt sort | Pass | Local RC `planner.spec.ts` M4.8.1 |

## Operations

| Check | Result | Evidence |
| --- | --- | --- |
| Local RC isolation | Pass | compose postgres + minio |
| Local deployed SHA | Pass | `/ready` `GIT_SHA` |
| E2E real stack | Pass | M4.8 golden + authz + planner |
| Test accounts | Pass | `@amber.test` seed users |
| Health / logs | Pass | M4.8 test guide |
| Reset / rollback | Pass | `rehearse-reset.sh` / `rehearse-m4-upgrade.sh` |
| Shared staging URL | Out of scope (LOCAL ONLY) | residual PaaS **OPEN** |
| PaaS image SHA | Out of scope (LOCAL ONLY) | `deploy-cloud.yml` disabled |

Windows native PS1 host remains an **accepted residual**. Supported path = Docker Desktop + WSL2 + bash ([m3-windows-local-rc.md](../m3-windows-local-rc.md)).
