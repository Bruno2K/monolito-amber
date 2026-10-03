#Requires -Version 5.1
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_lib.ps1")
Ensure-Env
& (Join-Path $PSScriptRoot "down.ps1")
$compose = Get-Compose
& $compose[0] $compose[1] --profile apps --profile jobs down -v --remove-orphans
if (Test-WslReady) {
  wsl -e bash -lc "cd '$($Root.Replace('\','/'))' && bash scripts/local-rc/reset.sh"
  exit $LASTEXITCODE
}
# Native reset reaches bootstrap.ps1, which sets both demo seed flags only around prisma:seed.
& (Join-Path $PSScriptRoot "bootstrap.ps1")
