#!/bin/bash
# restore-redis.sh — Restore Redis from a .rdb dump file.
#
# Stops the Redis container, copies the dump.rdb into the container's data
# directory, then restarts Redis so it loads the restored data.
#
# NOTE: This briefly stops Redis. All in-flight BullMQ jobs will be paused
# during the restart. The restart takes ~2-5 seconds.
#
# Usage:
#   ./scripts/restore-redis.sh <dump-file.rdb>
#   ./scripts/restore-redis.sh ./backups/redis/redis_dump_20260513_100000.rdb
#
# Options (via env vars):
#   REDIS_CONTAINER  default: projectadvisor-redis

set -euo pipefail

DUMP_FILE="${1:-}"
REDIS_CONTAINER="${REDIS_CONTAINER:-projectadvisor-redis}"

if [ -z "$DUMP_FILE" ]; then
  echo "Usage: $0 <dump-file.rdb>"
  exit 1
fi

if [ ! -f "$DUMP_FILE" ]; then
  echo "[restore-redis] ERROR: File not found: $DUMP_FILE"
  exit 1
fi

echo "[restore-redis] Source:    $DUMP_FILE"
echo "[restore-redis] Container: $REDIS_CONTAINER"

# Verify container exists (may be stopped — that's fine for restore)
if ! docker inspect "$REDIS_CONTAINER" > /dev/null 2>&1; then
  echo "[restore-redis] ERROR: Container '$REDIS_CONTAINER' does not exist."
  echo "                Start the Docker infrastructure first: docker compose up -d redis"
  exit 1
fi

CONTAINER_STATUS=$(docker inspect --format '{{.State.Status}}' "$REDIS_CONTAINER")

if [ "$CONTAINER_STATUS" = "running" ]; then
  echo "[restore-redis] Stopping Redis container..."
  docker stop "$REDIS_CONTAINER"
fi

# Copy dump.rdb into the container's data directory
echo "[restore-redis] Copying dump file into container..."
docker cp "$DUMP_FILE" "${REDIS_CONTAINER}:/data/dump.rdb"

# Start Redis (it will load dump.rdb on startup)
echo "[restore-redis] Starting Redis container..."
docker start "$REDIS_CONTAINER"

# Wait for Redis to respond
echo "[restore-redis] Waiting for Redis to be ready..."
for i in $(seq 1 40); do
  if docker exec "$REDIS_CONTAINER" redis-cli PING 2>/dev/null | grep -q 'PONG'; then
    break
  fi
  if [ "$i" -eq 40 ]; then
    echo "[restore-redis] ERROR: Redis did not respond after restart."
    exit 1
  fi
  sleep 0.5
done

DB_SIZE=$(docker exec "$REDIS_CONTAINER" redis-cli DBSIZE | tr -d '\r\n')
echo "[restore-redis] Redis is ready: $DB_SIZE keys loaded."
echo "[restore-redis] Done."
