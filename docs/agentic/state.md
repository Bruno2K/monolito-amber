# State

Operational snapshot — update when the Work Item, branch, or exit-gate status changes.

| Field | Value |
| --- | --- |
| Work Item | PF-1.5 — Planning / Tasks / Milestones |
| Status | ACTIVE |
| Issue | https://github.com/Bruno2K/monolito-amber/issues/13 |
| Branch | `pf-1.5-planning-tasks-milestones` |
| PR | (see open PR on this branch) |
| SHA | (see latest commit on the branch) |
| Repo | `Bruno2K/monolito-amber` |
| Base | `main` @ `404cfc5bdc9961f79392010bb012ba8f2b1a002a` (PF-1.4 merged) |
| Prior WI | PF-1.4 Coordination / Impact Analysis Foundation — DONE (PR #12, merge `404cfc5bdc9961f79392010bb012ba8f2b1a002a`) |
| Next WI | Governance / Gates / Formal Exceptions — after PF-1.5 Exit Gate |
| Exit Gate | Reviewer PASS + green CI; Governor merges |
| Merge | Not authorized from this slice |

## In-scope

1. Task lifecycle TODO→IN_PROGRESS→BLOCKED→DONE (+ CANCELLED); BLOCKED requires reason; lateness derived
2. Optional source Issue same Org/Project; standalone Tasks OK; Issue → 0..N Tasks
3. Assignment only to ACTIVE ProjectMembership
4. Finish-to-start TaskDependency; reject self/dup/cycle/cross-project; cannot IN_PROGRESS while prerequisite not DONE
5. Milestone PLANNED/AT_RISK/ACHIEVED/MISSED/CANCELLED; explicit achieve; derived AT_RISK/MISSED (ADR-016 baseline)
6. PF-1.2 AuthZ (`task.*` / `milestone.*`); never trust client projectId
7. Audit + idempotency on create/DONE/achieve/dependency
8. OpenAPI + ADR-016 + docs; isolation + PF-1.1R…1.4 regression; no `gate.override`; no Planning UI
