# Loop

1. Read the Work Item, execution spec, and binding Notion pages (0.2A + System Spec) plus current `docs/`.
2. Implement only in-scope changes on the Work Item branch (currently `m5-1-contract-schema-authz`). M5.1 is contract / schema / AuthZ baseline only. Do not start M5.2–M5.9 / cloud / M6+.
3. Run the [harness](./harness.md) before claiming done.
4. Push, open/update the PR with `Closes #<issue>`. Ready for review after CI is green. Do not claim Exit Gate PASS or unlock M5.2/M5.4.
5. Do **not** merge. Independent Reviewer + Governor decide.
6. Repair loops: max 3 implement / 3 CI repair / 3 review-fix. Stop and escalate if exceeded.

Governor sequences Work Items and authorizes merge. Engineer implements. Reviewer independently PASSes or FAILs. Specialists (security, UX) advise within their boundary. If Notion vs repo docs conflict → HUMAN_REQUIRED.
