# State

Operational snapshot — update when the Work Item, branch, milestone, or exit-gate status changes.

| Field | Value |
| --- | --- |
| Milestone | **M4 — Planning & Scheduling** (M3 remains Exit Gate **FAIL — ACCEPTED**, not COMPLETE) |
| Status | **M4 ACTIVE / LOCAL ONLY** — M4.1–M4.3 MERGED. M4.4 in flight. M4.5–M4.9 later |
| Default branch | `main` |
| Main integration tip | `a421e9f369bcbbf508538190efe4220164a94416` (M4.3 squash merge) |
| Homologated Local RC tip | `6104276754607334c53c6864135d29c539db813e` |
| Active Work Item | **M4.4 — Dependencies & Scheduling Constraints** |
| Active branch | `m4-4-dependencies-scheduling-constraints` |
| Active Issue | [#60](https://github.com/Bruno2K/monolito-amber/issues/60) |
| Canonical Notion | [M4.4](https://app.notion.com/p/3ec678e54c8d813dae84c670a76e1fb6) · [Pack](https://app.notion.com/p/3ec678e54c8d812d9936e6291e8d07f7) |
| Closed M3.9 | [#50](https://github.com/Bruno2K/monolito-amber/issues/50) / [#51](https://github.com/Bruno2K/monolito-amber/pull/51) **MERGED**; reviewed tip `11d0782509b985eae1919101970e908b5b8e5048`; Reviewer **PASS (audit WI only)** |
| M3.9 Exit Gate | **FAIL — ACCEPTED** (accepted debt — not M4 scope) |
| M3.8 Exit Gate | **not claimed** — frozen |
| Authorization | Bruno 2026-10-01 via Altair — **M4 ACTIVE / LOCAL ONLY**; M4.1 READY only. Do not chase EG-OPS-STAGING-URL / EG-OPS-PAAS-SHA / Vercel / Railway / public URL. |
| Residuals (OPEN) | F-08 / F-10 / RPO-RTO / PaaS; WIN-PS1 accepted residual (supported path = Docker Desktop + WSL2 + bash) |
| Forbidden claims | Exit Gate PASS; M3 COMPLETE; M4 COMPLETE; inventing cloud secrets or a public URL; Kanban/Gantt/Milestone-workflow scope |

## Current boundary

M3.1–M3.8 pack, RC1, and the M3.9 audit WI are on `main`. Bruno homologated LOCAL RC. The M3.9 Exit Gate result is **FAIL — ACCEPTED** (shared staging / PaaS SHA unproven). That debt is **accepted**, not transferred into M4 implementation.

**M4 is ACTIVE / LOCAL ONLY.** **M4.1–M4.3 are MERGED.** **M4.4** implements finish-to-start TaskDependency add/remove, cycle rejection, and reasoned start blockage. Kanban, Gantt, and Milestone workflows remain later WIs. Engineer does not self-PASS Exit Gate.
