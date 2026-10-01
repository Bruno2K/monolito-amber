# Context

## Active Work Item

**M2.9 — Prototype & State Coverage** is in **CORRECTION LOOP** on PR [#26](https://github.com/Bruno2K/monolito-amber/pull/26) (`m2.9-prototype-state-coverage`), stacked on `m2.8-activity-experience` @ `762ab787943eba83e8185967094b9f3f91b7cae3`.

Prior independent Reviewer PASS is **not sustained**. Audited head `e5cbc6e20a5d84b056a21ce0dc552dafebe8f492` showed structural nav ambiguity (12 multi-dest clicks; 43 whole-frame hotspots), M2.9 overlap/clip, and state-honesty gaps despite 0 broken / 0 orphans.

## What correction changed

- Removed NAVIGATE from whole product frames; added visible ProtoNav controls with **one destination per trigger**
- Post-fix: 262 NAVIGATE · 0 broken · 0 orphans · **0 multi-dest** · **0 whole-frame hotspots**
- M2.9 frames: **0 overlap · 0 clip**; 8 PNGs regenerated
- M2.3 revoke-share + M2.5 inactive/remove evidence panels; matrix node-ID honesty
- Docs status **CORRECTION LOOP**; removed LOOP_2_FIXES / stale PASS / “CloudAgent will update” / SHA `3851528…` claims

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
