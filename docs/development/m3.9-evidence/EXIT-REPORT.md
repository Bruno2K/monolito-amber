# M3.9 — Exit report (Engineer recommendation)

**Recommendation: FAIL — do not declare the Exit Gate.**

Reason: Notion Exit Gate requires staging usable / deployed SHA. Shared Vercel/Railway/public URL is **HUMAN_REQUIRED / NÃO COMPROVADO**. Local RC + CI remain the proven environment. Engineer does not self-declare milestone completion.

Do not start M4.

## Planned vs delivered

| Planned | Delivered |
| --- | --- |
| Full requirements matrix M3.1–M3.8 + RC1 | [m3.9-requirements-traceability.md](../../domain/m3.9-requirements-traceability.md) — 126 WI rows ATENDIDO; 0 PARCIAL; 0 NÃO COMPROVADO; 0 DESVIO |
| Five audit lenses | [audit-lenses.md](./audit-lenses.md) |
| Fifteen adversarial scenarios on candidate tip | [adversarial-scenarios.md](./adversarial-scenarios.md) + ADV tests + Local RC extensions |
| Correction loops ≤3 for BLOCKER/IMPORTANT | None required. MINOR M39-01 (F-11 doc) closed. |
| Evidence index + this report | this folder |
| Agentic docs for ACTIVE M3.9 | `docs/agentic/{state,context,graph}.md` |
| Same-tip Foundation + Local RC | recorded in [INDEX.md](./INDEX.md) after green CI |

## Issues / PRs / SHAs / migrations

See matrix integration map. Homologated Local RC merge `6104276754607334c53c6864135d29c539db813e`. Docs residual `d01dfc9e202c60f027c242d187f6cf2e31c701bf`. Migrations: `20261001160000_m3_3…`, `20261001170000_m3_4…`, `20261001180000_m3_5…`, `20261001200000_m3_7…` (Hub has no table).

## Final main and deployed SHA

- `main` at branch point: `d01dfc9e202c60f027c242d187f6cf2e31c701bf`
- Local RC identity: `/api/v1/health` and `/ready` `GIT_SHA`
- **PaaS deployed SHA:** NÃO COMPROVADO (HUMAN_REQUIRED)

## Metrics / tests

| Gate | Command |
| --- | --- |
| Lint / typecheck / unit / security / integration / build | `pnpm lint` … `pnpm build` |
| No `gate.override` | `pnpm assert:no-gate-override` |
| OpenAPI | `SKIP_DB=1 pnpm openapi:generate && pnpm openapi:validate` |
| Migrations | `pnpm prisma:validate` |
| Local RC E2E | `pnpm --filter @amber/web test:e2e:local-rc` |

New fail-closed stubs: `packages/shared/src/m39-adversarial.test.ts`, `api/test/security/m39-adversarial.security.test.ts` (registered in security-gate lists).

## Findings / corrections

- M39-01 MINOR **closed** (F-11 Operations CAS/idempotency documented).
- BLOCKER / IMPORTANT **none** on this Engineer pass.
- Residuals F-08 / F-10 / RPO-RTO / PaaS / WIN-PS1 remain OPEN as documented.

## Residual OPTIONAL / deferred debt

Windows native PS1 host; shared staging; malware vendor; retention periods; RPO-RTO numbers; PaaS vendor.

## Deviations

None versus authorized LOCAL FIRST M3.8. Cloud staging was never silently marked ATENDIDO.

## Reviewer / Governor

Independent Reviewer inspects the full diff and raw evidence. PASS for this WI still requires zero BLOCKER/IMPORTANT. A Reviewer PASS on the audit **does not** authorize Engineer to mark the Exit Gate. Only Governor may do that after staging is proven or formally excepted, and must not open M4 from this report.
