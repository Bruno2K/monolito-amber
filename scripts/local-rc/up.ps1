#Requires -Version 5.1
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_lib.ps1")
Ensure-Env
$env:GIT_SHA = Get-CandidateSha
$env:BUILD_ID = $(if ($env:BUILD_ID) { $env:BUILD_ID } else { "local" })
$env:AMBER_REQUIRE_S3 = $(if ($env:AMBER_REQUIRE_S3) { $env:AMBER_REQUIRE_S3 } else { "1" })
$env:S3_ENDPOINT = $(if ($env:S3_ENDPOINT) { $env:S3_ENDPOINT } else { "http://127.0.0.1:9000" })
$env:S3_REGION = $(if ($env:S3_REGION) { $env:S3_REGION } else { "us-east-1" })
$env:S3_ACCESS_KEY = $(if ($env:S3_ACCESS_KEY) { $env:S3_ACCESS_KEY } else { "amberminio" })
$env:S3_SECRET_KEY = $(if ($env:S3_SECRET_KEY) { $env:S3_SECRET_KEY } else { "amberminio" })
$env:S3_BUCKET = $(if ($env:S3_BUCKET) { $env:S3_BUCKET } else { "amber-files" })
$env:S3_FORCE_PATH_STYLE = $(if ($env:S3_FORCE_PATH_STYLE) { $env:S3_FORCE_PATH_STYLE } else { "true" })
$env:REDIS_URL = ""

if (Test-WslReady) {
  Write-Host "==> delegating host API+web start to WSL2 bash"
  wsl -e bash -lc "cd '$($Root.Replace('\','/'))' && bash scripts/local-rc/up.sh"
  exit $LASTEXITCODE
}

Write-Host "==> native Next.js is not the supported Windows path; starting compose profile apps"
$compose = Get-Compose
& $compose[0] $compose[1] --profile apps up -d --build
Write-Host "compose apps profile up (api :3001, web :3000)"
