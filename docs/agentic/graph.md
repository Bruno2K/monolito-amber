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
                                M3 NEXT / not started
```

## Integration edges

| From | To | Result |
| --- | --- | --- |
| `main` @ `49588c3…` | PR #20 | merge commit `23aeadee…` |
| PR #20 integrated | PR #22 retargeted to `main` | merge commit `58453e63…` |
| PR #22 integrated | PR #24 retargeted to `main` | merge commit `130d9602…` |
| PR #24 integrated | PR #26 retargeted to `main` | merge commit `64223fa3…` |
| PR #26 integrated | PR #28 retargeted to `main` | merge commit `4e410b11…` |

## Current boundary

- No open M2 integration PR remains.
- No M3 Work Item is active.
- Do not start M3 or change backend/product scope without explicit activation.
