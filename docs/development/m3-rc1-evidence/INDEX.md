# M3 RC1 — Reviewer evidence index

Independent Reviewer: inspect **raw files and CI logs**, not Engineer summaries. LOCAL ONLY. This index does **not** claim LOCAL RC READY, Bruno homologated, M3.8 Exit Gate PASS, M3.9, or M3 COMPLETE.

Candidate branch: `m3-local-rc-audit-corrections` (Issue [#46](https://github.com/Bruno2K/monolito-amber/issues/46)).
Baseline main: `fd10166f4ff5288e14d2796be8950da5a02ca1b9`.

## How to read

1. Open this folder and the linked paths below.
2. Confirm CI run SHAs match the commit that produced the artifact (table below).
3. Open axe JSON, PNGs (CI artifact), reset log, and MinIO test output directly.

## CI

Green run that produced the axe JSON / screenshots / reset log in this folder and the Actions artifact:

| Job | URL | Status | Tip SHA |
| --- | --- | --- | --- |
| Foundation & Security Gates | https://github.com/Bruno2K/monolito-amber/actions/runs/36925819708/job/110582754228 | success | `381af894462a48f1ad3df4477b80aad23e50a659` |
| Local RC (real API + Postgres + MinIO) | https://github.com/Bruno2K/monolito-amber/actions/runs/36925819708/job/110582754054 | success | `381af894462a48f1ad3df4477b80aad23e50a659` |

Workflow run: https://github.com/Bruno2K/monolito-amber/actions/runs/36925819708

Prior failed runs (same branch): [36923782859](https://github.com/Bruno2K/monolito-amber/actions/runs/36923782859) Docker Hub `minio/minio` 404; [36924453952](https://github.com/Bruno2K/monolito-amber/actions/runs/36924453952) / [36925227887](https://github.com/Bruno2K/monolito-amber/actions/runs/36925227887) axe contrast. Not skipped.

Artifact name on Local RC: `m3-rc1-local-rc-evidence` (PNGs + axe JSON + `reset-rehearsal.log`).

## Real-stack E2E

- Specs: `web/e2e/local-rc/golden-path.spec.ts`, `web/e2e/local-rc/negatives.spec.ts`, `web/e2e/local-rc/a11y.spec.ts`
- Config: `web/playwright.local-rc.config.ts` (1440×900 and 1180×820)
- PNG copies: CI artifact `m3-rc1-local-rc-evidence` and [../m3.8-evidence/](../m3.8-evidence/)

## axe-core

- Harness: `web/e2e/local-rc/a11y.spec.ts` (`@axe-core/playwright`)
- Raw JSON (copied from the green Local RC job):
  - [axe-shell-projects-desktop-1440.json](./axe-shell-projects-desktop-1440.json)
  - [axe-shell-projects-narrow-1180.json](./axe-shell-projects-narrow-1180.json)
  - [axe-overview-desktop-1440.json](./axe-overview-desktop-1440.json)
  - [axe-overview-narrow-1180.json](./axe-overview-narrow-1180.json)
  - [axe-structure-desktop-1440.json](./axe-structure-desktop-1440.json)
  - [axe-structure-narrow-1180.json](./axe-structure-narrow-1180.json)
  - [axe-deliverables-desktop-1440.json](./axe-deliverables-desktop-1440.json)
  - [axe-deliverables-narrow-1180.json](./axe-deliverables-narrow-1180.json)
  - [axe-work-packages-desktop-1440.json](./axe-work-packages-desktop-1440.json)
  - [axe-work-packages-narrow-1180.json](./axe-work-packages-narrow-1180.json)
- Blocking: each file has `"violations": []` (zero serious/critical).
- No `axe-accepted-*.json` — no moderate/minor violations were recorded.
- Incomplete (not a fail): `aria-prohibited-attr` on an unlabeled `div` appears under `incomplete` in some JSON. Not treated as an accepted violation.

## Manual focus review

- [manual-focus-review.md](./manual-focus-review.md)

## Windows bootstrap

- [../m3-windows-local-rc.md](../m3-windows-local-rc.md)
- Wrappers: `scripts/local-rc/*.ps1`
- Status: Linux path executed (this CI); Windows wrappers **pending Windows host** (honest)

## MinIO live adapter

- [minio-live-adapter.md](./minio-live-adapter.md)
- Code: `api/src/files/object-storage.ts`
- Integration: `api/test/integration/object-storage-minio.integration.test.ts` (Foundation job, same run)

## Reset rehearsal

- Script: `scripts/local-rc/rehearse-reset.sh` (CI step `Reset rehearsal`)
- Durable copy: [reset-rehearsal.txt](./reset-rehearsal.txt)
- Raw CI log: artifact `reset-rehearsal.log` (gitignores `*.log`)
- Seed assertion: `scripts/local-rc/assert-seed-dataset.ts` — `deterministic_seed=ok`
- SHA on process: Playwright `health/ready expose the candidate SHA` in `a11y.spec.ts` on the same Local RC job

## Traceability / AuthZ

- M3.2 matrix: [../../domain/m3.2-requirements-traceability.md](../../domain/m3.2-requirements-traceability.md)
- Disassociate permission: `work_package.update` in controller + service + `packages/shared/src/m3-routes.ts`
