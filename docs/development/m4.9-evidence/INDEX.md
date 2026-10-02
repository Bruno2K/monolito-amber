# M4.9 — Reviewer evidence index

Independent Reviewer: inspect **raw files, tests, and CI logs**, not Engineer summaries.

**Work Item:** M4.9 — Final Product, Security & UX Audit / Exit Gate  
**Issue:** [#76](https://github.com/Bruno2K/monolito-amber/issues/76)  
**Notion:** https://app.notion.com/p/3ec678e54c8d81c98327d5bec34db1c9  
**Pack:** https://app.notion.com/p/3ec678e54c8d812d9936e6291e8d07f7  
**Branch:** `m4-9-final-audit-exit-gate`  
**Base:** `main` @ `accce915f25d73d4da13f7505ac47d1abaa05590`  
**Homologated Local RC narrative tip:** `76d44de81857db5a25cd6bf285a3eda19c8aded1`

Engineer delivers a recommendation only. Governor decides any milestone / Exit Gate claim after Reviewer. Do not start M5.

## How to read

1. Open [requirements matrix](../../domain/m4.9-requirements-traceability.md) and confirm every M4.1–M4.8.1 id has a status + evidence path.
2. Open [audit-lenses.md](./audit-lenses.md) and [adversarial-scenarios.md](./adversarial-scenarios.md).
3. Open [findings.md](./findings.md) — expect zero BLOCKER/IMPORTANT product defects; accepted residuals stay OPEN.
4. Open [EXIT-REPORT.md](./EXIT-REPORT.md) last.
5. Confirm CI SHAs on this branch match the candidate tip (table filled after the green run).

## Deliverables in this folder

| File | Purpose |
| --- | --- |
| [INDEX.md](./INDEX.md) | This index |
| [EXIT-REPORT.md](./EXIT-REPORT.md) | Planned vs delivered + recommendation |
| [audit-lenses.md](./audit-lenses.md) | Product, Security, Engineering, UX, Operations |
| [adversarial-scenarios.md](./adversarial-scenarios.md) | QG-ADV-01…13 + M3 ADV reuse |
| [findings.md](./findings.md) | Severity + corrections |

Canonical matrix: [../../domain/m4.9-requirements-traceability.md](../../domain/m4.9-requirements-traceability.md)  
Release pointer: [../../release/m4.9-evidence-index.md](../../release/m4.9-evidence-index.md)

## Reused M4.8 Local RC harness

Do not invent a second stack. Real-stack evidence already on `main` / this tip:

- Specs: `web/e2e/local-rc/m4-8-golden-path.spec.ts`, `m4-8-authz.spec.ts`, `m4-8-evidence.spec.ts`, `planner.spec.ts`, `negatives.spec.ts`, `a11y.spec.ts`
- HTTP: `api/test/integration/m48-local-rc.integration.test.ts` (M4.9 IDs added on this branch)
- Config: `web/playwright.local-rc.config.ts` (1440×900 / 1180×820)
- PNG pack: [../../ux/evidence/m4.8/INDEX.md](../../ux/evidence/m4.8/INDEX.md)
- Homologated Local RC merge: `76d44de81857db5a25cd6bf285a3eda19c8aded1`

## Candidate-tip CI (this branch)

Same-tip Foundation + Local RC SUCCESS on the audit tip (no jobs skipped):

| Job | URL | Status | Tip SHA |
| --- | --- | --- | --- |
| Foundation & Security Gates | https://github.com/Bruno2K/monolito-amber/actions/runs/36972519273/job/110729299995 | success | `1679dee0c029f324f0ea8fdae1e3a3dd54ae22ce` |
| Local RC (real API + Postgres + MinIO) | https://github.com/Bruno2K/monolito-amber/actions/runs/36972519273/job/110729299886 | success | `1679dee0c029f324f0ea8fdae1e3a3dd54ae22ce` |

Workflow: https://github.com/Bruno2K/monolito-amber/actions/runs/36972519273

A later docs-only commit on this branch only records that run. The green evidence tip remains `1679dee0c029f324f0ea8fdae1e3a3dd54ae22ce`.

Required commands (QG-1):

```bash
pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:security
pnpm assert:no-gate-override
pnpm test:integration
pnpm build
SKIP_DB=1 pnpm openapi:generate && pnpm openapi:validate
pnpm prisma:validate
pnpm --filter @amber/web test:e2e:local-rc
```

## Staging / cloud

**Out of scope / accepted residual.** M4 is LOCAL ONLY. `.github/workflows/deploy-cloud.yml` is disabled. Do not invent secrets or paid accounts. F-08 / F-10 / RPO-RTO / PaaS / WIN-PS1 remain OPEN.

## Invariants (must remain true)

Formal Exception is the sole bypass; READY ≠ RELEASED; Exception ≠ SATISFIED; Issue ≠ Task; Deliverable ≠ Document; WorkPackage ≠ Task; TeamMembership ≠ ProjectMembership; List/Kanban/Gantt/Marcos = one Planning SoT; no OVERDUE status invent; no cascade; no silent date→state; no auto-achieve; no auto date propagation; no `gate.override`; Modular Monolith; LOCAL ONLY preferred evidence.
