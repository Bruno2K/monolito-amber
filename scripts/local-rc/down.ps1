#Requires -Version 5.1
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_lib.ps1")

if (Test-WslReady) {
  wsl -e bash -lc "cd '$($Root.Replace('\','/'))' && bash scripts/local-rc/down.sh"
}

$compose = Get-Compose
& $compose[0] $compose[1] --profile apps stop api web 2>$null
Write-Host "host/compose apps stopped (postgres + minio still up)"
