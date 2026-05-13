#!/bin/bash
# backup-memgraph.sh — Dump all Memgraph data to a compressed Cypher file.
#
# Uses mgconsole INSIDE the Docker container — no local mgconsole installation
# required. The dump is a series of Cypher CREATE statements that can be
# replayed by restore-memgraph.sh or imported into any compatible graph DB.
#
# Usage:
#   ./scripts/backup-memgraph.sh [output-dir]
#   ./scripts/backup-memgraph.sh ./backups/memgraph
#
# Options (via env vars):
#   MEMGRAPH_CONTAINER  default: projectadvisor-memgraph
#   MEMGRAPH_USER       default: memgraph
#   MEMGRAPH_PASSWORD   default: secret_password_123

set -euo pipefail

OUTPUT_DIR="${1:-./backups/memgraph}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${OUTPUT_DIR}/memgraph_dump_${TIMESTAMP}.cypherl"

MEMGRAPH_CONTAINER="${MEMGRAPH_CONTAINER:-projectadvisor-memgraph}"
MEMGRAPH_USER="${MEMGRAPH_USER:-memgraph}"
MEMGRAPH_PASSWORD="${MEMGRAPH_PASSWORD:-secret_password_123}"

mkdir -p "$OUTPUT_DIR"

echo "[backup-memgraph] Container: $MEMGRAPH_CONTAINER"
echo "[backup-memgraph] Output:    $BACKUP_FILE"

# Verify container is running
if ! docker inspect --format '{{.State.Status}}' "$MEMGRAPH_CONTAINER" 2>/dev/null | grep -q '^running$'; then
  echo "[backup-memgraph] ERROR: Container '$MEMGRAPH_CONTAINER' is not running."
  exit 1
fi

echo "[backup-memgraph] Dumping database..."

# Run mgconsole inside the container — no host installation required
echo "DUMP DATABASE;" | docker exec -i "$MEMGRAPH_CONTAINER" \
  mgconsole \
  --host 127.0.0.1 \
  --port 7687 \
  --username "$MEMGRAPH_USER" \
  --password "$MEMGRAPH_PASSWORD" \
  --output-format cypherl \
  --no-history \
  > "$BACKUP_FILE"

LINE_COUNT=$(wc -l < "$BACKUP_FILE" | tr -d ' ')
echo "[backup-memgraph] Dump complete: $LINE_COUNT Cypher statements"

gzip "$BACKUP_FILE"

FINAL="${BACKUP_FILE}.gz"
SIZE=$(du -h "$FINAL" | cut -f1)
echo "[backup-memgraph] Compressed: $FINAL ($SIZE)"
echo "[backup-memgraph] Done."
