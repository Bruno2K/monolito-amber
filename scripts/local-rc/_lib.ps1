#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $Root

function Get-Compose {
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    docker compose version 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { return @("docker", "compose") }
  }
  throw "docker compose is required"
}

function Assert-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "missing required command: $Name"
  }
}

function Ensure-Env {
  if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "wrote .env from .env.example (local placeholders only)"
  }
}

function Get-CandidateSha {
  if ($env:GIT_SHA) { return $env:GIT_SHA }
  if ($env:GITHUB_SHA) { return $env:GITHUB_SHA }
  try { return (git rev-parse HEAD).Trim() } catch { return "dev" }
}

function Test-WslReady {
  if (-not (Get-Command wsl -ErrorAction SilentlyContinue)) { return $false }
  wsl -e true 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
}
