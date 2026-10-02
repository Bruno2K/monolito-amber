# M4.9 — Adversarial scenarios (Quality Gates + M3 reuse)

Catalog: `packages/shared/src/m49-audit.ts` (`QG-ADV-01`…`QG-ADV-13`). Floors: `packages/shared/src/m49-audit.test.ts` + `api/test/security/m49-audit.security.test.ts`. Reproduction reuses the M4.8 Local RC harness rather than a second stack.

Primary environment: **Local RC** (homologated tip `76d44de8…`) + Foundation/security suites on the candidate tip. This file does not declare milestone completion. **M4.9-ADV-01** = this suite.

| ID | Scenario | Verdict | Local RC / E2E | Integration / security | Unit floors |
| --- | --- | --- | --- | --- | --- |
| QG-ADV-01 | Cross-Organization and cross-Project identifiers | Evidenced | `m4-8-authz.spec.ts`; `negatives.spec.ts` ADV-01/02 | `m48` HTTP-01; `planning-tasks-milestones` body spoof 403 | `resolveTaskDeliveryRefs` |
| QG-ADV-02 | Removed / suspended ProjectMembership | Evidenced | `m4-8-authz.spec.ts` revoked deep-link; `negatives.spec.ts` ADV-03 | `planning-task-operations` ADV-03; deps ADV-03 | `shouldRevokeProjectAccess` |
| QG-ADV-03 | Unauthorized list / count / search / filter / deep link | Evidenced | `m4-8-authz.spec.ts`; golden path no “1 item oculto” | `m48` search/inspect omit; `planning-read-model` HTTP-02 | `payloadLeaksHiddenCount` |
| QG-ADV-04 | Linked Issue / Deliverable / WP / Milestone preview after revocation | Evidenced | `m4-8-authz.spec.ts` viewer/linked preview | `m48` deliverable context omit; planning previews scoped | `visible: false` risk omit |
| QG-ADV-05 | Stale version update | Evidenced | Local RC planner stale CAS (M4.5/M4.6) | `planning-task-operations` ADV-01; `applyOptimisticUpdate` | `m49-audit.test.ts` |
| QG-ADV-06 | Duplicate retry (Idempotency-Key) | Evidenced | — (API; replay not a distinct UI) | create/assign/dep replay; M4.4 ADV-03 | `replayOrConflict` (M3.9 floors still green) |
| QG-ADV-07 | Self, duplicate, cross-project, cyclic dependency | Evidenced | inspector add rejects (mock + Local RC planner) | `planning-dependencies` HTTP-01 | `assertFinishToStartType` / `assertAcyclicDependency` |
| QG-ADV-08 | Successor start before predecessor DONE | Evidenced | `m4-8-golden-path.spec.ts` start block | `m48` HTTP-02/03; M4.4 HTTP-02 | `prerequisitesBlockStart` |
| QG-ADV-09 | Due-date / progress edits attempting silent state transitions | Evidenced | inspector Salvar progresso ≠ Concluir | PATCH status 409; progress 100 stays stored status | `progressPercent100MarksTaskDone()` |
| QG-ADV-10 | Task completion attempting to mutate Issue / Milestone / Deliverable / Gate | Evidenced | golden path siblings stay stored | `snapshotSiblings()`; M4.3 HTTP-04 | `taskCompleteCascadesTo*` |
| QG-ADV-11 | Date drag attempting automatic propagation | Evidenced | Gantt form; reduced-motion disables drag | HTTP-02 `propagateDates` → `DEPENDENCY_DATE_SHIFT_REJECTED` | `assertNoScheduleDatePropagation` |
| QG-ADV-12 | Hidden archived data and malformed filters | Evidenced | archived banner; forbidden Project | fail-closed invalid filter `id: { in: [] }`; archived mutations 409 | planning service `where` |
| QG-ADV-13 | Keyboard-only and reduced-motion paths | Evidenced | Local RC `a11y.spec.ts`; Kanban menu; Gantt `#gantt-dates-*` | — | PlanningStates + `prefers-reduced-motion` |

## M3 floors still required (not re-numbered)

| ID | Scenario | Verdict | Evidence |
| --- | --- | --- | --- |
| ADV-13 | Audit mutation attempt | Evidenced | `foundation.integration.test.ts`; `AuditService.denyMutation` |
| ADV-14 | `gate.override` scan | Evidenced | `pnpm assert:no-gate-override`; `FORBIDDEN_PERMISSIONS` |
| ADV-15 | Migration from pre-M4 / pre-M3 main | Evidenced | `rehearse-reset.sh` + `rehearse-m4-upgrade.sh`; `m48` R01 |

## Notes

- QG-ADV-06 / ADV-13 / ADV-14 are not browser-primary. They are re-run on the candidate tip via Foundation security + scripts.
- Golden path runs first alphabetically in Local RC (`m4-8-golden-path.spec.ts`).
- **M4.9-A11Y-01** = Local RC `a11y.spec.ts` planner views. **M4.9-PERF-01** = `M4.8-PERF-01` observations.

## Commands

```bash
pnpm --filter @amber/shared test:unit
pnpm --filter @amber/shared test:security
pnpm --filter @amber/api test:security
pnpm assert:no-gate-override
pnpm prisma:validate
# Local RC (real stack):
pnpm --filter @amber/web test:e2e:local-rc
```
