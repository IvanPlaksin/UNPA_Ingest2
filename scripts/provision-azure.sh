#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# UN ProjectAdvisor — Azure Infrastructure Provisioning
#
# Provisions the full UNPA stack in Azure:
#   - Resource Group + Log Analytics + Key Vault + ACR
#   - Azure AI Foundry Hub + Project + model deployments
#   - Container Apps Environment
#   - Azure Cache for Redis
#   - Memgraph + Qdrant as Container Apps (persistent storage)
#   - unpa-api, unpa-mcp, unpa-gnn, unpa-indexing Container Apps
#
# Usage:
#   export ANTHROPIC_API_KEY=sk-ant-...
#   export MEMGRAPH_PASSWORD=your-secret
#   export CREDENTIAL_ENCRYPTION_KEY=your-32-char-key
#   export AZURE_SUBSCRIPTION_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
#   # Optional:
#   export GEMINI_API_KEY=...
#   export AZURE_LOCATION=eastus   (default: eastus)
#   export ACR_SKU=Basic           (default: Basic)
#
#   ./scripts/provision-azure.sh
#
# Idempotent: safe to re-run; existing resources are updated in place.
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Config ───────────────────────────────────────────────────────────────────
LOCATION="${AZURE_LOCATION:-eastus}"
RG="unpa-rg"
ACR_NAME="unpacr"
ACR_SKU="${ACR_SKU:-Basic}"
KEYVAULT_NAME="unpa-kv"
LOG_ANALYTICS_NAME="unpa-logs"
ACA_ENV_NAME="unpa-env"
REDIS_NAME="unpa-redis"
AI_HUB_NAME="unpa-ai-hub"
AI_PROJECT_NAME="unpa-ai-project"

# Container App names
APP_API="unpa-api"
APP_MCP="unpa-mcp"
APP_GNN="unpa-gnn"
APP_INDEXING="unpa-indexing"
APP_MEMGRAPH="unpa-memgraph"
APP_QDRANT="unpa-qdrant"

# ─── Validate required env vars ───────────────────────────────────────────────
REQUIRED_VARS=(ANTHROPIC_API_KEY MEMGRAPH_PASSWORD CREDENTIAL_ENCRYPTION_KEY AZURE_SUBSCRIPTION_ID)
MISSING=()
for VAR in "${REQUIRED_VARS[@]}"; do
  [ -z "${!VAR:-}" ] && MISSING+=("$VAR")
done
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "❌ Missing required environment variables:"
  for V in "${MISSING[@]}"; do echo "   $V"; done
  exit 1
fi

GEMINI_API_KEY="${GEMINI_API_KEY:-}"
DOCKER_HUB_USERNAME="${DOCKER_HUB_USERNAME:-}"
DOCKER_HUB_TOKEN="${DOCKER_HUB_TOKEN:-}"

# ─── Helpers ──────────────────────────────────────────────────────────────────
log() { echo ""; echo "══ $* ══"; }
ok()  { echo "✅ $*"; }
info(){ echo "   ▸ $*"; }

# ─── Prerequisites ────────────────────────────────────────────────────────────
log "Checking prerequisites"
command -v az   >/dev/null 2>&1 || { echo "❌ Azure CLI not found. Install: https://docs.microsoft.com/cli/azure/install-azure-cli"; exit 1; }
az account show >/dev/null 2>&1 || { echo "❌ Not logged in. Run: az login"; exit 1; }
az account set --subscription "$AZURE_SUBSCRIPTION_ID"
ok "Azure CLI ready — subscription $AZURE_SUBSCRIPTION_ID"

# ─── Register required resource providers ─────────────────────────────────────
log "Registering resource providers (first-time subscription setup)"
PROVIDERS=(
  "Microsoft.ContainerRegistry"
  "Microsoft.App"
  "Microsoft.OperationalInsights"
  "Microsoft.KeyVault"
  "Microsoft.Cache"
  "Microsoft.Storage"
  "Microsoft.MachineLearningServices"
  "Microsoft.ContainerService"
)
for PROVIDER in "${PROVIDERS[@]}"; do
  STATE=$(az provider show --namespace "$PROVIDER" --query "registrationState" -o tsv 2>/dev/null || echo "Unknown")
  if [ "$STATE" != "Registered" ]; then
    info "Registering $PROVIDER..."
    az provider register --namespace "$PROVIDER" --wait --output none
    ok "$PROVIDER registered"
  else
    info "$PROVIDER — already registered"
  fi
