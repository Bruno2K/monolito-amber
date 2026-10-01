# M3.9 — Fifteen adversarial scenarios

Catalog: `packages/shared/src/m39-adversarial.ts` (`ADV-01`…`ADV-15`). Floors: `packages/shared/src/m39-adversarial.test.ts` + `api/test/security/m39-adversarial.security.test.ts`. Local RC reuse/extension: `web/e2e/local-rc/negatives.spec.ts`.

Primary environment: **Local RC** (homologated tip `61042767…`) + Foundation/security suites on the candidate tip. This file does not declare milestone completion.

| ID | Scenario | Verdict | Local RC | Integration / security | Unit floors |
| --- | --- | --- | --- | --- | --- |
| ADV-01 | Cross-Organization IDs on every new family | Evidenced | `ADV-01/ADV-02 wrong org/project` | `m33`/`m34`/`m35`/`m37`/`planning-tasks-milestones` body spoof 403; Milestone forged org via `resolveMilestoneDeliveryRefs` | `m39-adversarial.test.ts` |
| ADV-02 | Cross-Project links | Evidenced | same + external cannot open `projectA2` | WP/Task/Document/Hub/context 403 | `assertSameTenantProject` |
| ADV-03 | Removed / suspended memberships | Evidenced | `ADV-03/ADV-09 revoked`; `ADV-03 removed` | `project-membership` + `f04` + `m33` | `shouldRevokeOrgAccess` / `shouldRevokeProjectAccess` |
| ADV-04 | Team ownership treated as access | Evidenced | `ADV-04 TeamMembership…` | team-only hub/context/phase 403 | `teamOwnerGrantsProjectAccess()` false |
| ADV-05 | Explicit states bypassed by date/progress | Evidenced | `ADV-05 dates/progress…` (progress 100 stays PLANNED; Phase dates stay PLANNED) | `m33`/`m34`/`m35`; POST `OVERDUE` 409 | `phaseDatesTransitStatus()` false |
| ADV-06 | Deliverable delivered with incomplete WP | Evidenced | `ADV-06 deliver is blocked…` on `DEL-ARCH-001` + `WP-PLAN-001` | `m34`/`m35` CANCELLED-until-disassociate | `assertDeliverableCanBeDelivered` |
| ADV-07 | Task completion causing cascade | Evidenced | — (API/domain; no UI Task complete in M3) | `m37` “does not cascade Task complete” | `taskCompleteCascadesTo*` false |
| ADV-08 | Hidden counts / read models | Evidenced | `ADV-08 hidden counts` | `m36`/`m37` omit keys; no `documentsCount` | `payloadLeaksHiddenCount` |
| ADV-09 | Stale cache after revocation | Evidenced | revoked deep-link (session) | `m36` warm hub → REMOVE → 403 without relying on Engineer cache clear | `hubCache.invalidateProject` in `project-memberships.service.ts` |
| ADV-10 | Inaccessible deep links | Evidenced | `ADV-10 inaccessible deep-link` | spoofed GET 403 omit-not-leak | `deepLinkWithReturn` |
| ADV-11 | Concurrent stale version updates | Evidenced | `ADV-11/ADV-12 stale expectedVersion` | `expectedVersion: 999` → 409 on Phase/Deliverable/WP | `applyOptimisticUpdate` |
| ADV-12 | Duplicate idempotency commands | Evidenced | same test: replay same id; clash ≥400 | create replay in `m34`/`m35` | `replayOrConflict` |
| ADV-13 | Audit mutation attempt | Evidenced | — (DB role; not a UI action) | `foundation.integration.test.ts` SQL UPDATE/DELETE denied | `assertAuditMutationAllowed` |
| ADV-14 | `gate.override` scan | Evidenced | CI `pnpm assert:no-gate-override` | catalog GET excludes token; `GateReadAdapter` throws | `FORBIDDEN_PERMISSIONS` |
| ADV-15 | Migration from pre-M3 main | Evidenced | Local RC reset rehearsal (empty → migrate → seed) | `m33` historical columns; `m35` additive | `m3-contract.consistency.test.ts`; `pnpm prisma:validate` |

## Notes

- ADV-07 / ADV-13 / ADV-14 are not browser flows. They are re-run on the candidate tip via Foundation security + scripts.
- ADV-01 Milestone HTTP body-spoof is covered by the same tenant resolver used by the planning controller (`resolveMilestoneDeliveryRefs`). Cross-org **document** link is covered by cross-project 403 in `m37` plus the same-tenant helper; a foreign-org document id is denied by document AuthZ before link.
- Seed mutation in ADV-05/ADV-06 is Local RC only (`workers: 1`). Golden path runs first alphabetically.

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
