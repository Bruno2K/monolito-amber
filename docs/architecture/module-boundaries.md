# Module boundaries

Exact module names from APPROVED 0.1, plus Operations (M3.1 / ADR-018). Feature code does **not** join across module schemas; compose via application services and IDs.

| Module | Owns | Notes for PF-1.6 |
| --- | --- | --- |
| Identity & Access | User, AuthenticationIdentity, credential, session, invite, reset, MFA TOTP | AuthN floors from 0.2A |
| Organizations | Organization, membership, Role/Permission definitions, Discipline catalog, Team | Seed closed catalog + templates; membership lifecycle. TeamMembership ≠ Project access |
| Projects | Project (empreendimento), ProjectMembership, ProjectRoleAssignment | Contextual RBAC; no product pages |
| Documents & Revisions | Document, Revision, current pointer, files | PF-1.3: lifecycle + file-trust. Writes outbox only |
| Coordination | Impact Analysis, Issue, comments, evidence | PF-1.4: consume outbox; no UI; never mutates Revision |
| Planning | Task, TaskDependency, Milestone | PF-1.5: lifecycle + FS deps + derived AT_RISK/MISSED. No UI |
| Operations | Phase, Deliverable, WorkPackage | M3.1 contract (ADR-018). Schema/API/UI in M3.3–M3.5. Reads via `project.read`. No `gate.override` |
| Governance | Gate, requirement, Formal Exception, release evidence | PF-1.6: evaluate + explicit release + Exception lifecycle. Reads upstream via adapters. No `gate.override` |
| Audit | Append-only audit events | Insert-only app role |
| Notifications | Notification delivery | Worker later |

Dependency direction: Governance **reads** Planning/Coordination; it does not mutate upstream. Coordination never mutates the Revision lifecycle.

Project = empreendimento. Issue is the only coordination problem entity (*pendência* is a synonym). Task ≠ Issue. Phase ≠ Deliverable ≠ WorkPackage. Deliverable ≠ Document. WorkPackage ≠ Task.
