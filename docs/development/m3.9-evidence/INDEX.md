# M3.9 — Reviewer evidence index

Independent Reviewer: inspect **raw files, tests, and CI logs**, not Engineer summaries.

**Work Item:** M3.9 — Final Product, Security & UX Audit / Exit Gate  
**Issue:** [#50](https://github.com/Bruno2K/monolito-amber/issues/50)  
**Notion:** https://app.notion.com/p/3ec678e54c8d81dab5fceda13242a69b  
**Branch:** `m3-9-exit-gate-audit`  
**Base:** `main` @ `d01dfc9e202c60f027c242d187f6cf2e31c701bf`  
**Homologated Local RC narrative tip:** `6104276754607334c53c6864135d29c539db813e`

Engineer delivers a recommendation only. Governor decides any milestone / Exit Gate claim after Reviewer. Do not start M4.

## How to read

1. Open [requirements matrix](../../domain/m3.9-requirements-traceability.md) and confirm every M3.1–M3.8 + RC1 id has a status + evidence path.
2. Open [audit-lenses.md](./audit-lenses.md) and [adversarial-scenarios.md](./adversarial-scenarios.md).
3. Open [findings.md](./findings.md) — expect zero BLOCKER/IMPORTANT product defects; staging cloud is HUMAN_REQUIRED.
4. Open [EXIT-REPORT.md](./EXIT-REPORT.md) last.
5. Confirm CI SHAs on this branch match the candidate tip (table filled after the green run).

## Deliverables in this folder

| File | Purpose |
| --- | --- |
| [INDEX.md](./INDEX.md) | This index |
| [EXIT-REPORT.md](./EXIT-REPORT.md) | Planned vs delivered + recommendation |
| [audit-lenses.md](./audit-lenses.md) | Product, Security, Engineering, UX, Operations |
| [adversarial-scenarios.md](./adversarial-scenarios.md) | ADV-01…ADV-15 |
| [findings.md](./findings.md) | Severity + corrections |

Canonical matrix: [../../domain/m3.9-requirements-traceability.md](../../domain/m3.9-requirements-traceability.md)

## Reused Local RC / RC1 evidence

Do not regenerate claims from mocks. Real-stack evidence already on `main`:

- Specs: `web/e2e/local-rc/golden-path.spec.ts`, `negatives.spec.ts` (ADV ids), `a11y.spec.ts`
- Config: `web/playwright.local-rc.config.ts` (1440×900 / 1180×820)
- Axe JSON + focus + MinIO + reset: [../m3-rc1-evidence/INDEX.md](../m3-rc1-evidence/INDEX.md)
- PNG convention: [../m3.8-evidence/README.md](../m3.8-evidence/README.md)
- Homologated merge CI: https://github.com/Bruno2K/monolito-amber/actions/runs/36927791629 (`61042767…`)

## Candidate-tip CI (this branch)

Same-tip Foundation + Local RC SUCCESS on the audit tip (no jobs skipped):

| Job | URL | Status | Tip SHA |
| --- | --- | --- | --- |
| Foundation & Security Gates | https://github.com/Bruno2K/monolito-amber/actions/runs/36934868385/job/110612647764 | success | `862a15671f27398cd1ac048dce5bc126f0f4704b` |
| Local RC (real API + Postgres + MinIO) | https://github.com/Bruno2K/monolito-amber/actions/runs/36934868385/job/110612648098 | success | `862a15671f27398cd1ac048dce5bc126f0f4704b` |

Workflow: https://github.com/Bruno2K/monolito-amber/actions/runs/36934868385

A later docs-only commit on this branch only records that run. The green evidence tip remains `862a15671f27398cd1ac048dce5bc126f0f4704b`.

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

**HUMAN_REQUIRED / NÃO COMPROVADO.** No Vercel project is bound to `Bruno2K/monolito-amber`. `.github/workflows/deploy-cloud.yml` is disabled. Do not invent secrets or paid accounts.

## Invariants (must remain true)

Formal Exception is the sole bypass; READY ≠ RELEASED; Exception ≠ SATISFIED; Issue ≠ Task; Deliverable ≠ Document; WorkPackage ≠ Task; Hub ≠ SoT; no OVERDUE status invent; no cascade; Org/Team ≠ Project; no `gate.override`; Modular Monolith; LOCAL ONLY preferred evidence.
