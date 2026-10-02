# Context

## Current execution state

**M2 — Product Experience Foundation is COMPLETE, Exit Gate PASS, and integrated into `main` at `4972176442bdb2631ea1f1710a86191109e79dab`.**

**M3 — Project Operations is ACTIVE / LOCAL ONLY with Exit Gate FAIL — ACCEPTED.** Audit WI Issue [#50](https://github.com/Bruno2K/monolito-amber/issues/50) / PR [#51](https://github.com/Bruno2K/monolito-amber/pull/51) squash-merged. **This is not M3 COMPLETE.**

**M4 — Planning & Scheduling is ACTIVE / LOCAL ONLY.** M4.1–M4.8.1 are MERGED. Homologated Local RC tip `76d44de81857db5a25cd6bf285a3eda19c8aded1` (Bruno accepted 2026-10-02). **M4.9** is in flight (Issue [#76](https://github.com/Bruno2K/monolito-amber/issues/76), branch `m4-9-final-audit-exit-gate`): Final Product, Security & UX Audit / Exit Gate. Feature freeze. **Not M4 COMPLETE.**

Authorization: Altair UNLOCK M4.9 after Bruno Local RC accept; LOCAL ONLY. **Forbidden:** inventing Vercel/Railway secrets or paid accounts; Engineer self-declaring Exit Gate PASS or M3/M4 completion; opening M5.

Residuals still OPEN: F-08 / F-10 / RPO-RTO / PaaS; WIN-PS1 accepted residual (supported path = Docker Desktop + WSL2 + bash). M3 cloud residuals are **accepted debt**, not M4 scope.

## M4.9 (IN FLIGHT — FINAL AUDIT ONLY · LOCAL ONLY)

- Issue [#76](https://github.com/Bruno2K/monolito-amber/issues/76)
- Branch `m4-9-final-audit-exit-gate` from `accce915f25d73d4da13f7505ac47d1abaa05590`
- Canonical Notion: https://app.notion.com/p/3ec678e54c8d81c98327d5bec34db1c9
- Pack: https://app.notion.com/p/3ec678e54c8d812d9936e6291e8d07f7
- Matrix: `docs/domain/m4.9-requirements-traceability.md`
- Evidence: `docs/development/m4.9-evidence/`
- Stop: Engineer recommendation only. Do not self-PASS Exit Gate. Do not mark M4 COMPLETE. Do not open M5.
- Non-goals: cloud/PaaS/M5; new Planning features; absorbing UI Polish B/D/C

## M4.8.1 (MERGED — homologated Local RC)

- Issue [#70](https://github.com/Bruno2K/monolito-amber/issues/70) / PR [#71](https://github.com/Bruno2K/monolito-amber/pull/71)
- Merge tip `76d44de81857db5a25cd6bf285a3eda19c8aded1`
- Product: Marcos Novo Marco create handoff + hide Gantt decorative sort/order

## M4.8 (MERGED — LOCAL RC pack)

- Issue [#68](https://github.com/Bruno2K/monolito-amber/issues/68) / PR [#69](https://github.com/Bruno2K/monolito-amber/pull/69)
- Merge tip `230ccbcac1833a006f7ac6452c6e9fa37e04ac96`
- Product: Local RC spanning every M4 projection/command; golden path; evidence pack

## M4.7 (MERGED — LOCAL ONLY)

- Issue [#66](https://github.com/Bruno2K/monolito-amber/issues/66) / PR [#67](https://github.com/Bruno2K/monolito-amber/pull/67)
- Merge tip `0c1cc2632b47685e3e7bb9107e1eb51be361512d`
- Product: explicit Milestone commands + explainable derived AT_RISK/MISSED

## M4.6 (MERGED — LOCAL ONLY)

- Issue [#64](https://github.com/Bruno2K/monolito-amber/issues/64) / PR [#65](https://github.com/Bruno2K/monolito-amber/pull/65)
- Merge tip `34d1b8e7ce107075b17a6b398762665be9690c8c`
- Product: Timeline/Gantt projection over the unified Planning read-model

## M4.5 (MERGED — LOCAL ONLY)

- Issue [#62](https://github.com/Bruno2K/monolito-amber/issues/62) / PR [#63](https://github.com/Bruno2K/monolito-amber/pull/63)
- Merge tip `8c099c4b72ec240f65f9538b8b38350eee6b1cb0`
- Product: Kanban projection + command surface over accepted Task lifecycle

## M4.4 (MERGED — LOCAL ONLY)

- Issue [#60](https://github.com/Bruno2K/monolito-amber/issues/60)
- Merge tip `cd9a6caabae55bb173fd0a355ed3118d59543b85`
- Product: FS TaskDependency add/remove, transactional cycle rejection, reasoned start blockage

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
- Matrix: `docs/domain/m4.1-requirements-traceability.md`
- Contract: `docs/domain/m4-planning-scheduling-contract.md`

## M3.9 (MERGED — Exit Gate FAIL — ACCEPTED)

- Issue [#50](https://github.com/Bruno2K/monolito-amber/issues/50) / PR [#51](https://github.com/Bruno2K/monolito-amber/pull/51)
- Engineer recommendation: FAIL (staging). **Not M3 COMPLETE.**

## Preserved invariants

Formal Exception is the sole bypass; READY ≠ RELEASED; Exception ≠ SATISFIED; Issue ≠ Task; Deliverable ≠ Document; WorkPackage ≠ Task; Phase ≠ Deliverable ≠ WorkPackage; Health and Activity are derived; Activity ≠ chat/Audit/Messaging; Organization/Team membership ≠ Project access; owner/Team/Discipline ≠ Project access; inaccessible resources are omitted without hidden counts; deep links re-authorize; backend remains authoritative; Shell M2.1 remains canonical; DONE/ACHIEVED explicit; FS-only deps; no auto date propagation; no silent cascades; every Planning read model re-authorized.

## Next boundary

M4.9 audit is in flight. Independent Reviewer required. Do not start M5. Do not invent a shared staging URL. Only Governor may mark the M4 Exit Gate / M4 COMPLETE after Reviewer PASS.
