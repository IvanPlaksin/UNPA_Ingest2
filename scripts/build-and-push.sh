#!/bin/bash
# Build all Docker images and push to Azure Container Registry.
# Usage: ./scripts/build-and-push.sh [tag]
#   tag defaults to "latest"
#
# Examples:
#   ./scripts/build-and-push.sh
#   ./scripts/build-and-push.sh v1.2.3
#   ./scripts/build-and-push.sh $(git rev-parse --short HEAD)

set -euo pipefail

ACR_NAME="unpacr"
ACR_LOGIN_SERVER="${ACR_NAME}.azurecr.io"
TAG="${1:-latest}"

log()  { echo ""; echo "══ $* ══"; }
ok()   { echo "✅ $*"; }
info() { echo "   ▸ $*"; }

log "ACR Login"
az acr login --name "$ACR_NAME"
ok "Logged into $ACR_LOGIN_SERVER"

log "Building images (tag: $TAG)"

info "Building unpa-api..."
docker build \
  --platform linux/amd64 \
  --file api/Dockerfile \
  --tag "${ACR_LOGIN_SERVER}/unpa-api:${TAG}" \
  --tag "${ACR_LOGIN_SERVER}/unpa-api:latest" \
  .
ok "unpa-api built"

info "Building unpa-mcp (frontend)..."
docker build \
  --platform linux/amd64 \
  --tag "${ACR_LOGIN_SERVER}/unpa-mcp:${TAG}" \
  --tag "${ACR_LOGIN_SERVER}/unpa-mcp:latest" \
  ./mcp
ok "unpa-mcp built"

info "Building unpa-gnn..."
docker build \
  --platform linux/amd64 \
  --tag "${ACR_LOGIN_SERVER}/unpa-gnn:${TAG}" \
  --tag "${ACR_LOGIN_SERVER}/unpa-gnn:latest" \
  ./gnn-service
ok "unpa-gnn built"

info "Building unpa-indexing..."
docker build \
  --platform linux/amd64 \
  --tag "${ACR_LOGIN_SERVER}/unpa-indexing:${TAG}" \
  --tag "${ACR_LOGIN_SERVER}/unpa-indexing:latest" \
  ./indexing-pipeline
ok "unpa-indexing built"

log "Pushing images to ACR"

for IMAGE in unpa-api unpa-mcp unpa-gnn unpa-indexing; do
  info "Pushing ${IMAGE}:${TAG}..."
  docker push "${ACR_LOGIN_SERVER}/${IMAGE}:${TAG}"
  [ "$TAG" != "latest" ] && docker push "${ACR_LOGIN_SERVER}/${IMAGE}:latest"
  ok "${IMAGE} pushed"
done

log "Done"
echo ""
echo "  Images in ACR:"
for IMAGE in unpa-api unpa-mcp unpa-gnn unpa-indexing; do
  echo "    ${ACR_LOGIN_SERVER}/${IMAGE}:${TAG}"
done
echo ""
echo "  Next step — deploy to Azure:"
echo "    bash scripts/deploy-to-azure.sh ${TAG}"
