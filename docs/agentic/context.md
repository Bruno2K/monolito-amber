# Context

## Current execution state

**M2 — Product Experience Foundation is COMPLETE, Exit Gate PASS, and integrated into `main` at `4972176442bdb2631ea1f1710a86191109e79dab`.**

**M3 — Project Operations is ACTIVE / LOCAL ONLY with Exit Gate FAIL — ACCEPTED.** Audit WI Issue [#50](https://github.com/Bruno2K/monolito-amber/issues/50) / PR [#51](https://github.com/Bruno2K/monolito-amber/pull/51) squash-merged to `main` @ `762c3f3ba85ff899623cf4c3682e6bddad062bab`. Disposition sync #52 brought `main` to `a3eaadcd61c8f8153f61c6a51f920e37b8f362a0`. Reviewed tip `11d0782509b985eae1919101970e908b5b8e5048`; Independent Reviewer **PASS (audit WI only)**. Homologated Local RC narrative tip remains `6104276754607334c53c6864135d29c539db813e`. **This is not M3 COMPLETE.**

**M4 — Planning & Scheduling is ACTIVE / LOCAL ONLY.** M4.1 is MERGED @ `6e47d9fb050dcc49b120dd511b9de55634cd4e13`. M4.2 is MERGED @ `0fc8e9ea8901d1a68d12289e743d3115a0ac25fd`. M4.3 is MERGED @ `a421e9f369bcbbf508538190efe4220164a94416`. **M4.4** is in flight (Issue [#60](https://github.com/Bruno2K/monolito-amber/issues/60), branch `m4-4-dependencies-scheduling-constraints`): finish-to-start dependencies. M4.5–M4.9 remain later WIs.

Authorization: Bruno runway M4.1→M4.9 autonomous; LOCAL ONLY. **Forbidden:** inventing Vercel/Railway secrets or paid accounts; Engineer self-declaring Exit Gate PASS or M3/M4 completion.

Residuals still OPEN: F-08 / F-10 / RPO-RTO / PaaS; WIN-PS1 accepted residual (supported path = Docker Desktop + WSL2 + bash). M3 cloud residuals are **accepted debt**, not M4 scope.

## M4.4 (IN FLIGHT — LOCAL ONLY)

- Issue [#60](https://github.com/Bruno2K/monolito-amber/issues/60)
- Branch `m4-4-dependencies-scheduling-constraints` from `a421e9f369bcbbf508538190efe4220164a94416`
- Canonical Notion: https://app.notion.com/p/3ec678e54c8d813dae84c670a76e1fb6
- Pack: https://app.notion.com/p/3ec678e54c8d812d9936e6291e8d07f7
- Plan: `docs/domain/m4.4-requirement-to-change-plan.md`
- Matrix: `docs/domain/m4.4-requirements-traceability.md`
- Product: FS TaskDependency add/remove, transactional cycle rejection, reasoned start blockage
- Non-goals: SS/FF, lag/lead, auto dates, Kanban, Gantt, Milestone workflows, cloud/PaaS/M5

## M4.3 (MERGED — LOCAL ONLY)

- Issue [#58](https://github.com/Bruno2K/monolito-amber/issues/58)
- Merge tip `a421e9f369bcbbf508538190efe4220164a94416`
- Product: Task create / PATCH / assign / start / block / unblock / complete / cancel + planner inspector

## M4.2 (MERGED — LOCAL ONLY)

- Issue [#56](https://github.com/Bruno2K/monolito-amber/issues/56) / PR [#57](https://github.com/Bruno2K/monolito-amber/pull/57)
- Merge tip `0fc8e9ea8901d1a68d12289e743d3115a0ac25fd`
- Product: `GET /api/v1/projects/{projectId}/planning` + `/projects/:projectId/planner` List

## M4.1 (MERGED — docs-only)

- Issue [#54](https://github.com/Bruno2K/monolito-amber/issues/54)
- Merge tip `6e47d9fb050dcc49b120dd511b9de55634cd4e13`
- Canonical Notion: https://app.notion.com/p/3ec678e54c8d8103beafc69c3bb51edc
- Pack: https://app.notion.com/p/3ec678e54c8d812d9936e6291e8d07f7
- Matrix: `docs/domain/m4.1-requirements-traceability.md`
- Contract: `docs/domain/m4-planning-scheduling-contract.md`

## M3.9 (MERGED — Exit Gate FAIL — ACCEPTED)

- Issue [#50](https://github.com/Bruno2K/monolito-amber/issues/50) / PR [#51](https://github.com/Bruno2K/monolito-amber/pull/51)
- Squash-merge tip `762c3f3ba85ff899623cf4c3682e6bddad062bab`
- Reviewed tip `11d0782509b985eae1919101970e908b5b8e5048`; Reviewer PASS (audit WI only)
- Canonical Notion: https://app.notion.com/p/3ec678e54c8d81dab5fceda13242a69b
- Pack: https://app.notion.com/p/3ec678e54c8d81c49efeccb527b3e2bd
- Matrix: `docs/domain/m3.9-requirements-traceability.md`
- Evidence: `docs/development/m3.9-evidence/`
- Engineer recommendation: FAIL (staging). Former branch `m3-9-exit-gate-audit` is closed.

## RC1 (MERGED → homologated)

- Issue [#46](https://github.com/Bruno2K/monolito-amber/issues/46) / PR [#47](https://github.com/Bruno2K/monolito-amber/pull/47)
- Homologated merge SHA `6104276754607334c53c6864135d29c539db813e`
- Evidence index: `docs/development/m3-rc1-evidence/INDEX.md`
- Canonical: https://app.notion.com/p/3ec678e54c8d818e8c8fd4fc619059a8

## M3.8 (merged on main)

M3.8 delivered the localhost pack. RC1 restored evidence; Bruno homologated LOCAL RC. Canonical: https://app.notion.com/p/3ec678e54c8d8136be51cc5a7b7720a6

## M3.1 (merged)

M3.1 froze executable repo artifacts. Canonical: https://app.notion.com/p/3ec678e54c8d812d9f92d02f9f153568

## M2 final evidence (KEEP / INTEGRATED)

- Final WI: M2.10 — Final UX/UI Audit & Exit Gate — PASS / COMPLETE
- Issue: [#27](https://github.com/Bruno2K/monolito-amber/issues/27)
- PR: [#28](https://github.com/Bruno2K/monolito-amber/pull/28) — MERGED
- Final reviewed branch tip: `09c79789660c3221d102d8d37b4a78d168a785da`
- Final merge commit: `4e410b11c8712873ace558b931ea141762ee15bb`
- Integration tip on `main` for M3.1 base: `4972176442bdb2631ea1f1710a86191109e79dab`
- CI: Foundation & Security Gates SUCCESS on final M2 branch tip, run `36822378274`
- Figma: `fkE9SwcNlQG7m0HvcGQBw9`, page `04 — Telas`
- Scope: M2 was documentation, Figma evidence and PNGs only

## Integrated M2 stack

| PR | WI | Merge commit | Status |
| --- | --- | --- | --- |
| #20 | M2.6 Governance Gates & Exceptions | `23aeadeec53ffb5713d5d680015adf9bc59e9b3d` | MERGED |
| #22 | M2.7 Overview & Portfolio Health | `58453e63234aebb427e7fe748a4e2f69ceb8e066` | MERGED |
| #24 | M2.8 Activity Experience | `130d9602ce103c685ee7fe60434fbde21bd6e` | MERGED |
| #26 | M2.9 Prototype & State Coverage | `64223fa361bf2600f9e1a1799278e3ddc3e056e5` | MERGED |
| #28 | M2.10 Final UX/UI Audit & Exit Gate | `4e410b11c8712873ace558b931ea141762ee15bb` | MERGED |

## Preserved invariants

Formal Exception is the sole bypass; READY ≠ RELEASED; Exception ≠ SATISFIED; Issue ≠ Task; Deliverable ≠ Document; WorkPackage ≠ Task; Phase ≠ Deliverable ≠ WorkPackage; Health and Activity are derived; Activity ≠ chat/Audit/Messaging; Organization/Team membership ≠ Project access; owner/Team/Discipline ≠ Project access; inaccessible resources are omitted without hidden counts; deep links re-authorize; backend remains authoritative; Shell M2.1 remains canonical; DONE/ACHIEVED explicit; FS-only deps; no auto date propagation; no silent cascades; every Planning read model re-authorized.

## Next boundary

M4.1 documentary freeze is in flight. Independent Reviewer required. Do not start M4.2+. Do not invent a shared staging URL or chase EG-OPS-STAGING-URL / EG-OPS-PAAS-SHA. Only Governor may mark the M4.1 Exit Gate / unlock M4.2 after merge.
