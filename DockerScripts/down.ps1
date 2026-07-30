# ===================================================================
# down.ps1 - stop the stack.
#
#   ./scripts/down.ps1              # stop + remove containers (data VOLUMES kept)
#   ./scripts/down.ps1 -Volumes     # also DELETE data volumes (destructive!)
# ===================================================================
[CmdletBinding()]
param(
    [switch]$Volumes   # also remove named volumes (wipes all DB data)
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\_common.ps1"

$deployDir   = $PSScriptRoot
$composeFile = Join-Path $deployDir 'docker-compose.yml'

Assert-Docker

# Include the app profile so api/frontend are stopped too if they were started.
$composeBase = @('compose', '-f', $composeFile, '--profile', 'app')
$downArgs = @('down')
if ($Volumes) {
    Write-Host "WARNING: -Volumes will DELETE all DB data volumes." -ForegroundColor Red
    $confirm = Read-Host "Type 'yes' to proceed"
    if ($confirm -ne 'yes') { Write-Host "Cancelled." -ForegroundColor Gray; exit 0 }
    $downArgs += '-v'
}

Push-Location $deployDir
try {
    docker @composeBase @downArgs
    if ($LASTEXITCODE -ne 0) { throw "docker compose down failed (exit $LASTEXITCODE)" }
}
finally {
    Pop-Location
}

Write-Host "[OK] stack stopped." -ForegroundColor Green
