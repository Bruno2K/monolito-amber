#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$Api = $(if ($env:API_URL) { $env:API_URL } else { "http://127.0.0.1:3001" })
Write-Host "GET $Api/api/v1/health"
Invoke-RestMethod "$Api/api/v1/health" | ConvertTo-Json -Compress
Write-Host "GET $Api/api/v1/ready"
Invoke-RestMethod "$Api/api/v1/ready" | ConvertTo-Json -Compress
