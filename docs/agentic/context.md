# Context

## Current execution state

**M2 — Product Experience Foundation is COMPLETE, Exit Gate PASS, and integrated into `main` at `4972176442bdb2631ea1f1710a86191109e79dab`.**

**M3 — Project Operations is ACTIVE / LOCAL ONLY.** Active Work Item: **M3.1 — Contract, Migration & Test-Data Readiness** (Issue [#30](https://github.com/Bruno2K/monolito-amber/issues/30)). Branch `m3.1-contract-migration-test-data`.

Authorization (Bruno 2026-10-01): local execution of M3.1→M3.7 and the M3.8 local test pack. **Forbidden:** Vercel/Railway/cloud credentials/deploy/domain; M3.8 PASS; M3.9; M3 COMPLETE; M4; starting M3.2/M3.3 domain implementation beyond this contract.

Do **not** mark M3.2+ ACTIVE. Do **not** self-PASS the M3.1 Exit Gate.

## M3.1 in progress

- Objective: freeze executable repo artifacts (contract, ADR, migration/OpenAPI/route/permission/seed/REQ/impact) plus additive catalog deltas and CI tests. No Ops CRUD UI.
- Canonical Notion: https://app.notion.com/p/3ec678e54c8d812d9f92d02f9f153568
- Pack: https://app.notion.com/p/3ec678e54c8d81c49efeccb527b3e2bd
- Figma (reference only): `fkE9SwcNlQG7m0HvcGQBw9`

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
| #24 | M2.8 Activity Experience | `130d9602ce103c685ee7467be60434fbde21bd6e` | MERGED |
| #26 | M2.9 Prototype & State Coverage | `64223fa361bf2600f9e1a1799278e3ddc3e056e5` | MERGED |
| #28 | M2.10 Final UX/UI Audit & Exit Gate | `4e410b11c8712873ace558b931ea141762ee15bb` | MERGED |

## Preserved invariants

Formal Exception is the sole bypass; READY ≠ RELEASED; Exception ≠ SATISFIED; Issue ≠ Task; Deliverable ≠ Document; WorkPackage ≠ Task; Phase ≠ Deliverable ≠ WorkPackage; Health and Activity are derived; Activity ≠ chat/Audit/Messaging; Organization/Team membership ≠ Project access; owner/Team/Discipline ≠ Project access; inaccessible resources are omitted without hidden counts; deep links re-authorize; backend remains authoritative; Shell M2.1 remains canonical.

## Next boundary

M3.2 (Authenticated Application Shell & Project Context) starts only after M3.1 is MERGED / DONE. Planner remains M4.