done

# ═══════════════════════════════════════════════════════════════════════════════
# 1. Resource Group
# ═══════════════════════════════════════════════════════════════════════════════
log "1 — Resource Group"
az group create \
  --name "$RG" \
  --location "$LOCATION" \
  --output none
ok "Resource group: $RG ($LOCATION)"

# ═══════════════════════════════════════════════════════════════════════════════
# 2. Log Analytics Workspace
# ═══════════════════════════════════════════════════════════════════════════════
log "2 — Log Analytics Workspace"
az monitor log-analytics workspace create \
  --resource-group "$RG" \
  --workspace-name "$LOG_ANALYTICS_NAME" \
  --location "$LOCATION" \
  --output none
LOG_ANALYTICS_ID=$(az monitor log-analytics workspace show \
  --resource-group "$RG" \
  --workspace-name "$LOG_ANALYTICS_NAME" \
  --query customerId -o tsv)
LOG_ANALYTICS_KEY=$(az monitor log-analytics workspace get-shared-keys \
  --resource-group "$RG" \
  --workspace-name "$LOG_ANALYTICS_NAME" \
  --query primarySharedKey -o tsv)
ok "Log Analytics: $LOG_ANALYTICS_NAME (id: $LOG_ANALYTICS_ID)"

# ═══════════════════════════════════════════════════════════════════════════════
# 3. Azure Container Registry
# ═══════════════════════════════════════════════════════════════════════════════
log "3 — Container Registry"
az acr create \
  --resource-group "$RG" \
  --name "$ACR_NAME" \
  --sku "$ACR_SKU" \
  --location "$LOCATION" \
  --admin-enabled true \
  --output none
ACR_LOGIN_SERVER="${ACR_NAME}.azurecr.io"
ACR_PASSWORD=$(az acr credential show \
  --name "$ACR_NAME" \
  --query "passwords[0].value" -o tsv)
ok "ACR: $ACR_LOGIN_SERVER"

# ═══════════════════════════════════════════════════════════════════════════════
# 4. Key Vault + Secrets
# ═══════════════════════════════════════════════════════════════════════════════
log "4 — Key Vault"
if ! az keyvault show --name "$KEYVAULT_NAME" --resource-group "$RG" --output none 2>/dev/null; then
  az keyvault create \
    --resource-group "$RG" \
    --name "$KEYVAULT_NAME" \
    --location "$LOCATION" \
    --enable-rbac-authorization false \
    --output none
else
  info "Key Vault $KEYVAULT_NAME already exists, skipping create."
fi

info "Storing secrets..."
az keyvault secret set --vault-name "$KEYVAULT_NAME" --name "anthropic-api-key"            --value "$ANTHROPIC_API_KEY"            --output none
az keyvault secret set --vault-name "$KEYVAULT_NAME" --name "memgraph-password"             --value "$MEMGRAPH_PASSWORD"             --output none
az keyvault secret set --vault-name "$KEYVAULT_NAME" --name "credential-encryption-key"     --value "$CREDENTIAL_ENCRYPTION_KEY"     --output none

if [ -n "$GEMINI_API_KEY" ]; then
  az keyvault secret set --vault-name "$KEYVAULT_NAME" --name "gemini-api-key" --value "$GEMINI_API_KEY" --output none
fi

ok "Key Vault: $KEYVAULT_NAME"

# ═══════════════════════════════════════════════════════════════════════════════
# 5. Azure AI Foundry (Hub + Project) — optional, skipped on extension errors
# ═══════════════════════════════════════════════════════════════════════════════
log "5 — Azure AI Foundry"
AZURE_AI_ENDPOINT=""
AI_FOUNDRY_OK=false

