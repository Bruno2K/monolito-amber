# State

Operational snapshot — update when the Work Item, branch, or exit-gate status changes.

| Field | Value |
| --- | --- |
| Work Item | PF-1.3 — Documents & Revisions Foundation |
| Status | ACTIVE |
| Issue | https://github.com/Bruno2K/monolito-amber/issues/9 |
| Branch | `pf-1.3-documents-revisions-foundation` |
| PR | (see open PR on this branch) |
| SHA | (see latest commit on the branch) |
| Repo | `Bruno2K/monolito-amber` |
| Base | `main` @ `dee5861b84224f7ea46b4e8bd978c1548a91a71a` (PF-1.2 merged) |
| Prior WI | PF-1.2 Project Membership / Contextual RBAC — DONE (PR #8, merge `dee5861b84224f7ea46b4e8bd978c1548a91a71a`) |
| Next WI | Coordination / Impact Analysis on `CurrentRevisionChanged` — after PF-1.3 Exit Gate |
| Exit Gate | Reviewer PASS + green CI; Governor merges |
| Merge | Not authorized from this slice |

## In-scope

1. Stable Document (Project+Org; archive not hard-delete; identity ≠ filename/storage key)
2. Revision lifecycle DRAFT → PUBLISHED → UNDER_REVIEW → APPROVED\|REJECTED
3. Immutability at PUBLISHED; REJECTED preserved; currentness via `Document.currentRevisionId`
4. File trust on StoredObject (PENDING/CLEAN/BLOCKED fail-closed; vendor OPEN)
5. Publish / review / approve / reject / make-current + rollback with SoD and CAS
6. Outbox `CurrentRevisionChanged` / `NewBaseEstablished` without Impact/Issue
7. Naming validation boundary; Idempotency-Key; OpenAPI 3.1 + Problem Details
8. Preserve PF-1.1R / PF-1.2; no `gate.override`; no final Documents UI
