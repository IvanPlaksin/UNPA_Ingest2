#!/bin/bash
# Memgraph restore — replays a .cypherl dump (optionally gzip-compressed).
# Usage: ./scripts/restore-memgraph.sh <backup-file> [--wipe]
#   --wipe   Drop all existing data before restoring (DESTRUCTIVE)
# Requires: mgconsole installed and in PATH

set -e

BACKUP_FILE="$1"
WIPE=false

if [ "$2" = "--wipe" ]; then
  WIPE=true
fi

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup-file.cypherl[.gz]> [--wipe]"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[restore-memgraph] ERROR: File not found: $BACKUP_FILE"
  exit 1
fi

MEMGRAPH_HOST="${MEMGRAPH_HOST:-localhost}"
MEMGRAPH_PORT="${MEMGRAPH_PORT:-7687}"
MEMGRAPH_USER="${MEMGRAPH_USER:-memgraph}"
MEMGRAPH_PASSWORD="${MEMGRAPH_PASSWORD:-secret_password_123}"

echo "[restore-memgraph] Target: $MEMGRAPH_HOST:$MEMGRAPH_PORT"
echo "[restore-memgraph] Source: $BACKUP_FILE"

mconsole() {
  mgconsole \
    --host "$MEMGRAPH_HOST" \
    --port "$MEMGRAPH_PORT" \
    --username "$MEMGRAPH_USER" \
    --password "$MEMGRAPH_PASSWORD" \
    --no-history
}

if $WIPE; then
  echo "[restore-memgraph] WARNING: Wiping all existing data..."
  echo "MATCH (n) DETACH DELETE n;" | mconsole
  echo "[restore-memgraph] Wipe complete."
fi

# Decompress if needed, then replay
if [[ "$BACKUP_FILE" == *.gz ]]; then
  echo "[restore-memgraph] Decompressing and replaying..."
  gunzip -c "$BACKUP_FILE" | mconsole
else
  echo "[restore-memgraph] Replaying dump..."
  mconsole < "$BACKUP_FILE"
fi

echo "[restore-memgraph] Restore complete."
