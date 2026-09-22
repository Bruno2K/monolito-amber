# Delivery graph

Platform Foundation progression (0.8 + current repo state):

1. **PF-1.0** Platform Foundation Bootstrap — **DONE**
2. **PF-1.1** Identity & Organizations — **DONE**
3. **PF-1.1R** Identity & Authorization Reconciliation — **DONE**
4. **PF-1.2** Project Membership / Contextual RBAC — **DONE**
5. **PF-1.3** Documents & Revisions Foundation — **DONE**
6. **PF-1.4** Coordination / Impact Analysis Foundation — **DONE**
7. **PF-1.5** Planning / Tasks / Milestones — **DONE**
8. **PF-1.6** Governance / Gates / Formal Exceptions — **DONE** (`887d598ef69eb6898e445810863511e291cbee49`)
9. **PF-1.7** Platform Foundation Exit Reconciliation — **ACTIVE**
10. Exit Gate — **FINAL_REVIEW** (`READY_FOR_FINAL_REVIEW`)
11. Next Work Item — **HUMAN_ACTIVATION_REQUIRED** (Governor only; do not auto-activate)

## Deferred (not next)

These remain explicit and unactivated:

- Notifications worker
- Redis / BullMQ (justified jobs)
- PaaS / hosting vendor
- Malware scan vendor
- LGPD process / retention periods
- RPO / RTO
- Gate Templates
- Audit read UX (`organization.read_audit`)

## UX / Figma boundary

Platform Foundation and Identity slices may ship a technical web shell and generic auth routes (sign-in, MFA enroll/challenge, invite accept, password reset, org-switch).

**Not allowed** until an approved UX specification / Figma milestone: product-specific Documents, Revision, Impact/Issue/Task/Milestone, Gate screens, dashboards, or final product navigation.

Governor stops feature-UI execution at this boundary.
