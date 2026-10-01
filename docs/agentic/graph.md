# Graph

```
PF-1.7 DONE (main)
  └─ M2.1 Shell …
       └─ … M2.6 PR #20 OPEN — PASS / COMPLETE
            └─ M2.7 PR #22 OPEN — PASS / COMPLETE
                 └─ M2.8 PR #24 OPEN @ 762ab787… — PASS / COMPLETE
                      └─ M2.9 PR #26 OPEN @ branch m2.9-prototype-state-coverage
                           History: RC1 917e95a… REQUEST_CHANGES
                                 → RC2 0758675d… (technical) / ee02fdf8… (Reviewer PASS)
                                 → Governor Exit Gate
                           CURRENT: PASS / COMPLETE
                           This revision: document-only final synchronization
                           PR tip: validated in the independent reviewer report attached to the PR
                           Next: M2.10 NEXT / not started (unauthorized)
```

## Edges

| From | To | Note |
| --- | --- | --- |
| M2.8 @ 762ab787… | M2.9 branch | mandatory PR base (not main) |
| Issue #25 | PR #26 | Closes #25 when merged later — leave OPEN now |
| RC2 technical `0758675d…` | Tip `ee02fdf8…` | history: content SHA vs tip that received Reviewer PASS RC2 |
| Reviewer PASS RC2 | Governor | Exit Gate accepted; CURRENT PASS / COMPLETE |
| DOC SYNC RC3 | PR #26 body + docs | document-only final synchronization (no own SHA embedded) |

## Do not

- Create new Issue/PR/branch for this synchronization
- Merge #20 / #22 / #24 / #26
- Start M2.10
- Change backend/schema/API/AuthZ/domain
- Touch Figma / PNG evidence
