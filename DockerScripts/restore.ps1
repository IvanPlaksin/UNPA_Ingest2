# ===================================================================
# restore.ps1 - interactive restore of memgraph / qdrant / redis
#
#   ./scripts/restore.ps1
#
# Scans ./backup, groups archives by their timestamp into restorable
# "sets", lets you pick one, then (after confirmation) stops each DB
# container, replaces its volume contents, and restarts it - showing
# progress along the way.
#
# Non-interactive: ./scripts/restore.ps1 -Timestamp 2026-07-14_101500 -Force
# ===================================================================
[CmdletBinding()]
param(
    [string]$Timestamp,
    [switch]$Force
)

. "$PSScriptRoot\_common.ps1"

Assert-Docker
$backupDir = Get-BackupDir

# --- Discover backup sets (grouped by timestamp) ---------------------
$files = Get-ChildItem -Path $backupDir -Filter '*.tar.gz' -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match $script:BackupFilePattern }

if (-not $files) {
    Write-Host "No backups found in $backupDir" -ForegroundColor Yellow
    Write-Host "Run ./scripts/backup.ps1 first." -ForegroundColor Gray
    exit 1
}

$sets = @{}
foreach ($f in $files) {
    if ($f.Name -match $script:BackupFilePattern) {
        $ts = $matches['ts']; $svc = $matches['svc']
        if (-not $sets.ContainsKey($ts)) { $sets[$ts] = @{} }
        $sets[$ts][$svc] = [PSCustomObject]@{ File = $f.Name; SizeMb = [math]::Round($f.Length / 1MB, 2) }
    }
}
$ordered = $sets.Keys | Sort-Object -Descending

# --- Select a set ----------------------------------------------------
if ($Timestamp) {
    if (-not $sets.ContainsKey($Timestamp)) { throw "No backup set for timestamp '$Timestamp'." }
    $chosen = $Timestamp
}
else {
    Write-Host ""
    Write-Host "=== Available backups ===" -ForegroundColor Cyan
    $i = 0
    foreach ($ts in $ordered) {
        $i++
        $pretty = [datetime]::ParseExact($ts, 'yyyy-MM-dd_HHmmss', $null).ToString('yyyy-MM-dd HH:mm:ss')
        $svcs = ($sets[$ts].Keys | Sort-Object) -join ', '
        $total = [math]::Round((($sets[$ts].Values | Measure-Object SizeMb -Sum).Sum), 2)
        Write-Host ("  [{0}] {1}   ({2})   {3} MB" -f $i, $pretty, $svcs, $total)
    }
    Write-Host ""
    do {
        $sel = Read-Host "Select a backup to restore [1-$($ordered.Count)] (or Q to quit)"
        if ($sel -match '^[Qq]$') { Write-Host "Cancelled." -ForegroundColor Gray; exit 0 }
        $ok = ($sel -match '^\d+$') -and ([int]$sel -ge 1) -and ([int]$sel -le $ordered.Count)
        if (-not $ok) { Write-Host "Invalid selection." -ForegroundColor Yellow }
    } while (-not $ok)
    $chosen = $ordered[[int]$sel - 1]
}

$prettyChosen = [datetime]::ParseExact($chosen, 'yyyy-MM-dd_HHmmss', $null).ToString('yyyy-MM-dd HH:mm:ss')
$setEntries = $sets[$chosen]

# --- Confirm (destructive) -------------------------------------------
Write-Host ""
Write-Host "About to RESTORE from ${prettyChosen}:" -ForegroundColor Yellow
foreach ($k in ($setEntries.Keys | Sort-Object)) {
    Write-Host ("   - {0,-9} <- {1}" -f $k, $setEntries[$k].File)
}
Write-Host "This OVERWRITES the current data in these volumes. Containers will restart." -ForegroundColor Yellow

if (-not $Force) {
    $confirm = Read-Host "Type 'yes' to proceed"
    if ($confirm -ne 'yes') { Write-Host "Cancelled." -ForegroundColor Gray; exit 0 }
}

# --- Restore each service --------------------------------------------
$svcKeys = $setEntries.Keys | Sort-Object
$n = $svcKeys.Count
$idx = 0
$results = @()

foreach ($key in $svcKeys) {
    $idx++
    $svc = $script:Services | Where-Object Key -eq $key
    $fileName = $setEntries[$key].File
    $base = [math]::Round((($idx - 1) / $n) * 100)
    $span = [math]::Round((1 / $n) * 100)
    $activity = "Restoring $key ($idx/$n)"

    Write-Host ""
    Write-Host "> $key  <- $fileName" -ForegroundColor White

    $ref = Get-ServiceVolumeRef $svc
    if (-not $ref) {
        Write-Host "    SKIP - container '$($svc.Container)' not found. Run 'docker compose up -d' first." -ForegroundColor Yellow
        $results += [PSCustomObject]@{ Service = $key; Status = 'SKIPPED' }
        continue
    }

    try {
        $wasRunning = Test-ContainerRunning $svc.Container

        # Phase 1 - stop container so files are unlocked
        Write-Progress -Activity $activity -Status "stopping container" -PercentComplete ($base + $span * 0.1)
        if ($wasRunning) { docker stop $svc.Container | Out-Null }

        # Phase 2 - wipe volume + extract archive
        Write-Progress -Activity $activity -Status "extracting archive" -PercentComplete ($base + $span * 0.5)
        Write-Host "    wiping volume '$ref' and extracting..." -ForegroundColor DarkGray
        $sh = "find /data -mindepth 1 -delete 2>/dev/null; tar xzf /backup/$fileName -C /data"
        docker run --rm -v "$($ref):/data" -v "$($backupDir):/backup:ro" $script:HelperImage sh -c $sh
        if ($LASTEXITCODE -ne 0) { throw "extraction failed (exit $LASTEXITCODE)" }

        # Phase 3 - restart container
        Write-Progress -Activity $activity -Status "starting container" -PercentComplete ($base + $span * 0.9)
        if ($wasRunning) { docker start $svc.Container | Out-Null }

        Write-Progress -Activity $activity -Status "done" -PercentComplete ($base + $span)
        Write-Host "    [OK] restored" -ForegroundColor Green
        $results += [PSCustomObject]@{ Service = $key; Status = 'OK' }
    }
    catch {
        Write-Host "    [X] FAILED: $($_.Exception.Message)" -ForegroundColor Red
        # Best effort: bring the container back up even after a failure
        try { docker start $svc.Container 2>$null | Out-Null } catch {}
        $results += [PSCustomObject]@{ Service = $key; Status = 'FAILED' }
    }
}

Write-Progress -Activity "Restore" -Completed
Write-Host ""
Write-Host "=== Restore summary ($prettyChosen) ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize
if ($results.Status -contains 'FAILED') { exit 1 }
