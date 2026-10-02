# State

Operational snapshot — update when the Work Item, branch, milestone, or exit-gate status changes.

| Field | Value |
| --- | --- |
| Milestone | **M4 — Planning & Scheduling** (M3 remains Exit Gate **FAIL — ACCEPTED**, not COMPLETE) |
| Status | **M4 ACTIVE / LOCAL ONLY** — M4.1–M4.7 MERGED. M4.8 in flight. M4.9 LOCKED |
| Default branch | `main` |
| Main integration tip | `0c1cc2632b47685e3e7bb9107e1eb51be361512d` (M4.7 squash merge) |
| Homologated Local RC tip | `6104276754607334c53c6864135d29c539db813e` (M3; M4.8 is LOCAL RC READY FOR BRUNO — not homologated) |
| Active Work Item | **M4.8 — Cross-Domain Integration, E2E & Local RC** |
| Active branch | `m4-8-cross-domain-local-rc` |
| Active Issue | [#68](https://github.com/Bruno2K/monolito-amber/issues/68) |
| Canonical Notion | [M4.8](https://app.notion.com/p/3ec678e54c8d81319b25f4a0c317612c) · [Pack](https://app.notion.com/p/3ec678e54c8d812d9936e6291e8d07f7) |
| Authorization | Bruno runway M4.1→M4.9 autonomous; **LOCAL ONLY**. Do not chase EG-OPS-STAGING-URL / EG-OPS-PAAS-SHA / Vercel / Railway / public URL. |
| Residuals (OPEN) | F-08 / F-10 / RPO-RTO / PaaS; WIN-PS1 accepted residual (supported path = Docker Desktop + WSL2 + bash) |
| Forbidden claims | Exit Gate PASS; M3 COMPLETE; M4 COMPLETE; Local RC homologation; inventing cloud secrets or a public URL; M4.9 |

## Current boundary

**M4.1–M4.7 are MERGED.** **M4.8** packages the Local RC (golden path, cross-view consistency, AuthZ, evidence). Engineer does not self-PASS Independent Review, Exit Gate, or homologation. M4.9 remains LOCKED.
