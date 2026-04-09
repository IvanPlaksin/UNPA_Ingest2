#!/bin/sh
# ═══════════════════════════════════════════════════════════════
# Docker Entrypoint — Wait for dependencies then start
# ═══════════════════════════════════════════════════════════════

set -e

# Configuration
MAX_RETRIES=${WAIT_MAX_RETRIES:-30}
RETRY_INTERVAL=${WAIT_RETRY_INTERVAL:-2}

# ─────────────────────────────────────────────────────────────
# Wait for a TCP service
# ─────────────────────────────────────────────────────────────
wait_for_service() {
  local host=$1
  local port=$2
  local name=$3
  local retries=0

  echo "[entrypoint] Waiting for $name ($host:$port)..."

  while [ $retries -lt $MAX_RETRIES ]; do
    if nc -z "$host" "$port" 2>/dev/null; then
      echo "[entrypoint] $name is ready"
      return 0
    fi
    retries=$((retries + 1))
    echo "[entrypoint] $name not ready, retry $retries/$MAX_RETRIES..."
    sleep $RETRY_INTERVAL
  done

  echo "[entrypoint] WARNING: $name ($host:$port) not available after $MAX_RETRIES retries"
  return 1
}

# ─────────────────────────────────────────────────────────────
# Wait for required services
# ─────────────────────────────────────────────────────────────

# Redis
if [ -n "$REDIS_HOST" ]; then
  REDIS_PORT_NUM=${REDIS_PORT:-6379}
  wait_for_service "$REDIS_HOST" "$REDIS_PORT_NUM" "Redis" || true
fi

# Memgraph/Neo4j
if [ -n "$NEO4J_URI" ]; then
  # Extract host and port from bolt://host:port
  MG_HOST=$(echo "$NEO4J_URI" | sed -E 's|bolt://([^:]+):.*|\1|')
  MG_PORT=$(echo "$NEO4J_URI" | sed -E 's|bolt://[^:]+:([0-9]+).*|\1|')
  wait_for_service "$MG_HOST" "$MG_PORT" "Memgraph" || true
fi

# Qdrant
if [ -n "$QDRANT_URL" ]; then
  QD_HOST=$(echo "$QDRANT_URL" | sed -E 's|https?://([^:]+):.*|\1|')
  QD_PORT=$(echo "$QDRANT_URL" | sed -E 's|https?://[^:]+:([0-9]+).*|\1|')
  wait_for_service "$QD_HOST" "$QD_PORT" "Qdrant" || true
fi

echo "[entrypoint] Starting application..."

# Execute the main command
exec "$@"
