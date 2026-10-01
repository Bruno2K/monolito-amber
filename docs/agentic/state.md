# State

Operational snapshot — update when the Work Item, branch, milestone, or exit-gate status changes.

| Field | Value |
| --- | --- |
| Milestone | **M4 — Planning & Scheduling** (M3 remains Exit Gate **FAIL — ACCEPTED**, not COMPLETE) |
| Status | **M4 ACTIVE / LOCAL ONLY** — M4.1 in flight. M4.2–M4.9 LOCKED |
| Default branch | `main` |
| Main integration tip | `a3eaadcd61c8f8153f61c6a51f920e37b8f362a0` (docs disposition #52; M3.9 audit squash-merge still `762c3f3b…`) |
| Homologated Local RC tip | `6104276754607334c53c6864135d29c539db813e` |
| Active Work Item | **M4.1 — Contract, Baseline & Read-Model Plan** |
| Active branch | `m4-1-contract-baseline` |
| Active Issue | [#54](https://github.com/Bruno2K/monolito-amber/issues/54) |
| Canonical Notion | [M4.1](https://app.notion.com/p/3ec678e54c8d8103beafc69c3bb51edc) · [Pack](https://app.notion.com/p/3ec678e54c8d812d9936e6291e8d07f7) |
| Closed M3.9 | [#50](https://github.com/Bruno2K/monolito-amber/issues/50) / [#51](https://github.com/Bruno2K/monolito-amber/pull/51) **MERGED**; reviewed tip `11d0782509b985eae1919101970e908b5b8e5048`; Reviewer **PASS (audit WI only)** |
| M3.9 Exit Gate | **FAIL — ACCEPTED** (accepted debt — not M4 scope) |
| M3.8 Exit Gate | **not claimed** — frozen |
| Authorization | Bruno 2026-10-01 via Altair — **M4 ACTIVE / LOCAL ONLY**; M4.1 READY only. Do not chase EG-OPS-STAGING-URL / EG-OPS-PAAS-SHA / Vercel / Railway / public URL. |
| Residuals (OPEN) | F-08 / F-10 / RPO-RTO / PaaS; WIN-PS1 accepted residual (supported path = Docker Desktop + WSL2 + bash) |
| Forbidden claims | Exit Gate PASS; M3 COMPLETE; M4 COMPLETE; inventing cloud secrets or a public URL; starting M4.2+ |

## Current boundary

M3.1–M3.8 pack, RC1, and the M3.9 audit WI are on `main`. Bruno homologated LOCAL RC. The M3.9 Exit Gate result is **FAIL — ACCEPTED** (shared staging / PaaS SHA unproven). That debt is **accepted**, not transferred into M4 implementation.

**M4 is ACTIVE / LOCAL ONLY.** Only **M4.1** may proceed: documentary contract, baseline inventory, read-model plan. No feature UI, no applying migrations, no new API handlers in this WI.
