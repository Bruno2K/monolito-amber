# State

Operational snapshot — update when the Work Item, branch, milestone, or exit-gate status changes.

| Field | Value |
| --- | --- |
| Milestone | **M4 — Planning & Scheduling** (M3 remains Exit Gate **FAIL — ACCEPTED**, not COMPLETE) |
| Status | **M4 ACTIVE / LOCAL ONLY** — M4.2 MERGED. M4.3 in flight. M4.4–M4.9 later |
| Default branch | `main` |
| Main integration tip | `0fc8e9ea8901d1a68d12289e743d3115a0ac25fd` (M4.2 squash merge) |
| Homologated Local RC tip | `6104276754607334c53c6864135d29c539db813e` |
| Active Work Item | **M4.3 — Task Operations & Inspector** |
| Active branch | `m4-3-task-operations-inspector` |
| Active Issue | [#58](https://github.com/Bruno2K/monolito-amber/issues/58) |
| Canonical Notion | [M4.3](https://app.notion.com/p/3ec678e54c8d81299a9cd44035220532) · [Pack](https://app.notion.com/p/3ec678e54c8d812d9936e6291e8d07f7) |
| Closed M3.9 | [#50](https://github.com/Bruno2K/monolito-amber/issues/50) / [#51](https://github.com/Bruno2K/monolito-amber/pull/51) **MERGED**; reviewed tip `11d0782509b985eae1919101970e908b5b8e5048`; Reviewer **PASS (audit WI only)** |
| M3.9 Exit Gate | **FAIL — ACCEPTED** (accepted debt — not M4 scope) |
| M3.8 Exit Gate | **not claimed** — frozen |
| Authorization | Bruno 2026-10-01 via Altair — **M4 ACTIVE / LOCAL ONLY**; M4.1 READY only. Do not chase EG-OPS-STAGING-URL / EG-OPS-PAAS-SHA / Vercel / Railway / public URL. |
| Residuals (OPEN) | F-08 / F-10 / RPO-RTO / PaaS; WIN-PS1 accepted residual (supported path = Docker Desktop + WSL2 + bash) |
| Forbidden claims | Exit Gate PASS; M3 COMPLETE; M4 COMPLETE; inventing cloud secrets or a public URL; Kanban/Gantt/dependency/Milestone-workflow scope |

## Current boundary

M3.1–M3.8 pack, RC1, and the M3.9 audit WI are on `main`. Bruno homologated LOCAL RC. The M3.9 Exit Gate result is **FAIL — ACCEPTED** (shared staging / PaaS SHA unproven). That debt is **accepted**, not transferred into M4 implementation.

**M4 is ACTIVE / LOCAL ONLY.** **M4.1 and M4.2 are MERGED.** **M4.3** implements authorized Task create / field edit / assign / explicit lifecycle commands and the planner inspector. Kanban, Gantt, dependency editing, and Milestone workflows remain later WIs. Engineer does not self-PASS Exit Gate.
