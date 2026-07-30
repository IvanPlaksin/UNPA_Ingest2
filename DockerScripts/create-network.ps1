# ===================================================================
# Create the shared external Docker network (run once per machine).
# ===================================================================
$ErrorActionPreference = 'Stop'
$net = 'projectadvisor-network'

$exists = docker network ls --filter "name=^$net$" --format '{{.Name}}'
if ($exists -eq $net) {
    Write-Host "Network '$net' already exists." -ForegroundColor Green
} else {
    docker network create $net | Out-Null
    Write-Host "Created network '$net'." -ForegroundColor Green
}
