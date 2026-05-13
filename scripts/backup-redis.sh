#!/bin/bash
# backup-redis.sh — Back up Redis data via BGSAVE and docker cp.
#
# Triggers a background RDB save, waits for it to complete, then copies
# the dump.rdb file from the container to the output directory.
# Redis continues serving requests during the backup.
#
# Usage:
#   ./scripts/backup-redis.sh [output-dir]
#   ./scripts/backup-redis.sh ./backups/redis
#
# Options (via env vars):
#   REDIS_CONTAINER  default: projectadvisor-redis

set -euo pipefail

OUTPUT_DIR="${1:-./backups/redis}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REDIS_CONTAINER="${REDIS_CONTAINER:-projectadvisor-redis}"
BACKUP_FILE="${OUTPUT_DIR}/redis_dump_${TIMESTAMP}.rdb"

mkdir -p "$OUTPUT_DIR"

echo "[backup-redis] Container:  $REDIS_CONTAINER"
echo "[backup-redis] Output:     $BACKUP_FILE"

# Verify container is running
if ! docker inspect --format '{{.State.Status}}' "$REDIS_CONTAINER" 2>/dev/null | grep -q '^running$'; then
  echo "[backup-redis] ERROR: Container '$REDIS_CONTAINER' is not running."
  exit 1
fi

# Trigger background save
echo "[backup-redis] Triggering BGSAVE..."
docker exec "$REDIS_CONTAINER" redis-cli BGSAVE

# Wait for BGSAVE to finish (poll every 500ms, max 60 seconds)
echo "[backup-redis] Waiting for BGSAVE to complete..."
for i in $(seq 1 120); do
  SAVING=$(docker exec "$REDIS_CONTAINER" redis-cli INFO persistence | grep 'rdb_bgsave_in_progress' | tr -d '\r')
  if [ "$SAVING" = "rdb_bgsave_in_progress:0" ]; then
    echo "[backup-redis] BGSAVE complete."
    break
  fi
  if [ "$i" -eq 120 ]; then
    echo "[backup-redis] ERROR: BGSAVE timed out after 60 seconds."
    exit 1
  fi
  sleep 0.5
done

# Get DB size for reference
DB_SIZE=$(docker exec "$REDIS_CONTAINER" redis-cli DBSIZE | tr -d '\r\n')
echo "[backup-redis] Keys in database: $DB_SIZE"

# Copy RDB file from container
docker cp "${REDIS_CONTAINER}:/data/dump.rdb" "$BACKUP_FILE"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[backup-redis] Saved: $BACKUP_FILE ($SIZE)"
echo "[backup-redis] Done."
