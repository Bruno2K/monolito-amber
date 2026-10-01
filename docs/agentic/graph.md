# Delivery graph

Platform Foundation progression (complete on main):

1. **PF-1.0** Platform Foundation Bootstrap — **DONE**
2. **PF-1.1** Identity & Organizations — **DONE**
3. **PF-1.1R** Identity & Authorization Reconciliation — **DONE**
4. **PF-1.2** Project Membership / Contextual RBAC — **DONE**
5. **PF-1.3** Documents & Revisions Foundation — **DONE**
6. **PF-1.4** Coordination / Impact Analysis Foundation — **DONE**
7. **PF-1.5** Planning / Tasks / Milestones — **DONE**
8. **PF-1.6** Governance / Gates / Formal Exceptions — **DONE** (`887d598…`)
9. **PF-1.7** Platform Foundation Exit Reconciliation — **DONE** (`49588c3…`)

## M2 — Product Experience Foundation

- **M2.1..M2.5** — prior Figma product surfaces (Shell, Planning, Calendar, Messages, Team) — delivered in canonical Figma
- **M2.6** Governance Gates & Exceptions Experience — **ACTIVE** (Figma + docs; PR #20 OPEN on `main`; do not merge)
- **M2.7** Overview & Portfolio Health Reconciliation — **ACTIVE** (Figma + docs; stacked on M2.6 tip; PR #22 OPEN; base = M2.6 branch **NOT** main; leave OPEN)
- **M2.8** Activity Experience — **ACTIVE** (Figma + docs; stacked on M2.7; PR #24 OPEN; base = M2.7 branch **NOT** main; leave OPEN)
- **M2.9** Prototype & State Coverage — **ACTIVE** (transversal Figma + docs; stacked on M2.8 @ `762ab787…`; PR #26 OPEN on `m2.9-prototype-state-coverage`; base = M2.8 branch **NOT** main; loop-2 orphan wiring; leave OPEN)
- **M2.10** — NEXT only (Governor activation required; do **not** execute now)

## Stacking chain

```
main (PF-1.7)
  └── m2.6-governance-gates-exceptions-experience @ c653ef2…  (PR #20 OPEN)
        └── m2.7-overview-portfolio-health @ c3638e34…  (PR #22 OPEN)
              └── m2.8-activity-experience @ 762ab787…  (PR #24 OPEN)
                    └── m2.9-prototype-state-coverage @ (loop-2 head TBD)  (PR #26 OPEN; base = M2.8 branch)
```

## Deferred (not this PR)

- Notifications worker / Redis / BullMQ
- PaaS / hosting vendor / malware vendor
- LGPD process / retention / RPO / RTO
- Gate Templates
- Analytics warehouse / health persistence SoT
- Dashboard builder
- Audit read UX productization
- Activity event store / API productization
- Next.js app implementation (post-UX)
- **M2.10**

## UX / Figma boundary

M2.9 **authorizes** transversal prototype/state/AuthZ/a11y consolidation artifacts in Figma `fkE9SwcNlQG7m0HvcGQBw9` and repo evidence under `docs/ux/`. It does **not** authorize backend schema/API/domain/AuthZ catalog changes, redesign of approved M2.1–M2.8 screens, or M2.10.
