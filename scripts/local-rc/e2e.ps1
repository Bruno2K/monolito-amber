#Requires -Version 5.1
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_lib.ps1")
Ensure-Env
$env:AMBER_E2E_EXTERNAL_STACK = "1"
$env:GIT_SHA = Get-CandidateSha
if (Test-WslReady) {
  wsl -e bash -lc "cd '$($Root.Replace('\','/'))' && bash scripts/local-rc/e2e.sh"
  exit $LASTEXITCODE
}
Assert-Command pnpm
pnpm --filter @amber/web exec playwright install chromium
pnpm --filter @amber/web test:e2e:local-rc
