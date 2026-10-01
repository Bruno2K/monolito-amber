# Graph

```
PF-1.7 DONE (main)
  └─ M2.1 Shell …
       └─ … M2.6 PR #20 OPEN — PASS / COMPLETE
            └─ M2.7 PR #22 OPEN — PASS / COMPLETE
                 └─ M2.8 PR #24 OPEN @ 762ab787… — PASS / COMPLETE
                      └─ M2.9 PR #26 OPEN @ 3a3526fefb41095cc97a20c93a13c1d016f76ccf
                           CURRENT: PASS / COMPLETE (do not merge)
                           History: RC1 917e95a… REQUEST_CHANGES
                                 → RC2 0758675d… (technical) / ee02fdf8… (Reviewer PASS)
                                 → Governor Exit Gate + DOC SYNC RC3
                           └─ M2.10 PR #28 OPEN @ branch m2.10-final-ux-ui-audit
                                CURRENT: CORRECTION LOOP / IN REVIEW (NOT PASS)
                                Phase: scaffold + inventory
                                PR tip: validated in the independent reviewer report
                                        attached to the PR (pending)
                                Next: Engineer Figma pass + Independent Reviewer
                                M3: not started
```

## Edges

| From | To | Note |
| --- | --- | --- |
| M2.9 @ `3a3526fefb41095cc97a20c93a13c1d016f76ccf` | M2.10 branch | mandatory PR base (not main) |
| Issue #27 | PR #28 | Closes #27 when merged later — leave OPEN now |
| M2.9 Reviewer PASS RC2 | M2.9 Governor | M2.9 Exit Gate stands; stack remains OPEN |
| M2.10 phase 1 | Engineer Figma pass | follow-up on the same branch; do not self-PASS |
| M2.10 Independent Reviewer | M2 Exit Gate | Governor locks only after Reviewer PASS |

## Do not

- Merge / squash / destructively rebase / retarget #20 / #22 / #24 / #26 / #28
- Start M3
- Change backend / schema / API / Prisma / AuthZ catalog / domain contracts
- Invent ATTENDIDO or Exit Gate PASS
- Embed this revision's own commit SHA as the "PR tip"
