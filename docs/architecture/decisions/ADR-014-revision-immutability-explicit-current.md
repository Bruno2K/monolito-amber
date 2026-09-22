# ADR-014 — Revision Immutability & Explicit Current Revision

## Status
Accepted (PF-1.3)

## Context
APPROVED 0.3 models a Document as a stable artifact and a Revision as one version of that artifact. Publication locks content. Approval and currentness are separate. 0.3 §5 describes an approved revision becoming “historical/superseded” when another becomes current, and §17 requires rollback of a previously approved historical Revision without inventing a fake new Revision.

A terminal `SUPERSEDED` status would block that rollback. PF-1.3 (Bruno brief + Issue #9) therefore binds currentness to `Document.currentRevisionId`, not to a blocking status. This is a clarification of 0.3 §5 + §8 + §17, not a rewrite of 0.3.

## Decision
- Document identity is a UUID (+ project-scoped `code`). It is never a filename or storage key.
- Revision lifecycle is `DRAFT → PUBLISHED → UNDER_REVIEW → APPROVED | REJECTED`.
- DRAFT is mutable. Immutability of file bytes, checksum, revision code, and storage key starts at `PUBLISHED`.
- `REJECTED` rows are preserved and remain historically visible.
- Currentness is `Document.currentRevisionId` plus optimistic `Document.version` CAS. At most one current Revision.
- Only `APPROVED` Revisions may become current. Historical approved Revisions keep status `APPROVED`.
- Rollback is the same make-current operation against an older `APPROVED` Revision, requires a reason, and is audited.
- Make-current writes `CurrentRevisionChanged` and `NewBaseEstablished` to the transactional outbox with identifiers only. PF-1.3 does **not** create Impact or Issue rows (0.4).
- SoD: the publisher cannot approve, reject, or make-current their own Revision.
- File trust reuses `StoredObject.scan_status` (`PENDING` / `CLEAN` / `BLOCKED`) fail-closed. Scanner vendor remains OPEN.
- Naming validation is an extensible structural boundary. No invented client BIM / ISO 19650 rules.

## Alternatives
- Terminal `SUPERSEDED` status — rejected: blocks 0.3 rollback.
- Treat publication as make-current — rejected: 0.3 separates publish, approve, and current.
- Auto-create Impact on make-current in this slice — rejected: Coordination owns that handler.

## Consequences
Org-owned roles may compose `revision.make_current` / `document.archive` from the closed 0.2A catalog; default Amber templates do not grant those two codes. Tests compose them onto Organization-owned RoleDefinitions.

## Implementation Implications
Migration `20260922200000_pf_1_3_documents_revisions`. Database triggers enforce tenant binding, “current must be APPROVED”, and published-byte immutability.

## Supersedes
None. Clarifies PF-1.0/1.2 placeholder wording that listed SUPERSEDED as a status.
