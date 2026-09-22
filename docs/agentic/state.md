# State

Operational snapshot — update when the Work Item, branch, or exit-gate status changes.

| Field | Value |
| --- | --- |
| Work Item | PF-1.4 — Coordination / Impact Analysis Foundation |
| Status | ACTIVE |
| Issue | https://github.com/Bruno2K/monolito-amber/issues/11 |
| Branch | `pf-1.4-coordination-impact-foundation` |
| PR | (see open PR on this branch) |
| SHA | (see latest commit on the branch) |
| Repo | `Bruno2K/monolito-amber` |
| Base | `main` @ `c4d9dffaad275f6419e5ff1fc8b732e690cfac3d` (PF-1.3 merged) |
| Prior WI | PF-1.3 Documents & Revisions Foundation — DONE (PR #10, merge `c4d9dffaad275f6419e5ff1fc8b732e690cfac3d`) |
| Next WI | Planning / Notifications — after PF-1.4 Exit Gate |
| Exit Gate | Reviewer PASS + green CI; Governor merges |
| Merge | Not authorized from this slice |

## In-scope

1. Idempotent outbox consumer for `CurrentRevisionChanged` / `NewBaseEstablished`
2. Exactly one Impact Analysis case (`PENDING_ANALYSIS`) per change event
3. Explicit assessment + Impact resolve blocked while linked Issues are open/active
4. Issue foundation (RESOLVED ≠ CLOSED; Severity ≠ Priority; discipline ≠ assignee; origin IMPACT \| MANUAL)
5. Explicit Issue-from-Impact + manual Issue; project-scoped `issue.*`
6. Minimal comments/evidence (no collaboration UI)
7. Audit + OpenAPI + ADR-015; no Task/Planning/Gate/Exception tables
8. Preserve PF-1.1R / PF-1.2 / PF-1.3; no `gate.override`; no Coordination UI
