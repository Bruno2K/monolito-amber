# M3 RC1 — Reviewer evidence index

Independent Reviewer: inspect **raw files and CI logs**, not Engineer summaries. LOCAL ONLY. This index does **not** claim LOCAL RC READY, Bruno homologated, M3.8 Exit Gate PASS, M3.9, or M3 COMPLETE.

Candidate branch: `m3-local-rc-audit-corrections` (Issue [#46](https://github.com/Bruno2K/monolito-amber/issues/46)).
Baseline main: `fd10166f4ff5288e14d2796be8950da5a02ca1b9`.

## How to read

1. Open this folder and the linked paths below.
2. Confirm CI run SHAs match the PR head.
3. Open axe JSON, PNGs, reset log, and MinIO test output directly.

## CI (fill after green)

| Job | URL | Status | Tip SHA |
| --- | --- | --- | --- |
| Foundation & Security Gates | _pending green on this tip_ | pending | _PR head_ |
| Local RC (real API + Postgres + MinIO) | _pending green on this tip_ | pending | _PR head_ |

Prior failed run (image pull): https://github.com/Bruno2K/monolito-amber/actions/runs/36923782859 — Docker Hub `minio/minio` 404. Compose/CI/Testcontainers now use `bitnamilegacy/minio` (MinIO server).

Artifact name on Local RC: `m3-rc1-local-rc-evidence`.

## Real-stack E2E

- Specs: `web/e2e/local-rc/golden-path.spec.ts`, `web/e2e/local-rc/negatives.spec.ts`, `web/e2e/local-rc/a11y.spec.ts`
- Config: `web/playwright.local-rc.config.ts` (1440×900 and 1180×820)
- PNG copies: [../m3.8-evidence/](../m3.8-evidence/) and this directory after a green Local RC run

## axe-core

- Harness: `web/e2e/local-rc/a11y.spec.ts` (`@axe-core/playwright`)
- Raw JSON (written by the suite): `axe-*-desktop-1440.json`, `axe-*-narrow-1180.json`
- Blocking bar: zero `serious` / `critical`. Any `moderate`/`minor` remainder is in `axe-accepted-*.json` with the node count for rationale in [manual-focus-review.md](./manual-focus-review.md)

## Manual focus review

- [manual-focus-review.md](./manual-focus-review.md)

## Windows bootstrap

- [../m3-windows-local-rc.md](../m3-windows-local-rc.md)
- Wrappers: `scripts/local-rc/*.ps1`
- Status: Linux path executed; Windows wrappers **pending Windows host** (honest)

## MinIO live adapter

- [minio-live-adapter.md](./minio-live-adapter.md)
- Code: `api/src/files/object-storage.ts`
- Integration: `api/test/integration/object-storage-minio.integration.test.ts`

## Reset rehearsal

- Script: `scripts/local-rc/rehearse-reset.sh` (CI step `Reset rehearsal`)
- Log: [reset-rehearsal.log](./reset-rehearsal.log) (written by the script)
- Seed assertion: `scripts/local-rc/assert-seed-dataset.ts`
- SHA on process: Playwright `health/ready expose the candidate SHA` in `a11y.spec.ts`

## Traceability / AuthZ

- M3.2 matrix: [../../domain/m3.2-requirements-traceability.md](../../domain/m3.2-requirements-traceability.md)
- Disassociate permission: `work_package.update` in controller + service + `packages/shared/src/m3-routes.ts`
