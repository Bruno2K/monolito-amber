# State

Operational snapshot — update when the Work Item, branch, or exit-gate status changes.

| Field | Value |
| --- | --- |
| Work Item | PF-1.2 — Project Membership / Contextual RBAC |
| Status | ACTIVE |
| Issue | https://github.com/Bruno2K/monolito-amber/issues/7 |
| Branch | `pf-1.2-project-membership-contextual-rbac` |
| PR | https://github.com/Bruno2K/monolito-amber/pull/8 |
| SHA | (see latest commit on the branch) |
| Repo | `Bruno2K/monolito-amber` |
| Base | `main` @ `3ebb855a1adf955512609e02161d81a8e9bc3f4d` (PF-1.1R merged) |
| Prior WI | PF-1.1R Identity & Authorization Reconciliation — DONE (PR #6, merge `3ebb855a`) |
| Next WI | Documents & Revisions (CAS + scan fail-closed) — after PF-1.2 Exit Gate |
| Exit Gate | Reviewer PASS + green CI; Governor merges |
| Merge | Not authorized from this slice |

## In-scope

1. Amber Role Templates ≠ operational AuthZ grants; org-owned RoleDefinitions instantiated on Organization create
2. First-class ProjectMembership (`ACTIVE|SUSPENDED|REMOVED`) gated by ACTIVE OrgMembership
3. Per-project role assignment to same-org RoleDefinitions; permission union inside that Project
4. Explicit org-scoped vs project-scoped AuthZ; never trust client `projectId`
5. Project Coordinator limits and `project.assign_roles` SoD (no self-escalation)
6. External collaborator isolation negatives
7. Preserve PF-1.1R MFA / registration / revocation; no `gate.override`; no product pages
