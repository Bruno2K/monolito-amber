#Requires -Version 5.1
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_lib.ps1")
& (Join-Path $PSScriptRoot "preflight.ps1")
Ensure-Env

$compose = Get-Compose
Write-Host "==> compose up postgres + minio (+ minio-init)"
& $compose[0] $compose[1] up -d postgres minio minio-init

if (Test-WslReady) {
  Write-Host "==> delegating migrate+seed to WSL2 bash (supported path)"
  wsl -e bash -lc "cd '$($Root.Replace('\','/'))' && bash scripts/local-rc/bootstrap.sh"
  exit $LASTEXITCODE
}

Assert-Command pnpm
Write-Host "==> host pnpm migrate+seed (web must use compose --profile apps; do not native-next on NTFS)"
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm prisma:migrate
$env:AMBER_SEED_M3 = "1"
pnpm prisma:seed
Write-Host "bootstrap data plane ready. Next: .\scripts\local-rc\up.ps1"