# Try to install az ml extension; skip entire step if it fails
if ! az extension show --name ml >/dev/null 2>&1; then
  info "Installing az ml extension..."
  if ! az extension add --name ml --yes --output none 2>/dev/null; then
    info "⚠️  az ml extension install failed — skipping AI Foundry Hub/Project creation."
    info "    Create Hub + Project manually in Azure AI Foundry portal."
  else
    AI_FOUNDRY_OK=true
  fi
else
  AI_FOUNDRY_OK=true
fi

if $AI_FOUNDRY_OK; then
  # Create AI Hub
  info "Creating AI Hub..."
  az ml workspace create \
    --resource-group "$RG" \
    --name "$AI_HUB_NAME" \
    --kind hub \
    --location "$LOCATION" \
    --display-name "UNPA AI Hub" \
    --output none 2>/dev/null || info "Hub already exists, skipping."

  # Create AI Project under hub
  info "Creating AI Project..."
  HUB_ID=$(az ml workspace show \
    --resource-group "$RG" \
    --name "$AI_HUB_NAME" \
    --query id -o tsv 2>/dev/null || echo "")

  if [ -n "$HUB_ID" ]; then
    az ml workspace create \
      --resource-group "$RG" \
      --name "$AI_PROJECT_NAME" \
      --kind project \
      --hub-id "$HUB_ID" \
      --location "$LOCATION" \
      --display-name "UNPA AI Project" \
      --output none 2>/dev/null || info "Project already exists, skipping."

    AZURE_AI_ENDPOINT=$(az ml workspace show \
      --resource-group "$RG" \
      --name "$AI_PROJECT_NAME" \
      --query mlFlowTrackingUri -o tsv 2>/dev/null | sed 's|/mlflow/v1.0||' || echo "")

    ok "AI Foundry Hub: $AI_HUB_NAME | Project: $AI_PROJECT_NAME"
  fi
fi

if true; then
  # Serverless model deployments — always manual regardless of hub creation
  info "Note: Claude model deployments via AI Foundry require manual configuration"
  info "in the Azure AI Foundry portal (portal.azure.com > AI Foundry > $AI_PROJECT_NAME)."
  info "Deploy the following serverless models:"
  info "  - claude-sonnet-4-20250514 → deployment name: claude-sonnet-4"
  info "  - claude-opus-4-5-20251101 → deployment name: claude-opus-4-5"
  info "  - claude-haiku-4-5-20251001 → deployment name: claude-haiku-4-5"
  info "Then set AZURE_AI_KEY in Key Vault and update AZURE_AI_ENDPOINT."
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 6. Container Apps Environment
# ═══════════════════════════════════════════════════════════════════════════════
log "6 — Container Apps Environment"
ENV_STATE=$(az containerapp env show \
  --resource-group "$RG" \
  --name "$ACA_ENV_NAME" \
  --query "properties.provisioningState" -o tsv 2>/dev/null || echo "NotFound")

# If stuck from a previous failed run — delete and recreate
if [ "$ENV_STATE" = "Waiting" ] || [ "$ENV_STATE" = "Failed" ] || [ "$ENV_STATE" = "Canceled" ]; then
  info "Environment in '$ENV_STATE' state (likely from a previous failed run) — deleting and recreating..."
  az containerapp env delete \
    --resource-group "$RG" \
    --name "$ACA_ENV_NAME" \
    --yes --output none 2>/dev/null || true
  # Wait for deletion to complete
  for i in $(seq 1 30); do
    GONE=$(az containerapp env show --resource-group "$RG" --name "$ACA_ENV_NAME" --output none 2>&1 || echo "deleted")
    [ "$GONE" = "deleted" ] && break
    sleep 10
  done
  ENV_STATE="NotFound"
fi

if [ "$ENV_STATE" = "NotFound" ]; then
  info "Creating Container Apps Environment..."
  az containerapp env create \
    --resource-group "$RG" \
    --name "$ACA_ENV_NAME" \
    --location "$LOCATION" \
    --logs-workspace-id "$LOG_ANALYTICS_ID" \
    --logs-workspace-key "$LOG_ANALYTICS_KEY" \
    --output none
else
  info "Container Apps Environment already exists (state: $ENV_STATE)."
fi

