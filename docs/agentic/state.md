# State

Operational snapshot — update when the Work Item, branch, milestone, or exit-gate status changes.

| Field | Value |
| --- | --- |
| Milestone | **M4 — Planning & Scheduling** (M3 remains Exit Gate **FAIL — ACCEPTED**, not COMPLETE) |
| Status | **M4 ACTIVE / LOCAL ONLY** — M4.1–M4.5 MERGED. M4.6 in flight. M4.7–M4.9 later |
| Default branch | `main` |
| Main integration tip | `8c099c4b72ec240f65f9538b8b38350eee6b1cb0` (M4.5 squash merge) |
| Homologated Local RC tip | `6104276754607334c53c6864135d29c539db813e` |
| Active Work Item | **M4.6 — Timeline / Gantt Projection** |
| Active branch | `m4-6-gantt-projection` |
| Active Issue | [#64](https://github.com/Bruno2K/monolito-amber/issues/64) |
| Canonical Notion | [M4.6](https://app.notion.com/p/3ec678e54c8d81af9d70e89687b24143) · [Pack](https://app.notion.com/p/3ec678e54c8d812d9936e6291e8d07f7) |
| Closed M3.9 | [#50](https://github.com/Bruno2K/monolito-amber/issues/50) / [#51](https://github.com/Bruno2K/monolito-amber/pull/51) **MERGED**; reviewed tip `11d0782509b985eae1919101970e908b5b8e5048`; Reviewer **PASS (audit WI only)** |
| M3.9 Exit Gate | **FAIL — ACCEPTED** (accepted debt — not M4 scope) |
| M3.8 Exit Gate | **not claimed** — frozen |
| Authorization | Bruno runway M4.1→M4.9 autonomous; **LOCAL ONLY**. Do not chase EG-OPS-STAGING-URL / EG-OPS-PAAS-SHA / Vercel / Railway / public URL. |
| Residuals (OPEN) | F-08 / F-10 / RPO-RTO / PaaS; WIN-PS1 accepted residual (supported path = Docker Desktop + WSL2 + bash) |
| Forbidden claims | Exit Gate PASS; M3 COMPLETE; M4 COMPLETE; inventing cloud secrets or a public URL; Milestone-workflow scope (M4.7) |

## Current boundary

M3.1–M3.8 pack, RC1, and the M3.9 audit WI are on `main`. Bruno homologated LOCAL RC. The M3.9 Exit Gate result is **FAIL — ACCEPTED** (shared staging / PaaS SHA unproven). That debt is **accepted**, not transferred into M4 implementation.

**M4 is ACTIVE / LOCAL ONLY.** **M4.1–M4.5 are MERGED.** **M4.6** implements Timeline/Gantt as a projection over the accepted Planning read-model. Milestone workflows remain M4.7. Engineer does not self-PASS Exit Gate.
