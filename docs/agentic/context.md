# Context

## Active Work Item

**M2.9 — Prototype & State Coverage** is in **CORRECTION LOOP (RC2)** on PR [#26](https://github.com/Bruno2K/monolito-amber/pull/26) (`m2.9-prototype-state-coverage`), stacked on `m2.8-activity-experience` @ `762ab787943eba83e8185967094b9f3f91b7cae3`.

Independent Amber Reviewer returned **REQUEST_CHANGES** on audited head `917e95a983b7796b341d72c8e19b326cdd3a2101`: docs SHA not synced; Wiring clip on `304:16367`; **15** overlapping multi-dest hotspots under the audit definition (same-node multi-dest and whole-frame already 0).

## What RC2 changed

- Removed NAVIGATE from large parent regions that overlapped child controls with different destinations; fixed stacked ProtoNav on M2.4 Inbox; added visible ProtoNav Gates Lista (`316:15715`) and Privacy (`316:15718`)
- Post-fix: **257** NAVIGATE · 0 broken · 0 orphans · **0** same-node multi-dest · **0** whole-frame · **0** overlapping multi-dest
- Wiring footer `304:16606`/`304:16608`: auto-layout hug + `clipsContent=false` → **0** actionable clip on all 8 M2.9 frames; 8 PNGs regenerated
- Docs status **CORRECTION LOOP**; previous audited head noted as `917e95a…`; head after RC2: `0758675d4cbb0d64fc1cb1aa84cd916e262ab990`

## Stack

| PR | WI | Status |
| --- | --- | --- |
| #20 | M2.6 | OPEN |
| #22 | M2.7 | OPEN |
| #24 | M2.8 | OPEN |
| #26 | M2.9 | OPEN — CORRECTION LOOP (RC2) |

Do **not** merge any of the above. Do **not** start M2.10. Do **not** declare Exit Gate PASS.

## Figma

File `fkE9SwcNlQG7m0HvcGQBw9`, page `04 — Telas`. M2.9 frames `304:15021` … `304:16609`. Evidence: `docs/ux/m2.9-prototype-state-coverage.md`.

## Invariants (no regression)

Formal Exception sole bypass; READY≠RELEASED; Exception≠SATISFIED; Issue≠Task; Health derived; Activity≠chat/Audit/Messaging; no leak placeholders; deep-link re-auth; backend authoritative.