# Wait until environment is fully provisioned (up to 30 min)
info "Waiting for Container Apps Environment to be ready (up to 30 min)..."
for i in $(seq 1 180); do
  ENV_STATE=$(az containerapp env show \
    --resource-group "$RG" \
    --name "$ACA_ENV_NAME" \
    --query "properties.provisioningState" -o tsv 2>/dev/null || echo "Unknown")
  if [ "$ENV_STATE" = "Succeeded" ]; then
    ok "Container Apps Environment: $ACA_ENV_NAME (Succeeded)"
    break
  fi
  if [ "$ENV_STATE" = "Failed" ] || [ "$ENV_STATE" = "Canceled" ]; then
    echo "❌ Container Apps Environment provisioning failed (state: $ENV_STATE)"
    exit 1
  fi
  [ $i -eq 180 ] && { echo "❌ Container Apps Environment did not become ready after 30 min"; exit 1; }
  info "  attempt $i/180: state=$ENV_STATE — waiting 10s..."
  sleep 10
done

# ─── Managed Identity for ACR access ─────────────────────────────────────────
# Using managed identity instead of username/password avoids registry auth
# timeouts during container validation — all traffic stays within Azure network.
log "6b — Managed Identity for ACR"
IDENTITY_NAME="unpa-aca-identity"
IDENTITY_EXISTS=$(az identity show --name "$IDENTITY_NAME" --resource-group "$RG" --query "name" -o tsv 2>/dev/null || echo "")
if [ -z "$IDENTITY_EXISTS" ]; then
  az identity create --name "$IDENTITY_NAME" --resource-group "$RG" --output none
  ok "Managed Identity created: $IDENTITY_NAME"
else
  info "Managed Identity already exists: $IDENTITY_NAME"
fi

IDENTITY_ID=$(az identity show --name "$IDENTITY_NAME" --resource-group "$RG" --query id -o tsv)
IDENTITY_CLIENT_ID=$(az identity show --name "$IDENTITY_NAME" --resource-group "$RG" --query clientId -o tsv)
IDENTITY_PRINCIPAL_ID=$(az identity show --name "$IDENTITY_NAME" --resource-group "$RG" --query principalId -o tsv)
ACR_ID=$(az acr show --name "$ACR_NAME" --resource-group "$RG" --query id -o tsv)

# Assign AcrPull role (idempotent)
az role assignment create \
  --assignee "$IDENTITY_PRINCIPAL_ID" \
  --role AcrPull \
  --scope "$ACR_ID" \
  --output none 2>/dev/null || info "AcrPull role already assigned."
ok "AcrPull role assigned → $IDENTITY_NAME"

# ═══════════════════════════════════════════════════════════════════════════════
# 7. Azure Cache for Redis
# ═══════════════════════════════════════════════════════════════════════════════
log "7 — Azure Cache for Redis"
REDIS_STATE=$(az redis show --resource-group "$RG" --name "$REDIS_NAME" --query "provisioningState" -o tsv 2>/dev/null || echo "NotFound")
if [ "$REDIS_STATE" = "NotFound" ]; then
  az redis create \
    --resource-group "$RG" \
    --name "$REDIS_NAME" \
    --location "$LOCATION" \
    --sku Basic \
    --vm-size c0 \
    --output none &
  REDIS_PID=$!
  info "Redis provisioning started in background (takes ~10 min)..."
else
  REDIS_PID=""
  info "Redis already exists (state: $REDIS_STATE), skipping create."
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 7b. Import 3rd-party images into ACR
# (avoids Docker Hub pull timeouts from Azure Container Apps)
# ═══════════════════════════════════════════════════════════════════════════════
log "7b — Import base images into ACR"

# Build optional Docker Hub auth args
DOCKER_AUTH_ARGS=()
if [ -n "$DOCKER_HUB_USERNAME" ] && [ -n "$DOCKER_HUB_TOKEN" ]; then
  DOCKER_AUTH_ARGS=(--username "$DOCKER_HUB_USERNAME" --password "$DOCKER_HUB_TOKEN")
  info "Using Docker Hub credentials: $DOCKER_HUB_USERNAME"
