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
                                                                   └─ M3.9 #50 / #51 squash-merged
                                                                        reviewed tip 11d0782509b985eae1919101970e908b5b8e5048
                                                                        Reviewer PASS (audit WI only)
                                                                        main @ 762c3f3ba85ff899623cf4c3682e6bddad062bab
                                                                        Exit Gate FAIL — ACCEPTED
                                                                        LOCAL ONLY — no EG-OPS-STAGING-URL / EG-OPS-PAAS-SHA / Vercel / Railway chase
                                                                        team cold — no active M3.9 implementation branch
                                                                        residuals OPEN: F-08 / F-10 / RPO-RTO / PaaS; WIN-PS1 accepted
                                                                        not M3 COMPLETE · not M4
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
| `main` @ `d01dfc9e…` | M3.9 PR #51 | squash-merge `762c3f3b…` — Exit Gate FAIL — ACCEPTED |

## Current boundary

- M2 integration is closed.
- RC1 is **MERGED** and Bruno homologated LOCAL RC.
- M3.9 audit WI is **MERGED**. Exit Gate **FAIL — ACCEPTED**. Team cold. No active implementation branch.
- **LOCAL ONLY.** Do not chase EG-OPS-STAGING-URL / EG-OPS-PAAS-SHA / Vercel / Railway / public URL.
- Residuals F-08 / F-10 / RPO-RTO / PaaS remain OPEN; WIN-PS1 accepted residual.
- M3 COMPLETE / M4 remain not claimed / not started.
