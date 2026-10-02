# M4.8 Planning seed design

Additive fixtures on the M3 synthetic dataset. Writer: `prisma/m4-seed.ts`, design: `packages/shared/src/m4-seed-design.ts`. Invoked only when `AMBER_SEED_M3=1` (after `seedM3Dataset`).

No production credentials. Emails stay `@amber.test`. Idempotent upserts on deterministic UUIDs (`amber.m3.seed.<key>`).

| Class | Coverage |
| --- | --- |
| Issue | 1 OPEN MANUAL on Alpha Tower (`Seed grid clash`) |
| Milestones | PLANNED / ACHIEVED / CANCELLED + past target (derived MISSED) + late-linked AT_RISK + Org B negative |
| Tasks | TODO, IN_PROGRESS, BLOCKED, DONE, CANCELLED, late TODO |
| Dependencies | FS pair with DONE predecessor; FS pair with open predecessor (start block) |
| Links | Phase / Deliverable / WorkPackage / Issue / Milestone on `Seed outline programme` |
| Pre-M4 row | `Pre-M4 activation Task` inserted by `scripts/local-rc/insert-pre-m4-activation.ts` during rehearsal — seed must not delete it |

Reset: `pnpm local-rc:reset` or `pnpm local-rc:rehearse-reset`.
