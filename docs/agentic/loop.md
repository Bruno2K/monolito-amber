# Loop

1. Read the Work Item, execution spec, and binding Notion pages (0.2A + System Spec) plus current `docs/`.
2. Implement only in-scope changes on the Work Item branch (currently `m3-local-rc-audit-corrections`). Do not use stale PF-* , M2.*, or `m3.8-local-rc-pack` as if they were the active branch. Do not start M3.9 / M4.
3. Run the [harness](./harness.md) before claiming done.
4. Push, open/update the PR with `Closes #<issue>`. Ready for review after CI is green. Do not claim LOCAL RC READY.
5. Do **not** merge. Independent Reviewer + Governor decide.
6. Repair loops: max 3 implement / 3 CI repair / 3 review-fix. Stop and escalate if exceeded.

Governor sequences Work Items and authorizes merge. Engineer implements. Reviewer independently PASSes or FAILs. Specialists (security, UX) advise within their boundary. If Notion vs repo docs conflict → HUMAN_REQUIRED.
