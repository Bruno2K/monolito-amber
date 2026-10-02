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
                                                                        residuals OPEN: F-08 / F-10 / RPO-RTO / PaaS; WIN-PS1 accepted
                                                                        not M3 COMPLETE
                                                                        disposition #52
                                                                        main @ a3eaadcd61c8f8153f61c6a51f920e37b8f362a0
                                                                             └─ M4 ACTIVE / LOCAL ONLY
                                                                                  └─ M4.1 MERGED (Issue #54)
                                                                                       main @ 6e47d9fb050dcc49b120dd511b9de55634cd4e13
                                                                                       docs-only contract / baseline / read-model plan
                                                                                       └─ M4.2 MERGED (Issue #56 / PR #57)
                                                                                            main @ 0fc8e9ea8901d1a68d12289e743d3115a0ac25fd
                                                                                            Planning shell + unified List
                                                                                            └─ M4.3 IN FLIGHT (Issue #58)
                                                                                                 branch m4-3-task-operations-inspector
                                                                                                 Task operations + inspector
                                                                                                 LOCAL ONLY — no Vercel / Railway / M5
                                                                                                 Independent Reviewer required
                                                                                            do not merge from Engineer pass
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
| `main` @ `762c3f3b…` | disposition #52 | `a3eaadcd…` |
| `main` @ `a3eaadcd…` | M4.1 branch `m4-1-contract-baseline` | in flight — docs only |

## Current boundary

- M2 integration is closed.
- RC1 is **MERGED** and Bruno homologated LOCAL RC.
- M3.9 audit WI is **MERGED**. Exit Gate **FAIL — ACCEPTED**. Accepted debt — not M4 scope. **Not M3 COMPLETE.**
- **M4 ACTIVE / LOCAL ONLY.** M4.1 and M4.2 MERGED. M4.3 in flight (Issue #58). M4.4–M4.9 later.
- Do not chase EG-OPS-STAGING-URL / EG-OPS-PAAS-SHA / Vercel / Railway / public URL.
- Residuals F-08 / F-10 / RPO-RTO / PaaS remain OPEN; WIN-PS1 accepted residual.
