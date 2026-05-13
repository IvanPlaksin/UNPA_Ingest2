# ─── Multi-stage Dockerfile: FlowDeskProxy (ASP.NET Core 8 + React SPA) ────────
#
# Build context: flowdesk-proxy/ (the directory containing this file)
#
# Usage:
#   docker build -t flowdesk-proxy:latest .
#   docker run -p 9000:9000 \
#     -e GxeApi__BaseUrl=http://gxe-api:3010 \
#     -e Cors__AllowedOrigins__0=https://flowdesk.example.com \
#     flowdesk-proxy:latest

# ────────────────────────────────────────────────────────────────────────────────
# Stage 1 — Build the React SPA (ClientApp)
# ────────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS spa-build

WORKDIR /build/ClientApp

# Install dependencies (separate layer for cache efficiency)
COPY FlowDeskProxy/ClientApp/package*.json ./
RUN npm ci --prefer-offline

# Copy source and build
# Vite outputs to outDir: '../wwwroot' → /build/wwwroot/
COPY FlowDeskProxy/ClientApp/ ./
RUN npm run build

# ────────────────────────────────────────────────────────────────────────────────
# Stage 2 — Build the ASP.NET Core application
# ────────────────────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS dotnet-build

WORKDIR /src

# Restore dependencies first (layer cache)
COPY FlowDeskProxy/FlowDeskProxy.csproj ./FlowDeskProxy/
RUN dotnet restore ./FlowDeskProxy/FlowDeskProxy.csproj

# Copy source
COPY FlowDeskProxy/ ./FlowDeskProxy/

# Copy built React SPA into wwwroot (served as static files by ASP.NET)
COPY --from=spa-build /build/wwwroot ./FlowDeskProxy/wwwroot/

# Publish release build
RUN dotnet publish ./FlowDeskProxy/FlowDeskProxy.csproj \
    -c Release \
    -o /app/publish \
    --no-restore \
    /p:UseAppHost=false

# ────────────────────────────────────────────────────────────────────────────────
# Stage 3 — Runtime image (minimal ASP.NET Core runtime only)
# ────────────────────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime

WORKDIR /app

COPY --from=dotnet-build /app/publish .

# ── Runtime configuration ─────────────────────────────────────────────────────
ENV ASPNETCORE_URLS=http://+:9000
ENV ASPNETCORE_ENVIRONMENT=Production

# GXE API connection — MUST be overridden at runtime
# ENV GxeApi__BaseUrl=http://gxe-api-host:3010

# CORS — MUST include the FlowDesk host origin at runtime
# ENV Cors__AllowedOrigins__0=https://flowdesk.example.com

# ── Healthcheck ───────────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD wget -qO- http://localhost:9000/health 2>/dev/null || exit 1

EXPOSE 9000

ENTRYPOINT ["dotnet", "FlowDeskProxy.dll"]
