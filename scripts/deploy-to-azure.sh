#!/bin/bash
# Update Azure Container Apps with freshly built images and run smoke tests.
# Usage: ./scripts/deploy-to-azure.sh [tag]
#   tag defaults to "latest"
#
# Run after build-and-push.sh.

set -euo pipefail

TAG="${1:-latest}"
RG="unpa-rg"
ACR_LOGIN_SERVER="unpacr.azurecr.io"

log()  { echo ""; echo "══ $* ══"; }
ok()   { echo "✅ $*"; }
info() { echo "   ▸ $*"; }

log "Deploying tag: $TAG to resource group: $RG"

# ── Update Container Apps ─────────────────────────────────────────────────────
for APP in unpa-api unpa-mcp unpa-gnn unpa-indexing; do
  info "Updating ${APP} → ${ACR_LOGIN_SERVER}/${APP}:${TAG}..."
  az containerapp update \
    --name "$APP" \
    --resource-group "$RG" \
    --image "${ACR_LOGIN_SERVER}/${APP}:${TAG}" \
    --output none
  ok "${APP} updated"
done

# ── Smoke tests ───────────────────────────────────────────────────────────────
log "Smoke tests"

API_URL=$(az containerapp show \
  --name unpa-api \
  --resource-group "$RG" \
  --query "properties.configuration.ingress.fqdn" -o tsv)

if [ -z "$API_URL" ]; then
  echo "❌ Could not retrieve API URL"
  exit 1
fi

echo "  API: https://${API_URL}"

# Liveness — retry up to 12 times (container may be starting)
info "Checking /health/live..."
for i in $(seq 1 12); do
  STATUS=$(curl -sf -o /dev/null -w "%{http_code}" \
    "https://${API_URL}/health/live" 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    ok "/health/live → 200"
    break
  fi
  [ $i -eq 12 ] && { echo "❌ /health/live did not return 200 after 2 min"; exit 1; }
  info "  attempt $i/12: $STATUS — waiting 10s..."
  sleep 10
done

# Readiness
info "Checking /health/ready..."
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" \
  "https://${API_URL}/health/ready" 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ]; then
  ok "/health/ready → 200  (all dependencies ready)"
else
  echo "⚠️  /health/ready → $STATUS  (dependencies may still be warming up)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
MCP_URL=$(az containerapp show \
  --name unpa-mcp \
  --resource-group "$RG" \
  --query "properties.configuration.ingress.fqdn" -o tsv 2>/dev/null || echo "")

echo ""
echo "════════════════════════════════════════════════════════"
echo "  Deploy complete — tag: $TAG"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  API      : https://${API_URL}"
[ -n "$MCP_URL" ] && echo "  Frontend : https://${MCP_URL}"
echo ""
echo "  Manual checks:"
echo "  [ ] Login works"
echo "  [ ] Graph generation produces a graph"
echo "  [ ] Knowledge search returns results"
echo "  [ ] BackLog loads"
echo "════════════════════════════════════════════════════════"
