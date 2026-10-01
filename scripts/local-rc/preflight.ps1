#Requires -Version 5.1
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_lib.ps1")

Write-Host "==> Local RC Windows preflight"
Assert-Command docker
Get-Compose | Out-Null

$wsl = Test-WslReady
Write-Host "docker: ok"
Write-Host "wsl2: $(if ($wsl) { 'ok' } else { 'not detected' })"

if (-not $wsl) {
  Write-Host @"
Supported Windows path is Docker Desktop with the WSL2 backend.
Native NTFS Next.js (`pnpm --filter @amber/web dev`) is NOT the supported path
(Next.js can fail creating symlinks on native Windows).
Use one of:
  1. WSL2 Ubuntu at this repo path, then the bash scripts (recommended)
  2. This PowerShell pack: compose data plane + compose profile apps for web
"@
}

docker info | Out-Null
Write-Host "preflight ok"
