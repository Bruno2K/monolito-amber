# State

Operational snapshot — update when the Work Item, branch, milestone, or exit-gate status changes.

| Field | Value |
| --- | --- |
| Milestone | **M4 — Planning & Scheduling** (M3 remains Exit Gate **FAIL — ACCEPTED**, not COMPLETE) |
| Status | **M4 ACTIVE / LOCAL ONLY** — M4.2 in flight. M4.3–M4.9 later |
| Default branch | `main` |
| Main integration tip | `6e47d9fb050dcc49b120dd511b9de55634cd4e13` (M4.1 squash merge) |
| Homologated Local RC tip | `6104276754607334c53c6864135d29c539db813e` |
| Active Work Item | **M4.2 — Planning Shell & Unified List Projection** |
| Active branch | `m4-2-planning-shell-list` |
| Active Issue | [#56](https://github.com/Bruno2K/monolito-amber/issues/56) |
| Canonical Notion | [M4.2](https://app.notion.com/p/3ec678e54c8d8155b715c1309a86627c) · [Pack](https://app.notion.com/p/3ec678e54c8d812d9936e6291e8d07f7) |
| Closed M3.9 | [#50](https://github.com/Bruno2K/monolito-amber/issues/50) / [#51](https://github.com/Bruno2K/monolito-amber/pull/51) **MERGED**; reviewed tip `11d0782509b985eae1919101970e908b5b8e5048`; Reviewer **PASS (audit WI only)** |
| M3.9 Exit Gate | **FAIL — ACCEPTED** (accepted debt — not M4 scope) |
| M3.8 Exit Gate | **not claimed** — frozen |
| Authorization | Bruno 2026-10-01 via Altair — **M4 ACTIVE / LOCAL ONLY**; M4.1 READY only. Do not chase EG-OPS-STAGING-URL / EG-OPS-PAAS-SHA / Vercel / Railway / public URL. |
| Residuals (OPEN) | F-08 / F-10 / RPO-RTO / PaaS; WIN-PS1 accepted residual (supported path = Docker Desktop + WSL2 + bash) |
| Forbidden claims | Exit Gate PASS; M3 COMPLETE; M4 COMPLETE; inventing cloud secrets or a public URL; starting M4.3+ mutation surfaces |

## Current boundary

M3.1–M3.8 pack, RC1, and the M3.9 audit WI are on `main`. Bruno homologated LOCAL RC. The M3.9 Exit Gate result is **FAIL — ACCEPTED** (shared staging / PaaS SHA unproven). That debt is **accepted**, not transferred into M4 implementation.

**M4 is ACTIVE / LOCAL ONLY.** **M4.1 is MERGED.** **M4.2** implements the authenticated Planning shell and unified List projection (`GET …/planning`, `/projects/:projectId/planner`). Kanban, Gantt, Milestone workflows, and Task mutations remain later WIs. Engineer does not self-PASS Exit Gate.
