# ===================================================================
# up.ps1 - one-command deployment of the data layer.
#
#   ./scripts/up.ps1              # start redis + memgraph + qdrant
#   ./scripts/up.ps1 -App         # also start api + frontend (profile "app")
#   ./scripts/up.ps1 -Pull        # pull latest images before starting
#
# Runs the full sequence: verify Docker -> create network -> ensure .env
# -> docker compose up -d -> show status.
# ===================================================================
[CmdletBinding()]
param(
    [switch]$App,     # include the application containers (profile "app")
    [switch]$Pull     # docker compose pull before up
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\_common.ps1"

$deployDir  = $PSScriptRoot
$composeFile = Join-Path $deployDir 'docker-compose.yml'
$envFile     = Join-Path $deployDir '.env'
$envExample  = Join-Path $deployDir '.env.example'

Assert-Docker

# --- 1. Shared external network ---
Write-Host "> ensuring network 'projectadvisor-network'..." -ForegroundColor White
& "$PSScriptRoot\create-network.ps1"

# --- 2. .env ---
if (-not (Test-Path $envFile)) {
    Copy-Item $envExample $envFile
    Write-Host "> created .env from .env.example - review secrets (MEMGRAPH_PASSWORD) in:" -ForegroundColor Yellow
    Write-Host "    $envFile" -ForegroundColor Yellow
}

# --- 3. Compose args ---
$profileArgs = @()
if ($App) { $profileArgs = @('--profile', 'app') }
$composeBase = @('compose', '-f', $composeFile) + $profileArgs

Push-Location $deployDir
try {
    if ($Pull) {
        Write-Host "> pulling images..." -ForegroundColor White
        docker @composeBase pull
    }

    Write-Host "> starting containers..." -ForegroundColor White
    docker @composeBase up -d
    if ($LASTEXITCODE -ne 0) { throw "docker compose up failed (exit $LASTEXITCODE)" }

    Write-Host ""
    Write-Host "=== Status ===" -ForegroundColor Cyan
    docker @composeBase ps
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "[OK] data layer is up." -ForegroundColor Green
if (-not $App) {
    Write-Host "     API/Frontend are configured but not started (profile 'app')." -ForegroundColor Gray
    Write-Host "     Once the app image is available: ./scripts/up.ps1 -App" -ForegroundColor Gray
}
