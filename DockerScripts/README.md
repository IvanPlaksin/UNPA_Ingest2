# UN ProjectAdvisor — Deployment package

Self-contained bundle to run the **data layer** (Redis, Memgraph, Qdrant) on a
fresh machine (**Windows Server + Docker Desktop**), plus **backup / restore**
scripts for those databases. Application containers (API, Frontend) are declared
as configuration only and are deployed later.

```
DockerScripts/
├─ docker-compose.yml      # redis + memgraph + qdrant (+ api/frontend under profile "app")
├─ .env.example            # copy to .env and edit
├─ up.ps1                  # ONE-COMMAND deploy: network + .env + compose up + status
├─ down.ps1                # stop the stack (optionally wipe volumes)
├─ create-network.ps1      # create the shared external network (run once)
├─ backup.ps1             # snapshot all DBs into ./backup (or -Service <name>)
├─ backup-redis.ps1       # back up only Redis
├─ backup-memgraph.ps1    # back up only Memgraph
├─ backup-qdrant.ps1      # back up only Qdrant
├─ restore.ps1            # interactive restore from ./backup
├─ _common.ps1            # shared helpers (not run directly)
└─ backup/                 # backup archives land here: <service>_<date>.tar.gz
```

## Prerequisites

- Windows with **Docker Desktop** running (Linux containers mode).
- This `DockerScripts/` folder copied to the target machine.
- Outbound internet on first run (to pull `redis`, `memgraph-mage`, `qdrant`,
  and the small `alpine` helper image used by the backup scripts).

## First-time deployment

Open **PowerShell** in this folder. The `up.ps1` script does everything —
verifies Docker, creates the network, creates `.env` from the template if
missing, runs `docker compose up -d`, and prints status:

```powershell
./up.ps1
```

> On the very first run it creates `.env` from `.env.example` and warns you to
> review secrets (`MEMGRAPH_PASSWORD`). Edit `.env` then re-run `./up.ps1`.

This starts **redis**, **memgraph**, **qdrant**. The `api` and `frontend`
services stay down (they are behind the `app` profile). When the application
image is available later, set `API_IMAGE` / `FRONTEND_IMAGE` in `.env` (or
uncomment the `build:` blocks in `docker-compose.yml`) and run:

```powershell
./up.ps1 -App        # start data layer + api + frontend
./up.ps1 -Pull       # pull latest images before starting
```

Prefer to do it by hand? The equivalent manual sequence is:

```powershell
./create-network.ps1
copy .env.example .env
notepad .env
docker compose up -d
docker compose ps
```

### Stopping

```powershell
./down.ps1           # stop + remove containers (data volumes kept)
./down.ps1 -Volumes  # also DELETE all DB data (destructive, asks to confirm)
```

## Backup

```powershell
./backup.ps1                 # all three databases (one shared timestamp = one set)
./backup.ps1 -Service redis  # just one, via the shared script
```

Or use the dedicated per-database scripts (thin wrappers, same behavior):

```powershell
./backup-redis.ps1           # -> ./backup/redis_<date>.tar.gz
./backup-memgraph.ps1        # -> ./backup/memgraph_<date>.tar.gz
./backup-qdrant.ps1          # -> ./backup/qdrant_<date>.tar.gz
```

- Archives are written to `./backup/<service>_<yyyy-MM-dd_HHmmss>.tar.gz`.
- Every run uses one shared timestamp, so the three files form one **restorable
  set**.
- Before archiving, each DB is flushed to disk (Redis `SAVE`, Memgraph
  `CREATE SNAPSHOT`) so the snapshot is consistent. Qdrant persists
  continuously, so its storage directory is archived as-is.
- Volume names are **auto-detected** from each container's mounts, so the
  scripts work regardless of the compose project prefix.

Schedule it with Windows Task Scheduler if you want periodic backups, e.g.:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\path\to\DockerScripts\backup.ps1"
```

## Restore

```powershell
./restore.ps1
```

The script:

1. Scans `./backup`, groups archives by date into restorable sets, and prints a
   numbered menu:
   ```
   ═══ Available backups ═══
     [1] 2026-07-14 10:15:00   (memgraph, qdrant, redis)   142.7 MB
     [2] 2026-07-13 22:00:03   (memgraph, qdrant, redis)   140.1 MB
   ```
2. Asks which set to restore and confirms (this **overwrites** current data).
3. For each service: **stops** the container → **wipes + extracts** the archive
   into its volume → **restarts** the container, with a live progress bar.

Non-interactive (e.g. from automation):

```powershell
./restore.ps1 -Timestamp 2026-07-14_101500 -Force
```

> Restore needs the target containers to already exist (`docker compose up -d`
> first) so their volumes are known.

## Migrating data to a new machine

1. On the **source** machine: `./backup.ps1`.
2. Copy the `DockerScripts/` folder (including `backup/`) to the **target** machine.
3. On the target: `./create-network.ps1`, configure `.env`,
   `docker compose up -d`.
4. `./restore.ps1` and pick the copied backup.

## Notes

- **PowerShell execution policy**: if scripts are blocked, run them with
  `powershell -ExecutionPolicy Bypass -File .\backup.ps1`.
- **Ports**: adjust in `.env` if 6379 / 7687 / 6333 are already taken.
- **MSSQL** and GPU services (TEI, GLiNER, GNN) are intentionally **not** part
  of this bundle.
