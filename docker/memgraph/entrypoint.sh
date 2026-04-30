#!/bin/bash
set -euo pipefail

STORAGE_ACCOUNT="${AZURE_STORAGE_ACCOUNT:-unpastorage798eaf9a}"
CONTAINER_NAME="memgraph-snapshots"
SNAPSHOT_BLOB="memgraph/latest.cypherl.gz"
SNAPSHOT_LOCAL="/tmp/memgraph-snapshot.cypherl"
SNAPSHOT_INTERVAL="${SNAPSHOT_INTERVAL_SEC:-3600}"

log() { echo "[memgraph-persistent] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"; }

# ── Restore from Blob on startup ─────────────────────────────────────────────
restore_snapshot() {
  log "Checking for snapshot in blob storage..."

  local exists
  exists=$(az storage blob exists \
    --account-name "$STORAGE_ACCOUNT" \
    --container-name "$CONTAINER_NAME" \
    --name "$SNAPSHOT_BLOB" \
    --auth-mode login \
    --query exists \
    --output tsv 2>/dev/null || echo "false")

  if [ "$exists" = "true" ]; then
    log "Snapshot found — downloading..."
    az storage blob download \
      --account-name "$STORAGE_ACCOUNT" \
      --container-name "$CONTAINER_NAME" \
      --name "$SNAPSHOT_BLOB" \
      --file "${SNAPSHOT_LOCAL}.gz" \
      --auth-mode login \
      --overwrite true

    gunzip -f "${SNAPSHOT_LOCAL}.gz"
    log "Snapshot downloaded ($(wc -l < "$SNAPSHOT_LOCAL") statements)"
    return 0
  else
    log "No snapshot found — starting with empty database"
    return 1
  fi
}

# ── Upload snapshot to Blob ───────────────────────────────────────────────────
upload_snapshot() {
  log "Dumping database to snapshot..."

  echo "DUMP DATABASE;" | mgconsole \
    --host 127.0.0.1 \
    --port 7687 \
    --use-ssl=false \
    --output-format=cypherl \
    > "$SNAPSHOT_LOCAL" 2>/dev/null || {
    log "WARNING: mgconsole dump failed, skipping upload"
    return 1
  }

  local lines
  lines=$(wc -l < "$SNAPSHOT_LOCAL")

  if [ "$lines" -lt 2 ]; then
    log "Database appears empty ($lines lines), skipping upload"
    rm -f "$SNAPSHOT_LOCAL"
    return 0
  fi

  log "Dump complete ($lines statements) — compressing..."
  gzip -f "$SNAPSHOT_LOCAL"

  log "Uploading to blob storage..."
  az storage blob upload \
    --account-name "$STORAGE_ACCOUNT" \
    --container-name "$CONTAINER_NAME" \
    --name "$SNAPSHOT_BLOB" \
    --file "${SNAPSHOT_LOCAL}.gz" \
    --auth-mode login \
    --overwrite true

  local ts
  ts=$(date -u '+%Y%m%dT%H%M%SZ')
  az storage blob copy start \
    --account-name "$STORAGE_ACCOUNT" \
    --source-container "$CONTAINER_NAME" \
    --source-blob "$SNAPSHOT_BLOB" \
    --destination-container "$CONTAINER_NAME" \
    --destination-blob "memgraph/backup-${ts}.cypherl.gz" \
    --auth-mode login 2>/dev/null || true

  rm -f "${SNAPSHOT_LOCAL}.gz"
  log "Snapshot uploaded successfully"
}

# ── Wait for Memgraph to be ready ────────────────────────────────────────────
wait_for_memgraph() {
  log "Waiting for Memgraph to accept connections..."
  for i in $(seq 1 60); do
    if echo "RETURN 1;" | mgconsole \
        --host 127.0.0.1 --port 7687 --use-ssl=false \
        --output-format=tabular &>/dev/null; then
      log "Memgraph ready (attempt $i)"
      return 0
    fi
    sleep 1
  done
  log "ERROR: Memgraph did not become ready in 60s"
  return 1
}

# ── Background snapshot loop ──────────────────────────────────────────────────
snapshot_loop() {
  local initial_delay="${SNAPSHOT_INITIAL_DELAY_SEC:-120}"
  log "Snapshot loop started (initial: ${initial_delay}s, interval: ${SNAPSHOT_INTERVAL}s)"
  sleep "$initial_delay"
  upload_snapshot || true
  while true; do
    sleep "$SNAPSHOT_INTERVAL"
    upload_snapshot || true
  done
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  # Step 1: Try to download snapshot
  local has_snapshot=false
  restore_snapshot && has_snapshot=true || true

  # Step 2: Start Memgraph in background (WAL disabled — we snapshot to Blob instead)
  log "Starting Memgraph..."
  /usr/lib/memgraph/memgraph \
    --bolt-port=7687 \
    --log-level=WARNING \
    --storage-snapshot-interval-sec=0 \
    --storage-wal-enabled=false \
    "$@" &
  MG_PID=$!

  # Step 3: Wait for ready
  wait_for_memgraph || { kill $MG_PID 2>/dev/null; exit 1; }

  # Step 4: Load snapshot if available
  if [ "$has_snapshot" = "true" ] && [ -f "$SNAPSHOT_LOCAL" ]; then
    log "Loading snapshot into Memgraph..."
    mgconsole \
      --host 127.0.0.1 \
      --port 7687 \
      --use-ssl=false \
      < "$SNAPSHOT_LOCAL" > /dev/null 2>&1 && \
      log "Snapshot loaded successfully" || \
      log "WARNING: Snapshot load had errors (partial load possible)"
    rm -f "$SNAPSHOT_LOCAL"
  fi

  # Step 5: Start snapshot loop in background
  snapshot_loop &

  # Step 6: Wait for Memgraph (container exits when Memgraph exits)
  wait $MG_PID
}

main "$@"
