# Module boundaries

Exact module names from APPROVED 0.1. Feature code does **not** join across module schemas; compose via application services and IDs.

| Module | Owns | Notes for PF-1.5 |
| --- | --- | --- |
| Identity & Access | User, AuthenticationIdentity, credential, session, invite, reset, MFA TOTP | AuthN floors from 0.2A |
| Organizations | Organization, membership, Role/Permission definitions | Seed 0.2A catalog + templates; membership lifecycle |
| Projects | Project (empreendimento), ProjectMembership, ProjectRoleAssignment | Contextual RBAC; no product pages |
| Documents & Revisions | Document, Revision, current pointer, files | PF-1.3: lifecycle + file-trust. Writes outbox only |
| Coordination | Impact Analysis, Issue, comments, evidence | PF-1.4: consume outbox; no UI; never mutates Revision |
| Planning | Task, TaskDependency, Milestone | PF-1.5: lifecycle + FS deps + derived AT_RISK/MISSED. No UI |
| Governance | Gate, requirement, Formal Exception | **Not implemented.** No `gate.override` |
| Audit | Append-only audit events | Insert-only app role |
| Notifications | Notification delivery | Worker later |

Dependency direction: Governance **reads** Planning/Coordination; it does not mutate upstream. Coordination never mutates the Revision lifecycle.

Project = empreendimento. Issue is the only coordination problem entity (*pendência* is a synonym). Task ≠ Issue.
