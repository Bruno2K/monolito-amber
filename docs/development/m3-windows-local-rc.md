# Windows Local RC — one supported path

**LOCAL ONLY.** This is the single supported Windows homologation path for Bruno. It does **not** claim LOCAL RC READY, M3.8 Exit Gate PASS, M3.9, M3 COMPLETE, or that Bruno has homologated.

## Supported path (one)

**Docker Desktop with the WSL2 backend**, then run the existing bash pack from **WSL2 Ubuntu** (or Git Bash attached to that same Linux filesystem). PowerShell wrappers under `scripts/local-rc/*.ps1` delegate to WSL when `wsl -e true` succeeds.

Native NTFS `pnpm --filter @amber/web dev` is **not** supported: Next.js can fail creating symlinks on Windows. The supported path keeps Next.js on a Linux filesystem (WSL2) or inside `docker compose --profile apps`.

### What was executed vs pending

| Step | Verified here | Status |
| --- | --- | --- |
| Linux bash pack (`scripts/local-rc/*.sh`) | Cloud Agent Linux + GitHub Actions `local-rc` job | executed |
| `@amber/shared test:security` without shell glob | Linux (same vitest include config on Windows) | executed on Linux; command is Windows-safe |
| PowerShell wrappers + preflight | Written to mirror the bash pack | **Windows-pending** — not executed on a Windows host in this loop |
| Native Windows Next.js | Explicitly avoided | not supported |

Do **not** treat PowerShell wrappers as a second executed path until they have been run on Windows.

## Preflight

From PowerShell (Admin not required if Docker Desktop is already running):

```powershell
.\scripts\local-rc\preflight.ps1
```

Checks: `docker`, `docker compose`, optional WSL2. Fails closed if Docker is missing.

Recommended: install Docker Desktop → Settings → General → **Use WSL 2 based engine** → enable Ubuntu distro integration.

## Zero → golden (WSL2 — supported)

In Ubuntu WSL, at the repo root (Linux path, not `/mnt/c/...` if you can clone onto the ext4 filesystem):

```bash
cp .env.example .env
pnpm local-rc:bootstrap    # compose postgres+minio, migrate, AMBER_SEED_M3=1 seed
pnpm local-rc:up            # API :3001 + web :3000 (Linux Next.js)
pnpm local-rc:health        # /health and /ready show commit SHA
pnpm local-rc:e2e           # Playwright 1440×900 and 1180×820
pnpm local-rc:down          # stop API/web; keep data plane
pnpm local-rc:reset         # wipe volumes, migrate+seed again
```

Equivalent PowerShell entry (delegates to WSL when available):

```powershell
.\scripts\local-rc\preflight.ps1
.\scripts\local-rc\bootstrap.ps1
.\scripts\local-rc\up.ps1
.\scripts\local-rc\health.ps1
.\scripts\local-rc\e2e.ps1
.\scripts\local-rc\down.ps1
.\scripts\local-rc\reset.ps1
```

If WSL is absent, `up.ps1` starts **compose profile `apps`** so web runs in Linux containers instead of native Next.js.

## Security tests (Windows-safe)

`pnpm --filter @amber/shared test:security` uses `vitest.security.config.ts` `include` (no shell glob). Same command on Windows PowerShell, cmd, Git Bash, and Linux.

## MinIO

Local RC requires the S3 env contract (`S3_ENDPOINT` … `S3_BUCKET`) and `AMBER_REQUIRE_S3=1`. Filesystem `OBJECT_STORAGE_DIR` is not the live adapter. Compose pulls `bitnamilegacy/minio` (MinIO; Docker Hub `minio/minio` was removed).

## Shutdown / reset

`pnpm local-rc:down` or `.\scripts\local-rc\down.ps1` stops API/web. `pnpm local-rc:reset` / `.\scripts\local-rc\reset.ps1` destroys compose volumes and re-bootstraps migrate+seed.
