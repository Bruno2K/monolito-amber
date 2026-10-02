# Context

## Current execution state

**M2 — Product Experience Foundation is COMPLETE, Exit Gate PASS, and integrated into `main` at `4972176442bdb2631ea1f1710a86191109e79dab`.**

**M3 — Project Operations is ACTIVE / LOCAL ONLY with Exit Gate FAIL — ACCEPTED.** This is not M3 COMPLETE.

**M4 — Planning & Scheduling is COMPLETE / locally approved** (Pack 2026-10-02). M4.9 squash-merged as `fc0aee18975ba85753f251fb2fb8b0b0f2dee8d8`. Activation `main` tip is Polish C `9159889de55b73bbe7cb4eb1e7700f7c4a57fcef`.

**M5 — Calendars & Collaboration is ACTIVE / LOCAL ONLY.** Only **M5.1** is unlocked. M5.2–M5.9 remain LOCKED until M5.1 Exit Gate PASS + merge.

Authorization: GPT Preflight PASS; LOCAL ONLY. **Forbidden:** inventing Vercel/Railway secrets or paid accounts; Engineer self-declaring Exit Gate PASS or M5 completion; starting M5.2–M5.9, M6, or cloud work.

Residuals still OPEN: F-08 / F-10 / RPO-RTO / PaaS; WIN-PS1 accepted residual. M3 cloud residuals are **accepted debt**, not M5 scope.

## M5.1 (IN FLIGHT — CONTRACT / SCHEMA / AUTHZ BASELINE · LOCAL ONLY)

- Issue [#82](https://github.com/Bruno2K/monolito-amber/issues/82)
- Branch `m5-1-contract-schema-authz` from `9159889de55b73bbe7cb4eb1e7700f7c4a57fcef`
- Canonical Notion: https://app.notion.com/p/3ed678e54c8d81dfaf88e9b4e55fe2f4
- Pack: https://app.notion.com/p/3ed678e54c8d819c870ff466a2738b4c
- Matrix: `docs/domain/m5.1-requirements-traceability.md`
- Contract: `docs/domain/m5-calendars-collaboration-contract.md`
- Stop: Engineer does not self-PASS Exit Gate. Do not merge. Do not unlock M5.2/M5.4.
- Non-goals: Calendar/Messaging UX; Nest feature services; cloud/PaaS; M6+; attachments; ResourceAllocation/TimeEntry

## M4 (MERGED — locally approved)

- M4.9 Issue [#76](https://github.com/Bruno2K/monolito-amber/issues/76)
- Merge tip `fc0aee18975ba85753f251fb2fb8b0b0f2dee8d8`
- Homologated Local RC `76d44de81857db5a25cd6bf285a3eda19c8aded1`

## M4.1 (MERGED — docs-only)

- Issue [#54](https://github.com/Bruno2K/monolito-amber/issues/54)
- Contract: `docs/domain/m4-planning-scheduling-contract.md` — **preserve**

## M3.9 (MERGED — Exit Gate FAIL — ACCEPTED)

- Issue [#50](https://github.com/Bruno2K/monolito-amber/issues/50)
- **Not M3 COMPLETE.**

## Preserved invariants

Formal Exception is the sole bypass; READY ≠ RELEASED; Exception ≠ SATISFIED; Issue ≠ Task; Deliverable ≠ Document; WorkPackage ≠ Task; Phase ≠ Deliverable ≠ WorkPackage; Health and Activity are derived; Activity ≠ chat/Audit/Messaging; Organization/Team membership ≠ Project access; Calendar access ≠ Project access; owner/Team/Discipline ≠ Project access; inaccessible resources are omitted without hidden counts; deep links re-authorize; backend remains authoritative; Shell M2.1 remains canonical; DONE/ACHIEVED explicit; FS-only deps; no auto date propagation; no silent cascades; every Planning read model re-authorized; inactive Calendar owner freeze; overlapping grants EDITOR > VIEWER; Direct = unordered membership pair; unread = others after watermark.

## Next boundary

M5.1 Independent Reviewer required. Do not start M5.2/M5.4. Do not invent a shared staging URL. Only Governor may mark the M5.1 Exit Gate after Reviewer PASS.