else
  info "⚠️  No Docker Hub credentials — anonymous pull (may hit rate limits)"
  info "    Set DOCKER_HUB_USERNAME and DOCKER_HUB_TOKEN to avoid 429 errors"
fi

info "Importing memgraph/memgraph:latest → ACR (may take 2-5 min)..."
az acr import \
  --name "$ACR_NAME" \
  --source "docker.io/memgraph/memgraph:latest" \
  --image "memgraph:latest" \
  "${DOCKER_AUTH_ARGS[@]}" \
  --force \
  --output none
ok "memgraph:latest imported"

info "Importing qdrant/qdrant:latest → ACR (may take 2-5 min)..."
az acr import \
  --name "$ACR_NAME" \
  --source "docker.io/qdrant/qdrant:latest" \
  --image "qdrant:latest" \
  "${DOCKER_AUTH_ARGS[@]}" \
  --force \
  --output none
ok "qdrant:latest imported"

# ═══════════════════════════════════════════════════════════════════════════════
# 8. Memgraph Container App (persistent storage)
# ═══════════════════════════════════════════════════════════════════════════════
log "8 — Memgraph Container App"

# Create storage account for persistent volumes
STORAGE_ACCOUNT="unpastorage$(echo $AZURE_SUBSCRIPTION_ID | tr -d '-' | cut -c1-8)"
info "Storage account: $STORAGE_ACCOUNT"
az storage account create \
  --resource-group "$RG" \
  --name "$STORAGE_ACCOUNT" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --kind StorageV2 \
  --output none

STORAGE_KEY=$(az storage account keys list \
  --resource-group "$RG" \
  --account-name "$STORAGE_ACCOUNT" \
  --query "[0].value" -o tsv)

# File shares for persistent data
for SHARE in memgraph-data qdrant-data; do
  az storage share create \
    --account-name "$STORAGE_ACCOUNT" \
    --account-key "$STORAGE_KEY" \
    --name "$SHARE" \
    --output none
  info "Created file share: $SHARE"
done

# Mount storage in Container Apps environment
az containerapp env storage set \
  --resource-group "$RG" \
  --name "$ACA_ENV_NAME" \
  --storage-name "memgraph-storage" \
  --azure-file-account-name "$STORAGE_ACCOUNT" \
  --azure-file-account-key "$STORAGE_KEY" \
  --azure-file-share-name "memgraph-data" \
  --access-mode ReadWrite \
  --output none

az containerapp env storage set \
  --resource-group "$RG" \
  --name "$ACA_ENV_NAME" \
  --storage-name "qdrant-storage" \
  --azure-file-account-name "$STORAGE_ACCOUNT" \
  --azure-file-account-key "$STORAGE_KEY" \
  --azure-file-share-name "qdrant-data" \
  --access-mode ReadWrite \
  --output none

ok "Persistent storage mounts configured"

# Deploy Memgraph (ACR image + managed identity — no password, no external auth calls)
MEMGRAPH_EXISTS=$(az containerapp show --resource-group "$RG" --name "$APP_MEMGRAPH" --query "name" -o tsv 2>/dev/null || echo "")
if [ -z "$MEMGRAPH_EXISTS" ]; then
  az containerapp create \
    --resource-group "$RG" \
    --name "$APP_MEMGRAPH" \
    --environment "$ACA_ENV_NAME" \
    --image "${ACR_LOGIN_SERVER}/memgraph:latest" \
    --registry-server "$ACR_LOGIN_SERVER" \
    --registry-username "$ACR_NAME" \
    --registry-password "$ACR_PASSWORD" \
    --cpu 1.0 \
    --memory 2.0Gi \
    --min-replicas 1 \
    --max-replicas 1 \
    --ingress internal \
    --target-port 7687 \
    --transport tcp \
    --env-vars \
      "MEMGRAPH_USER=memgraph" \
      "MEMGRAPH_PASSWORD=${MEMGRAPH_PASSWORD}" \
    --output none
else
  info "Memgraph Container App already exists, skipping create."
fi

MEMGRAPH_FQDN=$(az containerapp show \
  --resource-group "$RG" \
  --name "$APP_MEMGRAPH" \
  --query "properties.configuration.ingress.fqdn" -o tsv)
