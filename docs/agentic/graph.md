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
                                CURRENT: PASS / COMPLETE — M2 EXIT GATE PASS
                                Engineer: F-01/F-02/F-03 FIXED; R-01/R-02 FIXED
                                Residual: F-04 OPEN OPTIONAL only
                                Metrics: 86 / 257 / zeros; under34 18→0; Inventory 257/86
                                Documentary: 321:15725 / 321:15738 / 321:15755 excluded
                                Prior reviewed tip: 1c9b67ce… REQUEST_CHANGES
                                Reviewed technical tip: 2aad14db… — Reviewer PASS
                                Post-review: repo/Figma/Notion status synchronization
                                Next: bottom-up stack integration
                                M3: NEXT / not started
```

## Edges

| From | To | Note |
| --- | --- | --- |
| M2.9 @ `3a3526fefb41095cc97a20c93a13c1d016f76ccf` | M2.10 branch | mandatory PR base (not main) |
| Issue #27 | PR #28 | Closes #27 when merged later — leave OPEN now |
| M2.9 Reviewer PASS RC2 | M2.9 Governor | M2.9 Exit Gate stands; stack remains OPEN |
| M2.10 Engineer pass | Independent Reviewer RC1 | REQUEST_CHANGES R-01 / R-02 on `1c9b67ce…` |
| M2.10 CORRECTION LOOP 1 | Independent Reviewer re-review | R-01/R-02 FIXED |
| M2.10 Independent Reviewer | M2 Exit Gate | PASS on `2aad14db…`; Governor locked M2 PASS / COMPLETE |
| M2 Exit Gate | Stack integration | Bottom-up only; preserve ancestry and revalidate CI |

## Do not

- Start M3
- Change backend / schema / API / Prisma / AuthZ catalog / domain contracts
- Rewrite or squash away stacked ancestry during integration
- Embed this revision's own commit SHA as the "PR tip"
