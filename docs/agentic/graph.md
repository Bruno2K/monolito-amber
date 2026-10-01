# Graph

```
PF-1.7 DONE (main)
  └─ M2.1 Shell …
       └─ … M2.6 PR #20 OPEN
            └─ M2.7 PR #22 OPEN
                 └─ M2.8 PR #24 OPEN @ 762ab787…
                      └─ M2.9 PR #26 OPEN @ branch m2.9-prototype-state-coverage
                           pack 917e95a… → Reviewer REQUEST_CHANGES
                           this loop head PENDING_HEAD_SHA
                           Exit: CORRECTION LOOP (not PASS)
                           Next: M2.10 NEXT only (do not start)
```

## Edges

| From | To | Note |
| --- | --- | --- |
| M2.8 @ 762ab787… | M2.9 branch | mandatory PR base (not main) |
| Issue #25 | PR #26 | Closes #25 when merged later — leave OPEN now |
| Audit e5cbc6e… | Pack 917e95a… | first correction on #26 |
| Reviewer REQUEST_CHANGES | This loop | SHA sync + Wiring clip + overlapping dests |
| Correction | Amber Reviewer | independent reproduce; Engineer ≠ PASS |

## Do not

- Create new Issue/PR/branch for this correction
- Merge #20 / #22 / #24 / #26
- Start M2.10
- Change backend/schema/API/AuthZ/domain
- Declare Exit Gate PASS from Engineer
