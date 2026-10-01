# State

Operational snapshot — update when the Work Item, branch, or exit-gate status changes.

| Field | Value |
| --- | --- |
| Work Item | M2.7 — Overview & Portfolio Health Reconciliation |
| Status | ACTIVE |
| Issue | https://github.com/Bruno2K/monolito-amber/issues/21 |
| Branch | `m2.7-overview-portfolio-health` (to open) |
| PR | (to open — stacked; do not merge; URL in PR) |
| Repo | `Bruno2K/monolito-amber` |
| Base | `m2.6-governance-gates-exceptions-experience` @ `0dbf9b2` |
| Prior WI | M2.6 — Governance Gates & Exceptions Experience — COMPLETE/PASS (PR #20 OPEN; do not merge) |
| Prior domain | PF-1.7 Platform Foundation Exit Reconciliation — DONE on main (`49588c3…`) |
| Next WI | M2.8 stacks from this branch tip after PR open (do not wait for merge) |
| Exit Gate | IN_PROGRESS (Figma + docs evidence; leave PR open) |
| Merge | DO NOT MERGE — leave OPEN |

## Stacking note

**PR base MUST be** `m2.6-governance-gates-exceptions-experience`, **NOT** `main`. M2.6 PR #20 remains OPEN. Do not wait for M2.6 merge.

## In-scope

1. Complete Visão Geral + Todos os Projetos / Portfolio Health product UX in Figma `fkE9SwcNlQG7m0HvcGQBw9`
2. Evidence doc `docs/ux/m2.7-overview-portfolio-health.md` + screenshots under `docs/ux/evidence/m2.7/`
3. Update `docs/agentic/{state,context,graph}.md` for M2.7 ACTIVE (note stacked base; M2.6 PR #20 still open)
4. Light docs/README pointer to UX evidence
5. One stacked PR `Closes #21`, left OPEN

## Out of scope

Prisma, migrations, API, analytics warehouse, health persistence SoT, dashboard builder, Gate Templates, Messaging-as-health, M2.8+, Bruno2K/amber, merging #20 or this PR.
