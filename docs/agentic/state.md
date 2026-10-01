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
| Audited head | `e5cbc6e20a5d84b056a21ce0dc552dafebe8f492` |
| Head note | TBD until CloudAgent pushes correction onto PR #26 |
| Prior WI | M2.8 — Activity Experience — PR #24 OPEN (do not merge); do not claim ACTIVE for M2.6–M2.8 beyond their open PRs |
| Stack open | #20 (M2.6) · #22 (M2.7) · #24 (M2.8) · #26 (M2.9) — all OPEN |
| Next WI | M2.10 NEXT only after Governor activation (do **not** start M2.10 now) |
| Exit Gate | **CORRECTION LOOP** (prior PASS vacated by independent audit; Engineer must not declare PASS) |
| Merge | DO NOT MERGE — leave OPEN |

## Stacking note

**PR base MUST be** `m2.8-activity-experience`, **NOT** `main`. Do not wait for merge of #20/#22/#24. Do not start M2.10. Do not open a new PR — update existing PR #26 on the same branch.

## Correction LOOP (2026-10-01)

Independent audit on audited head `e5cbc6e…` found: 12 multi-dest ON_CLICK; 43 whole-frame hotspots; overlap/clip on M2.9 frames; state-honesty gaps (M2.3 revoke-share, M2.5 inactive/remove); inventory/docs drift. Engineer correction: visible ProtoNav (1 dest/trigger); overlap/clip → 0; evidence panels; docs pack. Status remains **CORRECTION LOOP** until independent Amber Reviewer PASS.

## In-scope

1. Figma navigation ambiguity + hotspot fixes on page `04 — Telas`
2. M2.9 overlap/clip fixes + regenerated PNGs
3. State honesty annotations (M2.3/M2.5) + node-ID matrix
4. Traceable inventory + corrected evidence doc
5. Agentic docs sync (CORRECTION LOOP; PR #26 OPEN; head TBD)
6. Push onto existing PR #26 only (CloudAgent)

## Out of scope

Backend schema/API/domain/AuthZ catalog; redesign of approved M2.1–M2.8; M2.10; Bruno2K/amber; merging #20, #22, #24, or #26; declaring Exit Gate PASS.
