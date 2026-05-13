#!/bin/bash
# restore-qdrant.sh — Restore Qdrant collections from local .snapshot files.
#
# Each .snapshot file in the input directory is restored as one collection.
# The collection name is taken from the filename (e.g. codex_knowledge.snapshot
# restores to the 'codex_knowledge' collection).
#
# Existing collections with the same name are REPLACED by the snapshot.
#
# Usage:
#   ./scripts/restore-qdrant.sh <snapshot-dir>
#   ./scripts/restore-qdrant.sh ./backups/2026-05-13T10-00-00/qdrant
#
# Options (via env vars):
#   QDRANT_URL        default: http://localhost:6333
#   QDRANT_CONTAINER  default: projectadvisor-qdrant

set -euo pipefail

SNAPSHOT_DIR="${1:-}"
QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
QDRANT_CONTAINER="${QDRANT_CONTAINER:-projectadvisor-qdrant}"

if [ -z "$SNAPSHOT_DIR" ]; then
  echo "Usage: $0 <snapshot-dir>"
  echo "Example: $0 ./backups/2026-05-13T10-00-00/qdrant"
  exit 1
fi

if [ ! -d "$SNAPSHOT_DIR" ]; then
  echo "[restore-qdrant] ERROR: Directory not found: $SNAPSHOT_DIR"
  exit 1
fi

# Collect all snapshot files
SNAPSHOTS=("$SNAPSHOT_DIR"/*.snapshot)
if [ ${#SNAPSHOTS[@]} -eq 0 ] || [ ! -f "${SNAPSHOTS[0]}" ]; then
  echo "[restore-qdrant] No .snapshot files found in $SNAPSHOT_DIR"
  exit 1
fi

echo "[restore-qdrant] Qdrant URL:   $QDRANT_URL"
echo "[restore-qdrant] Container:    $QDRANT_CONTAINER"
echo "[restore-qdrant] Snapshots:    ${#SNAPSHOTS[@]} file(s)"
echo ""

for SNAPSHOT_FILE in "${SNAPSHOTS[@]}"; do
  FILENAME=$(basename "$SNAPSHOT_FILE")
  COLLECTION="${FILENAME%.snapshot}"

  echo "[restore-qdrant] Restoring collection: $COLLECTION"

  # Create the snapshots directory inside the container
  CONTAINER_SNAP_DIR="/qdrant/snapshots/${COLLECTION}"
  docker exec "$QDRANT_CONTAINER" mkdir -p "$CONTAINER_SNAP_DIR"

  # Copy snapshot file into the Qdrant container
  CONTAINER_SNAP_PATH="${CONTAINER_SNAP_DIR}/${FILENAME}"
  docker cp "$SNAPSHOT_FILE" "${QDRANT_CONTAINER}:${CONTAINER_SNAP_PATH}"
  echo "[restore-qdrant]   Copied to container: $CONTAINER_SNAP_PATH"

  # Recover the collection from the in-container snapshot
  RECOVER_RESP=$(curl -sf -X PUT "${QDRANT_URL}/collections/${COLLECTION}/snapshots/recover" \
    -H "Content-Type: application/json" \
    -d "{\"location\": \"file://${CONTAINER_SNAP_PATH}\", \"priority\": \"snapshot\"}" \
    2>&1) || true

  if echo "$RECOVER_RESP" | grep -q '"status":"ok"'; then
    echo "[restore-qdrant]   Recover accepted"
  else
    echo "[restore-qdrant]   WARNING: Unexpected recover response:"
    echo "                   $RECOVER_RESP"
  fi

  # Poll until collection status is green (max 60 seconds)
  echo "[restore-qdrant]   Waiting for collection to become ready..."
  for i in $(seq 1 60); do
    STATUS=$(curl -sf "${QDRANT_URL}/collections/${COLLECTION}" 2>/dev/null | \
      python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['status'])" 2>/dev/null || echo "unknown")
    if [ "$STATUS" = "green" ]; then
      VECTORS=$(curl -sf "${QDRANT_URL}/collections/${COLLECTION}" 2>/dev/null | \
        python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['vectors_count'])" 2>/dev/null || echo "?")
      echo "[restore-qdrant]   Ready: $VECTORS vectors"
      break
    fi
    if [ "$i" -eq 60 ]; then
      echo "[restore-qdrant]   WARNING: Status did not reach 'green' after 60s (last: $STATUS)"
    fi
    sleep 1
  done

  # Cleanup: remove snapshot from container
  docker exec "$QDRANT_CONTAINER" rm -f "$CONTAINER_SNAP_PATH"

  echo ""
done

echo "[restore-qdrant] All collections restored. Summary:"
curl -sf "${QDRANT_URL}/collections" | \
  python3 -c "import sys,json; [print(f'  - {c[\"name\"]}') for c in json.load(sys.stdin)['result']['collections']]" 2>/dev/null || \
  echo "  (could not list collections)"
echo "[restore-qdrant] Done."
