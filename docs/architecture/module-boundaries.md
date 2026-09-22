# Module boundaries

Exact module names from APPROVED 0.1. Feature code does **not** join across module schemas; compose via application services and IDs.

| Module | Owns | Notes for PF-1.0 |
| --- | --- | --- |
| Identity & Access | User, credential, session, invite, reset, MFA TOTP skeleton | AuthN floors from 0.2A |
| Organizations | Organization, membership, Role/Permission definitions | Seed 0.2A catalog + templates |
| Projects | Project (empreendimento), later disciplines/membership | Skeleton only |
| Documents & Revisions | Document, Revision, current pointer, files | **Not implemented.** File-trust primitive (`scan_status`) only |
| Coordination | Impact, Issue, comments, evidence | **Not implemented.** Outbox event name reserved |
| Planning | Task, TaskDependency, Milestone | **Not implemented** |
| Governance | Gate, requirement, Formal Exception | **Not implemented.** No `gate.override` |
| Audit | Append-only audit events | Insert-only app role |
| Notifications | Notification delivery | Worker later |

Dependency direction: Governance **reads** Planning/Coordination; it does not mutate upstream. Coordination never mutates the Revision lifecycle.

Project = empreendimento. Issue is the only coordination problem entity (*pendência* is a synonym). Task ≠ Issue.
