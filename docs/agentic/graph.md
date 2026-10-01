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
                                          └─ M3.1 ACTIVE (this WI) — contract / catalog / tests
                                               ├─ M3.2 not started
                                               ├─ M3.3 not started
                                               ├─ M3.4–M3.7 not started
                                               ├─ M3.8 local pack deferred until M3.7
                                               └─ M3.9 / M3 COMPLETE / M4 forbidden
```

## Integration edges

| From | To | Result |
| --- | --- | --- |
| `main` @ `49588c3…` | PR #20 | merge commit `23aeadee…` |
| PR #20 integrated | PR #22 retargeted to `main` | merge commit `58453e63…` |
| PR #22 integrated | PR #24 retargeted to `main` | merge commit `130d9602…` |
| PR #24 integrated | PR #26 retargeted to `main` | merge commit `64223fa3…` |
| PR #26 integrated | PR #28 retargeted to `main` | merge commit `4e410b11…` |
| `main` @ `4972176…` (M2 COMPLETE) | M3.1 branch `m3.1-contract-migration-test-data` | in review — do not merge from this Engineer pass |

## Current boundary

- M2 integration is closed.
- M3.1 is the only active Work Item (LOCAL ONLY).
- M3.2+ must not start until M3.1 is MERGED / DONE.
