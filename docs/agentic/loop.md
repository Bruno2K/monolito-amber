# Loop

1. Read the Work Item, execution spec, and binding Notion pages (0.2A + System Spec).
2. Implement only in-scope foundation changes on `pf-1.0-platform-foundation-bootstrap` (or the WI branch).
3. Run the [harness](./harness.md) before claiming done.
4. Push, open/update the PR with `Closes #<issue>`. Draft until CI is green; then ready for review.
5. Do **not** merge. Independent Reviewer + Governor decide.
6. Repair loops: max 3 implement / 3 CI repair / 3 review-fix. Stop and escalate if exceeded.
