# Graph

```
PF-1.7 DONE
  └─ M2.1–M2.5 PASS / COMPLETE
       └─ M2.6 PR #20 → MERGED 23aeadee…
            └─ M2.7 PR #22 → MERGED 58453e63…
                 └─ M2.8 PR #24 → MERGED 130d9602…
                      └─ M2.9 PR #26 → MERGED 64223fa3…
                           └─ M2.10 PR #28 → MERGED 4e410b11…
                                M2 EXIT GATE PASS
                                M2 COMPLETE / INTEGRATED
                                main @ 4972176442bdb2631ea1f1710a86191109e79dab
                                     └─ M3 ACTIVE / LOCAL ONLY
                                          └─ M3.1–M3.7 MERGED
                                               └─ M3.8 Local RC pack PR #45 MERGED
                                                    main @ fd10166f4ff5288e14d2796be8950da5a02ca1b9
                                                    prior LOCAL RC READY claim REVOKED by audit (historical)
                                                         └─ RC1 #46 / #47 MERGED → homologated
                                                              reviewed tip 6683bba56299bb28f34029eab8c72dee63bf6aca
                                                              main @ 6104276754607334c53c6864135d29c539db813e
                                                              Bruno homologated LOCAL RC 2026-10-01
                                                              docs residual #49
                                                              main @ d01dfc9e202c60f027c242d187f6cf2e31c701bf
                                                                   └─ M3.9 ACTIVE — branch m3-9-exit-gate-audit / Issue #50
                                                                        ├─ Feature freeze (audit + finding corrections only)
                                                                        ├─ Shared staging HUMAN_REQUIRED unless credentials already exist
                                                                        ├─ Engineer recommendation only (no self-declared Exit Gate)
                                                                        └─ M4 not started
```

## Integration edges

| From | To | Result |
| --- | --- | --- |
| `main` @ `49588c3…` | PR #20 | merge commit `23aeadee…` |
| PR #20 integrated | PR #22 retargeted to `main` | merge commit `58453e63…` |
| PR #22 integrated | PR #24 retargeted to `main` | merge commit `130d9602…` |
| PR #24 integrated | PR #26 retargeted to `main` | merge commit `64223fa3…` |
| PR #26 integrated | PR #28 retargeted to `main` | merge commit `4e410b11…` |
| `main` @ `4972176…` (M2 COMPLETE) | M3.1 … M3.8 pack | M3.8 merge `fd10166f…` |
| `main` @ `fd10166f…` | RC1 PR #47 | squash-merge `61042767…` — homologated |
| `main` @ `61042767…` | docs residual #49 | `d01dfc9e…` |
| `main` @ `d01dfc9e…` | M3.9 branch `m3-9-exit-gate-audit` | in review — Engineer must not merge |

## Current boundary

- M2 integration is closed.
- RC1 is **MERGED** and Bruno homologated LOCAL RC.
- M3.9 is the only active Work Item (LOCAL ONLY / feature freeze).
- Shared staging remains HUMAN_REQUIRED without existing credentials.
- M4 remains not started.
