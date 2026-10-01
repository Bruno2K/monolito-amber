#Requires -Version 5.1
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_lib.ps1")
Ensure-Env
$env:GIT_SHA = Get-CandidateSha
if (Test-WslReady) {
  wsl -e bash -lc "cd '$($Root.Replace('\','/'))' && bash scripts/local-rc/rehearse-reset.sh"
  exit $LASTEXITCODE
}
Assert-Command pnpm
pnpm local-rc:rehearse-reset
