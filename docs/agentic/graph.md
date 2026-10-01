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
- **M2.6** Governance Gates & Exceptions Experience — **COMPLETE / PASS** (Figma + docs evidence; PR #20 OPEN, do not merge)
- **M2.7** Overview & Portfolio Health Reconciliation — **COMPLETE / PASS** (Figma + docs; PR #22 OPEN; base = M2.6 branch **NOT** main; leave OPEN)
- **M2.8** Activity Experience — **COMPLETE / PASS** (Figma + docs; PR #24 OPEN; base = M2.7 branch **NOT** main; leave OPEN)
- **M2.9** — NEXT in Notion; not started

## Stacking chain

```
main (PF-1.7)
  └── m2.6-governance-gates-exceptions-experience @ 0dbf9b2…  (PR #20 OPEN)
        └── m2.7-overview-portfolio-health @ 85852e6…  (PR #22 OPEN)
              └── m2.8-activity-experience  (this WI; PR base = M2.7 branch)
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
- Next.js Atividade app implementation (post-UX)

## UX / Figma boundary

M2.8 **authorizes** Project Atividade product screens in Figma `fkE9SwcNlQG7m0HvcGQBw9` and repo evidence under `docs/ux/`. It does **not** authorize backend schema/API/event store, Audit product UX, Notifications, Messaging content promotion into Activity, or Calendar private content in Activity.
