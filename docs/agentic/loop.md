# Loop

1. Read the Work Item, execution spec, and binding Notion pages (0.2A + System Spec) plus current `docs/`.
2. Implement only in-scope changes on the Work Item branch (currently `pf-1.7-platform-foundation-exit-reconciliation`). Do not use stale PF-1.0 / PF-1.1 / PF-1.1R / PF-1.2 / PF-1.3 / PF-1.4 / PF-1.5 / PF-1.6 branch names.
3. Run the [harness](./harness.md) before claiming done.
4. Push, open/update the PR with `Closes #<issue>`. Draft until CI is green; then ready for review.
5. Do **not** merge. Independent Reviewer + Governor decide.
6. Repair loops: max 3 implement / 3 CI repair / 3 review-fix. Stop and escalate if exceeded.

Governor sequences Work Items and authorizes merge. Engineer implements. Reviewer independently PASSes or FAILs. Specialists (security, UX) advise within their boundary. If Notion vs repo docs conflict → HUMAN_REQUIRED.