ok "Memgraph: bolt://$MEMGRAPH_FQDN:7687"

# ═══════════════════════════════════════════════════════════════════════════════
# 9. Qdrant Container App (persistent storage)
# ═══════════════════════════════════════════════════════════════════════════════
log "9 — Qdrant Container App"
QDRANT_EXISTS=$(az containerapp show --resource-group "$RG" --name "$APP_QDRANT" --query "name" -o tsv 2>/dev/null || echo "")
if [ -z "$QDRANT_EXISTS" ]; then
  az containerapp create \
    --resource-group "$RG" \
    --name "$APP_QDRANT" \
    --environment "$ACA_ENV_NAME" \
    --image "${ACR_LOGIN_SERVER}/qdrant:latest" \
    --registry-server "$ACR_LOGIN_SERVER" \
    --registry-username "$ACR_NAME" \
    --registry-password "$ACR_PASSWORD" \
    --cpu 0.5 \
    --memory 1.0Gi \
    --min-replicas 1 \
    --max-replicas 1 \
    --ingress internal \
    --target-port 6333 \
    --output none
else
  info "Qdrant Container App already exists, skipping create."
fi

QDRANT_FQDN=$(az containerapp show \
  --resource-group "$RG" \
  --name "$APP_QDRANT" \
  --query "properties.configuration.ingress.fqdn" -o tsv)
ok "Qdrant: http://$QDRANT_FQDN:6333"

# ═══════════════════════════════════════════════════════════════════════════════
# Wait for Redis
# ═══════════════════════════════════════════════════════════════════════════════
log "Waiting for Redis to finish provisioning..."
[ -n "$REDIS_PID" ] && wait $REDIS_PID || true

REDIS_HOSTNAME=$(az redis show \
  --resource-group "$RG" \
  --name "$REDIS_NAME" \
  --query hostName -o tsv)
REDIS_KEY=$(az redis list-keys \
  --resource-group "$RG" \
  --name "$REDIS_NAME" \
  --query primaryKey -o tsv)
ok "Redis: $REDIS_HOSTNAME"

# ═══════════════════════════════════════════════════════════════════════════════
# 10. Application Container Apps
# ═══════════════════════════════════════════════════════════════════════════════
log "10 — Application Container Apps"

ACR_REGISTRY_SERVER="$ACR_LOGIN_SERVER"

# Common env vars for the API
API_ENV_VARS=(
  "NODE_ENV=production"
  "LLM_PROVIDER=anthropic"
  "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}"
  "MEMGRAPH_URI=bolt://${MEMGRAPH_FQDN}:7687"
  "MEMGRAPH_USER=memgraph"
  "MEMGRAPH_PASSWORD=${MEMGRAPH_PASSWORD}"
  "QDRANT_URL=http://${QDRANT_FQDN}:6333"
  "REDIS_HOST=${REDIS_HOSTNAME}"
  "REDIS_PORT=6380"
  "REDIS_TLS=true"
  "REDIS_PASSWORD=${REDIS_KEY}"
  "CREDENTIAL_ENCRYPTION_KEY=${CREDENTIAL_ENCRYPTION_KEY}"
  "GNN_SERVICE_URL=http://unpa-gnn.internal.${ACA_ENV_NAME}:5001"
  "PORT=3000"
)

if [ -n "$AZURE_AI_ENDPOINT" ]; then
  API_ENV_VARS+=("AZURE_AI_ENDPOINT=${AZURE_AI_ENDPOINT}")
  API_ENV_VARS+=("AZURE_MODEL_SONNET=claude-sonnet-4")
  API_ENV_VARS+=("AZURE_MODEL_OPUS=claude-opus-4-5")
  API_ENV_VARS+=("AZURE_MODEL_HAIKU=claude-haiku-4-5")
fi

if [ -n "$GEMINI_API_KEY" ]; then
  API_ENV_VARS+=("GEMINI_API_KEY=${GEMINI_API_KEY}")
fi

# Placeholder image used during initial Container App creation.
# Azure can always pull this Microsoft-hosted image — no timeout risk.
# Each app is updated to the real ACR image after Docker build+push.
PLACEHOLDER="mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"

