# State

Operational snapshot — update when the Work Item, branch, milestone, or exit-gate status changes.

| Field | Value |
| --- | --- |
| Milestone | **M5 — Calendars & Collaboration** (M3 remains Exit Gate **FAIL — ACCEPTED**, not COMPLETE) |
| Status | **M5 ACTIVE / LOCAL ONLY** — M5.1 in flight. M5.2–M5.9 LOCKED. Not M5 COMPLETE |
| Default branch | `main` |
| Main integration tip | `9159889de55b73bbe7cb4eb1e7700f7c4a57fcef` (Polish C; parent M4.9 `fc0aee18975ba85753f251fb2fb8b0b0f2dee8d8`) |
| Homologated Local RC tip | `76d44de81857db5a25cd6bf285a3eda19c8aded1` (M4.8.1; Bruno accepted 2026-10-02) |
| Active Work Item | **M5.1 — Contract, Schema & Authorization Baseline** |
| Active branch | `m5-1-contract-schema-authz` |
| Active Issue | [#82](https://github.com/Bruno2K/monolito-amber/issues/82) |
| Canonical Notion | [M5.1](https://app.notion.com/p/3ed678e54c8d81dfaf88e9b4e55fe2f4) · [Pack](https://app.notion.com/p/3ed678e54c8d819c870ff466a2738b4c) |
| Authorization | GPT Preflight PASS · **LOCAL ONLY**. M5.1 READY/ACTIVE only. Do not chase Vercel / Railway / public URL. Do not start M5.2–M5.9. |
| Residuals (OPEN) | F-08 / F-10 / RPO-RTO / PaaS; WIN-PS1 accepted residual (supported path = Docker Desktop + WSL2 + bash) |
| Forbidden claims | Exit Gate PASS; M3 COMPLETE; M5 COMPLETE; unlocking M5.2/M5.4; inventing cloud secrets or a public URL |

## Current boundary

**M4 is COMPLETE / locally approved** (Pack 2026-10-02; M4.9 merged `fc0aee1…`). **M5.1** freezes Calendar + Messaging contracts, additive schema, reserved AuthZ, and fixtures. Engineer does not self-PASS Exit Gate or unlock Calendar/Messaging lanes. Cloud remains disabled (`deploy-cloud.yml` `if: false`).
