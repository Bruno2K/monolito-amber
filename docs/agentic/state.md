# State

Operational snapshot — update when the Work Item, branch, or exit-gate status changes.

| Field | Value |
| --- | --- |
| Work Item | M2.9 — Prototype & State Coverage |
| Status | **CORRECTION LOOP** |
| Issue | https://github.com/Bruno2K/monolito-amber/issues/25 |
| Branch | `m2.9-prototype-state-coverage` |
| PR | https://github.com/Bruno2K/monolito-amber/pull/26 (OPEN — do not merge) |
| Repo | `Bruno2K/monolito-amber` |
| Base | `m2.8-activity-experience` @ `762ab787943eba83e8185967094b9f3f91b7cae3` |
| Audited head (pre-correction) | `e5cbc6e20a5d84b056a21ce0dc552dafebe8f492` |
| Previous pack head | `917e95a983b7796b341d72c8e19b326cdd3a2101` |
| Head | `PENDING_HEAD_SHA` |
| Prior WI | M2.8 — Activity Experience — PR #24 OPEN (do not merge); do not claim ACTIVE for M2.6–M2.8 beyond their open PRs |
| Stack open | #20 (M2.6) · #22 (M2.7) · #24 (M2.8) · #26 (M2.9) — all OPEN |
| Next WI | M2.10 NEXT only after Governor activation (do **not** start M2.10 now) |
| Exit Gate | **CORRECTION LOOP** (Reviewer REQUEST_CHANGES on `917e95a…`; Engineer must not declare PASS) |
| Merge | DO NOT MERGE — leave OPEN |

## Stacking note

**PR base MUST be** `m2.8-activity-experience`, **NOT** `main`. Do not wait for merge of #20/#22/#24. Do not start M2.10. Do not open a new PR — update existing PR #26 on the same branch.

## Correction LOOP (2026-10-01)

Independent audit on `e5cbc6e…` vacated prior PASS. Pack `917e95a…` cleared same-node multi-dest / whole-frame / orphans. Reviewer REQUEST_CHANGES on that head: SHA TBD leftover; Wiring `304:16608` clipped `304:16606` (~6px); 15 overlapping different-dest hotspots.

This loop: footer h 50→56; parent-container NAVIGATE cleared; M2.4 ProtoNav unstacked; Wiring PNG regenerated; docs SHA synced. Status remains **CORRECTION LOOP**.

## In-scope

1. Figma navigation ambiguity + hotspot fixes on page `04 — Telas`
2. M2.9 overlap/clip fixes + regenerated PNGs
3. State honesty annotations (M2.3/M2.5) + node-ID matrix
4. Traceable inventory + corrected evidence doc
5. Agentic docs sync (CORRECTION LOOP; PR #26 OPEN; head `PENDING_HEAD_SHA`)
6. Push onto existing PR #26 only

## Out of scope

Backend schema/API/domain/AuthZ catalog; redesign of approved M2.1–M2.8; M2.10; Bruno2K/amber; merging #20, #22, #24, or #26; declaring Exit Gate PASS.