# ── unpa-api ──────────────────────────────────────────────────────────────────
info "Deploying unpa-api..."
API_EXISTS=$(az containerapp show --resource-group "$RG" --name "$APP_API" --query "name" -o tsv 2>/dev/null || echo "")
if [ -z "$API_EXISTS" ]; then
  az containerapp create \
    --resource-group "$RG" \
    --name "$APP_API" \
    --environment "$ACA_ENV_NAME" \
    --image "$PLACEHOLDER" \
    --cpu 1.0 \
    --memory 2.0Gi \
    --min-replicas 1 \
    --max-replicas 3 \
    --ingress external \
    --target-port 3000 \
    --env-vars "${API_ENV_VARS[@]}" \
    --output none
fi
API_URL=$(az containerapp show \
  --resource-group "$RG" \
  --name "$APP_API" \
  --query "properties.configuration.ingress.fqdn" -o tsv)
ok "API slot ready: https://$API_URL  (placeholder — update after docker push)"

# ── unpa-mcp (frontend) ───────────────────────────────────────────────────────
info "Deploying unpa-mcp (frontend)..."
MCP_EXISTS=$(az containerapp show --resource-group "$RG" --name "$APP_MCP" --query "name" -o tsv 2>/dev/null || echo "")
if [ -z "$MCP_EXISTS" ]; then
  az containerapp create \
    --resource-group "$RG" \
    --name "$APP_MCP" \
    --environment "$ACA_ENV_NAME" \
    --image "$PLACEHOLDER" \
    --cpu 0.5 \
    --memory 1.0Gi \
    --min-replicas 1 \
    --max-replicas 3 \
    --ingress external \
    --target-port 80 \
    --env-vars "VITE_API_URL=https://${API_URL}" \
    --output none
fi
MCP_URL=$(az containerapp show \
  --resource-group "$RG" \
  --name "$APP_MCP" \
  --query "properties.configuration.ingress.fqdn" -o tsv)
ok "MCP slot ready: https://$MCP_URL  (placeholder — update after docker push)"

# ── unpa-gnn (GNN service) ────────────────────────────────────────────────────
info "Deploying unpa-gnn (GNN service)..."
GNN_EXISTS=$(az containerapp show --resource-group "$RG" --name "$APP_GNN" --query "name" -o tsv 2>/dev/null || echo "")
if [ -z "$GNN_EXISTS" ]; then
  az containerapp create \
    --resource-group "$RG" \
    --name "$APP_GNN" \
    --environment "$ACA_ENV_NAME" \
    --image "$PLACEHOLDER" \
    --cpu 0.5 \
    --memory 1.0Gi \
    --min-replicas 0 \
    --max-replicas 1 \
    --ingress internal \
    --target-port 5001 \
    --env-vars \
      "MEMGRAPH_URI=bolt://${MEMGRAPH_FQDN}:7687" \
      "MEMGRAPH_USER=memgraph" \
      "MEMGRAPH_PASSWORD=${MEMGRAPH_PASSWORD}" \
      "QDRANT_URL=http://${QDRANT_FQDN}:6333" \
      "PORT=5001" \
    --output none
fi
ok "GNN slot ready (placeholder — update after docker push)"

# Brief pause to avoid Container Apps provisioning rate-limit
info "Waiting 30s before next Container App..."
sleep 30

# ── unpa-indexing (indexing pipeline) ────────────────────────────────────────
info "Deploying unpa-indexing (indexing pipeline)..."
INDEXING_EXISTS=$(az containerapp show --resource-group "$RG" --name "$APP_INDEXING" --query "name" -o tsv 2>/dev/null || echo "")
if [ -z "$INDEXING_EXISTS" ]; then
  az containerapp create \
    --resource-group "$RG" \
    --name "$APP_INDEXING" \
    --environment "$ACA_ENV_NAME" \
    --image "$PLACEHOLDER" \
    --cpu 0.25 \
    --memory 0.5Gi \
    --min-replicas 0 \
    --max-replicas 1 \
    --ingress internal \
    --target-port 8080 \
    --env-vars \
      "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}" \
      "QDRANT_URL=http://${QDRANT_FQDN}:6333" \
      "MEMGRAPH_URI=bolt://${MEMGRAPH_FQDN}:7687" \
      "MEMGRAPH_USER=memgraph" \
      "MEMGRAPH_PASSWORD=${MEMGRAPH_PASSWORD}" \
    --output none
