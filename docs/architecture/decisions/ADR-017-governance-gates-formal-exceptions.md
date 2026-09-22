# ADR-017 — Governance Gates and Formal Exceptions

## Status
Accepted (PF-1.6)

## Context
APPROVED 0.5 separates Planning (work) from Governance (whether the project may advance). PF-1.5 implemented Task / Milestone only. This slice implements Gate, typed GateRequirement, Formal Exception, and durable release evidence.

Binding invariants:

- READY ≠ RELEASED — evaluation never auto-releases.
- Formal Exception is the only bypass. There is no `gate.override`, `forceRelease`, or silent satisfaction.
- Exception coverage does not turn UNSATISFIED → SATISFIED.
- RELEASED ≠ RELEASED_WITH_EXCEPTION.
- Governance reads Documents / Coordination / Planning through adapters and must not mutate upstream.
- An Exception is requirement-specific (no gate-wide blanket).

Governor bindings HR-1…HR-7 apply: NOT_READY is never evaluated; BLOCKED is evaluated with an unsatisfied mandatory; create/configure use `gate.evaluate`; `exception.request` is granted to PROJECT_COORDINATOR; seven typed predicates live in requirement config JSON; CHECKLIST_COMPLETE is requirement-scoped; Gate Templates stay deferred.

## Decision
- Governance owns `Gate`, `GateRequirement`, `FormalException`, `GateReleaseDecision`, and used-exception links in the `governance` schema.
- Gate states are `NOT_READY | BLOCKED | READY | RELEASED | RELEASED_WITH_EXCEPTION`. READY means every mandatory requirement is SATISFIED. Exception coverage never produces READY; it only enables `RELEASED_WITH_EXCEPTION`.
- Requirement types: `DOCUMENT_REQUIRED`, `REVISION_APPROVED`, `ISSUE_STATE`, `TASK_STATE`, `MILESTONE_STATE`, `MANUAL_APPROVAL`, `CHECKLIST_COMPLETE`. Predicates are config JSON. Satisfaction and coverage are persisted as separate columns.
- Evaluation is deterministic and read-only against upstream modules. `gate.release` is explicit, CAS-protected (`expectedVersion`), and records immutable release evidence. NORMAL → RELEASED. WITH_EXCEPTION → RELEASED_WITH_EXCEPTION.
- Exception lifecycle is `REQUESTED → APPROVED | REJECTED`; `APPROVED → REVOKED`. Optional `expiresAt`. History is forward-only.
- SoD: requester ≠ approve/reject own Exception; requester ≠ release using own Exception. Approver may release if they hold `gate.release` and are not the requester.
- MFA (GOVERNANCE_APPROVER) + recent-auth apply to `exception.approve` / `reject` / `revoke` and `gate.release`.
- After `RELEASED_WITH_EXCEPTION`, revoke or expiry of a covering Exception plus still-UNSATISFIED re-evaluates the Gate to BLOCKED. The historical release row is not rewritten.
- AuthZ uses the closed 0.2A catalog. Create/configure require `gate.evaluate`. Release requires `gate.release`. PROJECT_COORDINATOR receives `exception.request` (seed refresh for existing orgs). No new catalog codes. No Gate Templates. No Governance UI.

## Alternatives
- `gate.override` / `forceRelease` / silent satisfaction — rejected (ADR-007, F-02).
- Exception flips `lastSatisfaction` to SATISFIED — rejected (0.5 invariant).
- Auto-release when evaluation becomes READY — rejected (READY ≠ RELEASED).
- Gate-wide blanket Exception — rejected (requirement-specific).
- Coordination Checklist module for CHECKLIST_COMPLETE — rejected (HR-6).
- Gate Templates in this slice — rejected (HR-7).
- Invented permission codes — rejected (closed 0.2A catalog).

## Consequences
OpenAPI documents `/projects/{projectId}/gates` and `/projects/{projectId}/exceptions`. Reviewers can see SATISFIED vs `coveredByException` on every evaluation, API, and audit payload. Planning / Coordination / Document rows are not written by Governance.

## Implementation Implications
Migration `20260922300000_pf_1_6_governance_gates_exceptions`. Schema `governance`. Tenant-binding triggers on every governance table. Seed additively refreshes org-owned PROJECT_COORDINATOR copies with `exception.request`. `assert:no-gate-override` remains a CI gate.

## Supersedes
None. Completes the Governance half of ADR-007 / 0.5 after ADR-016.
