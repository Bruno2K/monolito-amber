# State

Operational snapshot — update when the Work Item, branch, or exit-gate status changes.

| Field | Value |
| --- | --- |
| Work Item | PF-1.6 — Governance / Gates / Formal Exceptions |
| Status | ACTIVE |
| Issue | https://github.com/Bruno2K/monolito-amber/issues/15 |
| Branch | `pf-1-6-governance-gates-exceptions` |
| PR | https://github.com/Bruno2K/monolito-amber/pull/16 |
| SHA | `7e42ba59cbbd159e79ce2207bbfda6443c5d2b67` |
| Repo | `Bruno2K/monolito-amber` |
| Base | `main` @ `d6c64703325a71c7cc240a7b60d5516d93ac2b8f` (PF-1.5 merged) |
| Prior WI | PF-1.5 Planning / Tasks / Milestones — DONE (`d6c64703325a71c7cc240a7b60d5516d93ac2b8f`) |
| Next WI | Notifications worker / next Governor-activated slice — after PF-1.6 Exit Gate |
| Exit Gate | Reviewer PASS + green CI; Governor merges |
| Merge | Not authorized from this slice |

## In-scope

1. Gate / GateRequirement / FormalException / GateReleaseDecision + used-exception links; tenant triggers
2. States NOT_READY | BLOCKED | READY | RELEASED | RELEASED_WITH_EXCEPTION (READY ≠ RELEASED)
3. Seven typed predicates; SATISFIED vs exception coverage persisted separately
4. Read-only Document / Coordination / Planning adapters
5. Deterministic evaluate; explicit CAS `gate.release`; NORMAL vs WITH_EXCEPTION evidence
6. Exception lifecycle + SoD + MFA/recent-auth; revoke/expiry → BLOCKED; historical release immutable
7. Closed catalog; `exception.request` on PROJECT_COORDINATOR (+ seed refresh); no `gate.override`
8. OpenAPI + ADR-017 + docs; Tests A–I; no Governance UI; no Gate Templates
