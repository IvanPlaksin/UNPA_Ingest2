#!/bin/bash
# Memgraph backup — dumps all data to a .cypherl file and compresses it.
# Usage: ./scripts/backup-memgraph.sh [output-dir]
# Requires: mgconsole installed and in PATH

set -e

OUTPUT_DIR="${1:-./backups/memgraph}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${OUTPUT_DIR}/memgraph_dump_${TIMESTAMP}.cypherl"

mkdir -p "$OUTPUT_DIR"

MEMGRAPH_HOST="${MEMGRAPH_HOST:-localhost}"
MEMGRAPH_PORT="${MEMGRAPH_PORT:-7687}"
MEMGRAPH_USER="${MEMGRAPH_USER:-memgraph}"
MEMGRAPH_PASSWORD="${MEMGRAPH_PASSWORD:-secret_password_123}"

echo "[backup-memgraph] Starting backup..."
echo "[backup-memgraph] Target: $MEMGRAPH_HOST:$MEMGRAPH_PORT"
echo "[backup-memgraph] Output: $BACKUP_FILE"

mgconsole \
  --host "$MEMGRAPH_HOST" \
  --port "$MEMGRAPH_PORT" \
  --username "$MEMGRAPH_USER" \
  --password "$MEMGRAPH_PASSWORD" \
  --output-format cypherl \
  --no-history \
  <<< "DUMP DATABASE;" > "$BACKUP_FILE"

LINE_COUNT=$(wc -l < "$BACKUP_FILE")
echo "[backup-memgraph] Dump complete: $LINE_COUNT lines"

gzip "$BACKUP_FILE"

FINAL="${BACKUP_FILE}.gz"
SIZE=$(du -h "$FINAL" | cut -f1)
echo "[backup-memgraph] Compressed: $FINAL ($SIZE)"
echo "[backup-memgraph] Done."