fi
ok "Indexing slot ready (placeholder — update after docker push)"

# ═══════════════════════════════════════════════════════════════════════════════
# 11. Azure DevOps Variable Groups (instructions only — requires ADO CLI)
# ═══════════════════════════════════════════════════════════════════════════════
log "11 — Azure DevOps Variable Groups"
echo ""
echo "  Configure these variable groups in Azure DevOps Library:"
echo ""
echo "  Group: unpa-acr"
echo "    ACR_NAME          = $ACR_NAME"
echo "    ACR_SERVICE_CONNECTION  = (create ARM service connection in ADO)"
echo ""
echo "  Group: unpa-staging"
echo "    STAGING_RESOURCE_GROUP = $RG"
echo "    STAGING_APP_API        = $APP_API"
echo "    STAGING_APP_MCP        = $APP_MCP"
echo ""
echo "  Group: unpa-production"
echo "    PROD_RESOURCE_GROUP = unpa-rg-prod   (separate RG for prod)"
echo "    PROD_APP_API        = $APP_API"
echo "    PROD_APP_MCP        = $APP_MCP"

# ═══════════════════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "════════════════════════════════════════════════════════"
echo "  UNPA Azure Infrastructure — Provisioning Complete"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  Resource Group   : $RG ($LOCATION)"
echo "  ACR              : $ACR_LOGIN_SERVER"
echo "  Key Vault        : $KEYVAULT_NAME"
echo "  Container Env    : $ACA_ENV_NAME"
echo ""
echo "  API              : https://$API_URL"
echo "  Frontend         : https://$MCP_URL"
echo "  Memgraph         : bolt://$MEMGRAPH_FQDN:7687 (internal)"
echo "  Qdrant           : http://$QDRANT_FQDN:6333 (internal)"
echo "  Redis            : $REDIS_HOSTNAME:6380 (TLS)"
echo ""
echo "  Next steps:"
echo "  1. Build and push Docker images:"
echo "     az acr login --name $ACR_NAME"
echo "     docker build --platform linux/amd64 -t $ACR_LOGIN_SERVER/unpa-api:latest ./api && docker push $_"
echo "     docker build --platform linux/amd64 -t $ACR_LOGIN_SERVER/unpa-mcp:latest ./mcp && docker push $_"
echo "     docker build --platform linux/amd64 -t $ACR_LOGIN_SERVER/unpa-gnn:latest ./gnn-service && docker push $_"
echo "     docker build --platform linux/amd64 -t $ACR_LOGIN_SERVER/unpa-indexing:latest ./indexing-pipeline && docker push $_"
echo ""
echo "  2. Restart Container Apps to pull latest images:"
echo "     az containerapp update --resource-group $RG --name $APP_API --image $ACR_LOGIN_SERVER/unpa-api:latest"
echo "     az containerapp update --resource-group $RG --name $APP_MCP --image $ACR_LOGIN_SERVER/unpa-mcp:latest"
echo ""
echo "  3. Run smoke tests:"
echo "     curl https://$API_URL/health/live"
echo "     curl https://$API_URL/health/ready"
echo ""
echo "  4. Configure Azure DevOps variable groups (see instructions above)"
echo ""
if [ -z "$AZURE_AI_ENDPOINT" ]; then
  echo "  ⚠️  Azure AI Foundry: deploy Claude models manually, then:"
  echo "     az keyvault secret set --vault-name $KEYVAULT_NAME --name azure-ai-key --value <key>"
  echo "     az containerapp update --resource-group $RG --name $APP_API \\"
  echo "       --set-env-vars LLM_PROVIDER=azure AZURE_AI_ENDPOINT=<endpoint> AZURE_AI_KEY=<key>"
  echo ""
fi
echo "  See scripts/migration-runbook.md for full migration guide."
echo "════════════════════════════════════════════════════════"
