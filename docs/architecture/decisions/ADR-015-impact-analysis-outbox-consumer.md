# ADR-015 — Impact Analysis Outbox Consumer

## Status
Accepted (PF-1.4)

## Context
APPROVED 0.4 says a current-base change starts coordination, an Impact records source Revision / Project / context / assessor, and one Revision may create multiple Impacts. Final Reconciliation (and ADR-014) bind `CurrentRevisionChanged` to **exactly one Impact Analysis case** in `PENDING_ANALYSIS`, never automatic IMPACTED rows or Issues.

0.2A’s closed catalog has `issue.*` permissions and no `impact.*` codes. Adding catalog codes would invent AuthZ semantics.

PF-1.3 already writes `CurrentRevisionChanged` and `NewBaseEstablished` (same payload, same correlation id) to the transactional outbox. Redis / BullMQ is reserved for later justified jobs (notifications, scan).

## Decision
- Coordination owns an idempotent in-process outbox consumer. Delivery is **synchronous in the make-current transaction** after the outbox rows are written (`OutboxProcessor.processIds`). No Redis/BullMQ is introduced for this slice.
- Both companion events share `impactAnalysisChangeKey(correlationId, documentId, previousRevisionId, newRevisionId)`. The first processed event creates the case; the second is a no-op. Unique `change_key` is the at-most-one guarantee.
- Auto-create status is always `PENDING_ANALYSIS`. Assessment (assessor, timestamp, rationale, IMPACTED | NOT_IMPACTED) is an explicit `issue.update` action. Impact resolve is an explicit `issue.resolve` action and is denied while linked Issues are open/active (including `RESOLVED`, which is not `CLOSED`).
- Issues are created only by explicit APIs: Issue-from-Impact (only when the case is `IMPACTED`) or manual Issue (`origin=MANUAL`). Client `organizationId` / `projectId` / `origin` never establish authority.
- Severity ≠ Priority. Responsible discipline ≠ assignee. `RESOLVED` ≠ `CLOSED`.
- Comments and evidence are persisted on the Issue timeline. There is no Coordination UI, board, or product nav.
- No Task / Milestone / Gate / Formal Exception tables.
- Coordination never mutates `Document.currentRevisionId`, Revision lifecycle, or file-trust.

This is a clarification of 0.4 §2 “one Revision may create multiple Impacts”: auto-create is one **analysis case** per change event. Multiple concrete Issues may follow explicit assessment. Per-discipline Impact rows are not auto-created.

## Alternatives
- Auto-create per-discipline IMPACTED rows — rejected: Final Reconciliation + binding rule.
- Auto-create Issues from make-current — rejected: same.
- Add `impact.assess` / `impact.resolve` to the 0.2A catalog — rejected: closed catalog; map assessment to `issue.update` and resolve to `issue.resolve`.
- Redis/BullMQ consumer solely for this handler — rejected: existing outbox + sync drain is sufficient; worker remains scaffolded.
- Change the PF-1.3 `CurrentRevisionChanged` payload — rejected: identifiers-only contract stays.

## Consequences
Make-current now atomically creates the analysis case when Coordination handlers are registered. Replaying the same outbox pair cannot create a second case. A later async worker may drain the same outbox without changing the change-key contract.

## Implementation Implications
Migration `20260922210000_pf_1_4_coordination_impact`. Schema `coordination`. Tests drain via the same in-process processor.

## Supersedes
None. Completes the handler reserved by ADR-010 / ADR-014.
