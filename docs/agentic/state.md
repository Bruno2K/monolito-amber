# State

Operational snapshot — update when the Work Item, branch, or exit-gate status changes.

| Field | Value |
| --- | --- |
| Work Item | M2.8 — Activity Experience |
| Status | ACTIVE |
| Issue | https://github.com/Bruno2K/monolito-amber/issues/23 |
| Branch | `m2.8-activity-experience` (to open) |
| PR | (to open — stacked; do not merge; URL in PR) |
| Repo | `Bruno2K/monolito-amber` |
| Base | `m2.7-overview-portfolio-health` @ `85852e6` |
| Prior WI | M2.7 — Overview & Portfolio Health — COMPLETE/PASS (PR #22 OPEN; do not merge) |
| Prior prior | M2.6 — Governance Gates & Exceptions — COMPLETE/PASS (PR #20 OPEN; do not merge) |
| Prior domain | PF-1.7 Platform Foundation Exit Reconciliation — DONE on main (`49588c3…`) |
| Next WI | M2.9 stacks from this branch tip after PR open (do not wait for merge) |
| Exit Gate | IN_PROGRESS (Figma + docs evidence; leave PR open) |
| Merge | DO NOT MERGE — leave OPEN |

## Stacking note

**PR base MUST be** `m2.7-overview-portfolio-health`, **NOT** `main`. M2.7 PR #22 and M2.6 PR #20 remain OPEN. Do not wait for merge.

## In-scope

1. Complete Project Atividade product UX in Figma `fkE9SwcNlQG7m0HvcGQBw9`
2. Evidence doc `docs/ux/m2.8-activity-experience.md` + screenshots under `docs/ux/evidence/m2.8/`
3. Update `docs/agentic/{state,context,graph}.md` for M2.8 ACTIVE (note stack: #20+#22 still open; base M2.7 tip)
4. Light docs/README pointer to UX evidence
5. One stacked PR `Closes #23`, left OPEN

## Out of scope

Backend schema/API/event store, Audit read UX productization, Notifications, Messaging, Calendar private content, M2.9+, Bruno2K/amber, merging #20, #22, or this PR.
