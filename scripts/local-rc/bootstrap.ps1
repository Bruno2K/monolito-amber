#Requires -Version 5.1
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_lib.ps1")
& (Join-Path $PSScriptRoot "preflight.ps1")
Ensure-Env

$compose = Get-Compose
Write-Host "==> compose up postgres + minio"
& $compose[0] $compose[1] up -d postgres minio

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

# Both demo flags, scoped to the seed command. Restore the process environment afterwards.
$demoSeedFlags = @{
  AMBER_SEED_M3 = "1"
  AMBER_ALLOW_DEMO_SEED = "1"
}
$savedDemoSeedFlags = @{}
foreach ($name in @($demoSeedFlags.Keys)) {
  $savedDemoSeedFlags[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
  Set-Item -Path "Env:$name" -Value $demoSeedFlags[$name]
}
try {
  pnpm prisma:seed
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  foreach ($name in @($demoSeedFlags.Keys)) {
    $previous = $savedDemoSeedFlags[$name]
    if ([string]::IsNullOrEmpty($previous)) {
      Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
    } else {
      Set-Item -Path "Env:$name" -Value $previous
    }
  }
}
Write-Host "bootstrap data plane ready. Next: .\scripts\local-rc\up.ps1"
