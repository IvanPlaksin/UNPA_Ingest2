# ===================================================================
# backup.ps1 - snapshot memgraph + qdrant + redis into ./backup
#
#   ./scripts/backup.ps1                 # back up all three DBs
#   ./scripts/backup.ps1 -Service redis  # back up a single service
#
# Output: ./backup/<service>_<yyyy-MM-dd_HHmmss>.tar.gz
# All services in one run share the same timestamp (= one restorable set).
# ===================================================================
[CmdletBinding()]
param(
    # One or more services (comma-separated). 'all' = every service.
    # Multiple services in one run share a single timestamp (= one restorable set).
    [ValidateSet('all', 'redis', 'memgraph', 'qdrant')]
    [string[]]$Service = @('all')
)

. "$PSScriptRoot\_common.ps1"

# --- Load .env (for MEMGRAPH_USER / MEMGRAPH_PASSWORD used by the flush) ---
$envFile = Join-Path $PSScriptRoot '.env'
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#=][^=]*)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
        }
    }
}

Assert-Docker
$backupDir = Get-BackupDir
$timestamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'

$targets = if ($Service -contains 'all') { $script:Services } else { $script:Services | Where-Object { $Service -contains $_.Key } }

Write-Host ""
Write-Host "=== Backup @ $timestamp ===" -ForegroundColor Cyan
Write-Host "Destination: $backupDir" -ForegroundColor Gray
Write-Host ""

$results = @()
foreach ($svc in $targets) {
    Write-Host "> $($svc.Key)" -ForegroundColor White

    $ref = Get-ServiceVolumeRef $svc
    if (-not $ref) {
        Write-Host "    SKIP - container '$($svc.Container)' or its data volume not found." -ForegroundColor Yellow
        $results += [PSCustomObject]@{ Service = $svc.Key; Status = 'SKIPPED'; File = '' }
        continue
    }
    Write-Host "    volume: $ref" -ForegroundColor DarkGray

    Invoke-Flush -Key $svc.Key -Container $svc.Container

    $fileName = "$($svc.Key)_$timestamp.tar.gz"
    $outFile = Join-Path $backupDir $fileName

    $dockerArgs = @(
        'run', '--rm',
        '-v', "$($ref):/data:ro",
        '-v', "$($backupDir):/backup",
        $script:HelperImage,
        'tar', 'czf', "/backup/$fileName", '-C', '/data', '.'
    )

    try {
        Invoke-DockerJobWithProgress -DockerArgs $dockerArgs `
            -Activity "Backing up $($svc.Key)" -Status "archiving" `
            -SizeProbe { if (Test-Path $outFile) { (Get-Item $outFile).Length } else { 0 } }

        $sizeMb = [math]::Round((Get-Item $outFile).Length / 1MB, 2)
        Write-Host "    [OK] $fileName ($sizeMb MB)" -ForegroundColor Green
        $results += [PSCustomObject]@{ Service = $svc.Key; Status = 'OK'; File = $fileName }
    }
    catch {
        Write-Host "    [X] FAILED: $($_.Exception.Message)" -ForegroundColor Red
        if (Test-Path $outFile) { Remove-Item $outFile -Force }
        $results += [PSCustomObject]@{ Service = $svc.Key; Status = 'FAILED'; File = '' }
    }
    Write-Host ""
}

Write-Host "=== Summary ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize
if ($results.Status -contains 'FAILED') { exit 1 }
