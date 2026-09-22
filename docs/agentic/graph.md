# Delivery graph

Platform Foundation progression (0.8 + current repo state):

1. **PF-1.0** Platform Foundation Bootstrap — **DONE**
2. **PF-1.1** Identity & Organizations — **DONE**
3. **PF-1.1R** Identity & Authorization Reconciliation — **DONE**
4. **PF-1.2** Project Membership / Contextual RBAC — **DONE**
5. **PF-1.3** Documents & Revisions Foundation — **ACTIVE** (CAS + scan fail-closed; no Impact/Issue)
6. Coordination (Impact Analysis auto-create on `CurrentRevisionChanged`; no auto Issues)
7. Notifications worker (Redis + BullMQ required)
8. Planning (0.5)
9. Governance (0.5; Formal Exception only)
10. Audit read UX (`organization.read_audit`)
11. Hardening (vendor choice, drills, LGPD process — retention OPEN)

## UX / Figma boundary

Platform Foundation and Identity slices may ship a technical web shell and generic auth routes (sign-in, MFA enroll/challenge, invite accept, password reset, org-switch).

**Not allowed** until an approved UX specification / Figma milestone: product-specific Documents, Revision, Impact/Issue/Task/Milestone, Gate screens, dashboards, or final product navigation.

Governor stops feature-UI execution at this boundary.
