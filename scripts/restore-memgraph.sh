#!/bin/bash
# restore-memgraph.sh — Restore Memgraph from a .cypherl dump (optionally gzip-compressed).
#
# Uses mgconsole INSIDE the Docker container — no local mgconsole installation
# required. The dump is replayed statement by statement.
#
# Usage:
#   ./scripts/restore-memgraph.sh <backup-file> [--wipe]
#   ./scripts/restore-memgraph.sh ./backups/memgraph/memgraph_dump_20260513.cypherl.gz --wipe
#
# Flags:
#   --wipe   DESTRUCTIVE: deletes all existing Memgraph data before restoring.
#            Recommended for dev-to-dev migration (fresh install).
#            Without --wipe the dump is applied on top of existing data,
#            which may create duplicate nodes.
#
# Options (via env vars):
#   MEMGRAPH_CONTAINER  default: projectadvisor-memgraph
#   MEMGRAPH_USER       default: memgraph
#   MEMGRAPH_PASSWORD   default: secret_password_123

set -euo pipefail

BACKUP_FILE="${1:-}"
WIPE=false

if [ "$#" -ge 2 ] && [ "$2" = "--wipe" ]; then
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

MEMGRAPH_CONTAINER="${MEMGRAPH_CONTAINER:-projectadvisor-memgraph}"
MEMGRAPH_USER="${MEMGRAPH_USER:-memgraph}"
MEMGRAPH_PASSWORD="${MEMGRAPH_PASSWORD:-secret_password_123}"

echo "[restore-memgraph] Container: $MEMGRAPH_CONTAINER"
echo "[restore-memgraph] Source:    $BACKUP_FILE"

# Verify container is running
if ! docker inspect --format '{{.State.Status}}' "$MEMGRAPH_CONTAINER" 2>/dev/null | grep -q '^running$'; then
  echo "[restore-memgraph] ERROR: Container '$MEMGRAPH_CONTAINER' is not running."
  echo "                   Start it with: docker compose up -d memgraph"
  exit 1
fi

# Helper: pipe input to mgconsole running inside the container
mexec() {
  docker exec -i "$MEMGRAPH_CONTAINER" \
    mgconsole \
    --host 127.0.0.1 \
    --port 7687 \
    --username "$MEMGRAPH_USER" \
    --password "$MEMGRAPH_PASSWORD" \
    --no-history
}

# Wipe all existing data if requested
if $WIPE; then
  echo "[restore-memgraph] WARNING: Wiping all existing data (--wipe)..."
  echo "MATCH (n) DETACH DELETE n;" | mexec
  echo "[restore-memgraph] Wipe complete."
else
  echo "[restore-memgraph] Note: restoring on top of existing data (use --wipe for a clean restore)."
fi

# Replay the dump (decompress on the fly if needed)
echo "[restore-memgraph] Replaying Cypher dump..."
if [[ "$BACKUP_FILE" == *.gz ]]; then
  gunzip -c "$BACKUP_FILE" | mexec
else
  mexec < "$BACKUP_FILE"
fi

# Verify restored counts
COUNT_OUTPUT=$(echo "MATCH (n) RETURN count(n) AS c; MATCH ()-[r]->() RETURN count(r) AS c;" | \
  docker exec -i "$MEMGRAPH_CONTAINER" \
    mgconsole \
    --host 127.0.0.1 --port 7687 \
    --username "$MEMGRAPH_USER" --password "$MEMGRAPH_PASSWORD" \
    --output-format csv --no-history 2>/dev/null || echo "")

NODE_COUNT=$(echo "$COUNT_OUTPUT" | grep -E '^\d+$' | head -1)
EDGE_COUNT=$(echo "$COUNT_OUTPUT" | grep -E '^\d+$' | tail -1)

echo "[restore-memgraph] Restore complete."
[ -n "$NODE_COUNT" ] && echo "[restore-memgraph] Nodes: $NODE_COUNT  |  Edges: ${EDGE_COUNT:-?}"
echo "[restore-memgraph] Done."
