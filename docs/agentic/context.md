# Context

## Active Work Item

**M2.9 — Prototype & State Coverage** is in **CORRECTION LOOP** on PR [#26](https://github.com/Bruno2K/monolito-amber/pull/26) (`m2.9-prototype-state-coverage`), stacked on `m2.8-activity-experience` @ `762ab787943eba83e8185967094b9f3f91b7cae3`.

Prior independent Reviewer PASS is **not sustained**. Pack head `917e95a983b7796b341d72c8e19b326cdd3a2101` received **REQUEST_CHANGES** (not Exit Gate PASS). This loop head: `PENDING_HEAD_SHA`.

## What this reviewer-response changed

- Docs SHA synced (removed TBD / “CloudAgent will update”)
- Wiring footer `304:16608` unclipped (parent `304:16606` h 50→56); `cross-surface-wiring.png` regenerated
- Overlapping different-dest hotspots **15 → 0** (parent NAVIGATE cleared; M2.4 ProtoNav `311:15769` spaced; Lista/Event no longer cover ProtoNav)
- Engineer-measured after fix: 256 NAVIGATE · 0 broken · 0 orphans · 0 same-node multi-dest · 0 whole-frame · 0 overlapping different-dest
- Residual MINOR: Shell ⌕ `clipsContent` (~4px) — glyphs readable; Shell M2.1 preserved
- Status remains **CORRECTION LOOP**

## Stack

| PR | WI | Status |
| --- | --- | --- |
| #20 | M2.6 | OPEN |
| #22 | M2.7 | OPEN |
| #24 | M2.8 | OPEN |
| #26 | M2.9 | OPEN — CORRECTION LOOP |

Do **not** merge any of the above. Do **not** start M2.10.

## Figma

File `fkE9SwcNlQG7m0HvcGQBw9`, page `04 — Telas`. M2.9 frames `304:15021` … `304:16609`. Evidence: `docs/ux/m2.9-prototype-state-coverage.md`.

## Invariants (no regression)

Formal Exception sole bypass; READY≠RELEASED; Exception≠SATISFIED; Issue≠Task; Health derived; Activity≠chat/Audit/Messaging; no leak placeholders; deep-link re-auth; backend authoritative.
