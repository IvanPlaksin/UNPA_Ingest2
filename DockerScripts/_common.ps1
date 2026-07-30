# ===================================================================
# Shared helpers for backup.ps1 / restore.ps1
# ===================================================================
#
# Design note: volume names are NOT hardcoded. On any given machine the
# compose project prefix (and therefore the volume name) can differ, so
# we resolve the actual data volume at runtime from the container's mount
# table via `docker inspect`, keyed off the fixed container_name.
# ===================================================================

$ErrorActionPreference = 'Stop'

# Helper image used to tar/untar volume contents (binary-safe).
$script:HelperImage = 'alpine:3.20'

# Service catalog: fixed container name + in-container data path + optional flush.
$script:Services = @(
    [PSCustomObject]@{ Key = 'redis';    Container = 'projectadvisor-redis';    DataPath = '/data' }
    [PSCustomObject]@{ Key = 'memgraph'; Container = 'projectadvisor-memgraph'; DataPath = '/var/lib/memgraph' }
    [PSCustomObject]@{ Key = 'qdrant';   Container = 'projectadvisor-qdrant';   DataPath = '/qdrant/storage' }
)

$script:BackupFilePattern = '^(?<svc>redis|memgraph|qdrant)_(?<ts>\d{4}-\d{2}-\d{2}_\d{6})\.tar\.gz$'

function Assert-Docker {
    try { docker version --format '{{.Server.Version}}' | Out-Null }
    catch { throw "Docker is not available. Start Docker Desktop and try again." }
    if ($LASTEXITCODE -ne 0) { throw "Docker daemon is not responding. Is Docker Desktop running?" }
}

function Get-BackupDir {
    # ./backup alongside the scripts, inside the DockerScripts folder
    $dir = Join-Path $PSScriptRoot 'backup'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return (Resolve-Path $dir).Path
}

function Test-ContainerExists {
    param([string]$Name)
    $found = docker ps -a --filter "name=^/$Name$" --format '{{.Names}}'
    return [bool]$found
}

function Test-ContainerRunning {
    param([string]$Name)
    $state = docker inspect -f '{{.State.Running}}' $Name 2>$null
    return ($state -eq 'true')
}

function Get-ServiceVolumeRef {
    # Returns the docker -v source ref (named volume, or bind-mount host path)
    # for the given service's data path, or $null if not found.
    #
    # We emit every mount as "Destination<TAB>Name<TAB>Source" (no quotes in the
    # Go template, to avoid PowerShell native-arg quote mangling) and match the
    # target Destination in PowerShell.
    param([PSCustomObject]$Service)

    if (-not (Test-ContainerExists $Service.Container)) { return $null }

    $tmpl = "{{range .Mounts}}{{.Destination}}`t{{.Name}}`t{{.Source}}`n{{end}}"
    $lines = docker inspect -f $tmpl $Service.Container 2>$null
    foreach ($line in ($lines -split "`n")) {
        if (-not $line.Trim()) { continue }
        $parts = $line -split "`t"
        if ($parts[0] -eq $Service.DataPath) {
            if ($parts[1]) { return $parts[1].Trim() }   # named volume
            if ($parts[2]) { return $parts[2].Trim() }   # bind-mount host path
        }
    }
    return $null
}

function Invoke-DockerJobWithProgress {
    # Runs a docker command (array of args) as a background job while polling
    # $SizeProbe (a scriptblock returning bytes) to render live Write-Progress.
    param(
        [string[]]$DockerArgs,
        [string]$Activity,
        [string]$Status,
        [scriptblock]$SizeProbe
    )
    $job = Start-Job -ScriptBlock {
        param($a)
        & docker @a 2>&1
        $LASTEXITCODE
    } -ArgumentList (, $DockerArgs)

    try {
        while ($job.State -eq 'Running') {
            $bytes = 0
            if ($SizeProbe) { try { $bytes = & $SizeProbe } catch { $bytes = 0 } }
            $mb = [math]::Round($bytes / 1MB, 1)
            Write-Progress -Activity $Activity -Status ("{0} - {1} MB" -f $Status, $mb) -PercentComplete -1
            Start-Sleep -Milliseconds 400
        }
    }
    finally {
        $output = Receive-Job $job
        Remove-Job $job -Force
        Write-Progress -Activity $Activity -Completed
    }

    # Last element of output is the captured $LASTEXITCODE from inside the job
    $exit = 0
    if ($output.Count -gt 0) {
        $last = $output[-1]
        if ($last -is [int]) { $exit = $last }
    }
    if ($exit -ne 0) {
        $log = ($output | Select-Object -SkipLast 1 | Out-String).Trim()
        throw "docker command failed (exit $exit):`n$log"
    }
}

function Invoke-Flush {
    # Best-effort: force the DB to persist a consistent on-disk state before
    # we archive the volume. Never fatal - the volume tar is still valid.
    param([string]$Key, [string]$Container)

    if (-not (Test-ContainerRunning $Container)) {
        Write-Host "    (container not running - archiving on-disk state as-is)" -ForegroundColor DarkGray
        return
    }
    try {
        switch ($Key) {
            'redis' {
                Write-Host "    flushing Redis to disk (SAVE)..." -ForegroundColor DarkGray
                docker exec $Container redis-cli SAVE | Out-Null
            }
            'memgraph' {
                Write-Host "    creating Memgraph snapshot..." -ForegroundColor DarkGray
                $u = $env:MEMGRAPH_USER; if (-not $u) { $u = 'memgraph' }
                $p = $env:MEMGRAPH_PASSWORD; if (-not $p) { $p = 'secret_password_123' }
                docker exec $Container sh -c "echo 'CREATE SNAPSHOT;' | mgconsole --username '$u' --password '$p'" 2>$null | Out-Null
            }
            'qdrant' {
                # Qdrant continuously persists /qdrant/storage; no explicit flush needed.
            }
        }
    }
    catch {
        Write-Host "    (flush skipped: $($_.Exception.Message))" -ForegroundColor DarkYellow
    }
}
