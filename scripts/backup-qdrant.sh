#!/bin/bash
# Qdrant backup — creates a snapshot of every collection via Qdrant Snapshot API,
# then downloads each snapshot to the output directory.
# Usage: ./scripts/backup-qdrant.sh [output-dir]

set -e

OUTPUT_DIR="${1:-./backups/qdrant}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"

mkdir -p "$OUTPUT_DIR"

echo "[backup-qdrant] Qdrant URL: $QDRANT_URL"
echo "[backup-qdrant] Output dir: $OUTPUT_DIR"

# List all collections
COLLECTIONS_JSON=$(curl -sf "${QDRANT_URL}/collections")
COLLECTIONS=$(echo "$COLLECTIONS_JSON" | python3 -c "import sys,json; [print(c['name']) for c in json.load(sys.stdin)['result']['collections']]" 2>/dev/null || \
              echo "$COLLECTIONS_JSON" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); d.result.collections.forEach(c=>console.log(c.name))" 2>/dev/null)

if [ -z "$COLLECTIONS" ]; then
  echo "[backup-qdrant] No collections found or unable to parse list."
  exit 1
fi

echo "[backup-qdrant] Collections: $(echo "$COLLECTIONS" | tr '\n' ' ')"

for COLLECTION in $COLLECTIONS; do
  echo "[backup-qdrant] Snapshotting collection: $COLLECTION"

  # Create snapshot
  SNAPSHOT_RESP=$(curl -sf -X POST "${QDRANT_URL}/collections/${COLLECTION}/snapshots")
  SNAPSHOT_NAME=$(echo "$SNAPSHOT_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['name'])" 2>/dev/null || \
                  echo "$SNAPSHOT_RESP" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.result.name)" 2>/dev/null)

  if [ -z "$SNAPSHOT_NAME" ]; then
    echo "[backup-qdrant] ERROR: Could not get snapshot name for $COLLECTION"
    continue
  fi

  # Download snapshot
  LOCAL_FILE="${OUTPUT_DIR}/${COLLECTION}_${TIMESTAMP}.snapshot"
  curl -sf "${QDRANT_URL}/collections/${COLLECTION}/snapshots/${SNAPSHOT_NAME}" \
    -o "$LOCAL_FILE"

  SIZE=$(du -h "$LOCAL_FILE" | cut -f1)
  echo "[backup-qdrant]   Saved: $LOCAL_FILE ($SIZE)"

  # Delete snapshot from Qdrant server (clean up)
  curl -sf -X DELETE "${QDRANT_URL}/collections/${COLLECTION}/snapshots/${SNAPSHOT_NAME}" > /dev/null
done

echo "[backup-qdrant] Done. Backups in: $OUTPUT_DIR"
