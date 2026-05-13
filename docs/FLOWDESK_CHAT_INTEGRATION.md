# FlowDesk AI Chat — Build & Integration Guide

> **Purpose:** This guide covers how to build the `@unpa/chat` React component, distribute it to a recipient (FlowDesk) application, and integrate the FlowDeskProxy as a reference gateway between the client application and the GXE API.
>
> **Roles:**
> - **UNPA team** — builds and publishes the `@unpa/chat` package
> - **FlowDesk team** — installs the package, deploys a proxy, embeds the chat widget

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [UNPA Side: Building the Chat Package](#2-unpa-side-building-the-chat-package)
3. [FlowDesk Side: Installing the Package](#3-flowdesk-side-installing-the-package)
4. [FlowDesk Side: Embedding the Widget](#4-flowdesk-side-embedding-the-widget)
5. [FlowDesk Side: Proxy Setup (Reference Implementation)](#5-flowdesk-side-proxy-setup-reference-implementation)
6. [Configuration Reference](#6-configuration-reference)
7. [Development Workflow (Full Local Stack)](#7-development-workflow-full-local-stack)
8. [Production Build](#8-production-build)
9. [Docker Deployment](#9-docker-deployment)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Architecture Overview

The AI chat feature consists of three independent layers. Each layer has a clear owner and deployment boundary:

```
┌─────────────────────────────────────────────────────┐
│              FlowDesk Application (recipient)        │
│                                                      │
│  ┌────────────────────────────────┐                  │
│  │  React SPA                     │                  │
│  │  import { UnpaChat }           │                  │
│  │    from '@unpa/chat'           │  ← npm package   │
│  │                                │    from local    │
│  │  <UnpaChat                     │    path or tar   │
│  │    apiBaseUrl="/proxy"         │                  │
│  │    graphId="laptop-provisioning│                  │
│  │  />                            │                  │
│  └───────────────┬────────────────┘                  │
│                  │ HTTP REST + WebSocket              │
│  ┌───────────────▼────────────────┐                  │
│  │  FlowDeskProxy  (port 9000)    │  ← recipient     │
│  │  ASP.NET Core 8 + SignalR      │    deploys this  │
│  │  YARP reverse proxy            │    (reference    │
│  │                                │    impl from     │
│  │  /hubs/chat  → SignalR hub     │    UNPA repo)    │
│  │  /proxy/**   → REST controller │                  │
│  │  /api/**     → YARP → GXE API  │                  │
│  └───────────────┬────────────────┘                  │
└──────────────────│──────────────────────────────────┘
                   │ HTTP (internal network)
┌──────────────────▼──────────────────────────────────┐
│              GXE API  (UNPA service)                 │
│  Node.js/Express  :3010                              │
│  POST /api/v1/flowdesk/chat                          │
│  POST /api/v1/flowdesk/laptop/chat                   │
│  GET  /api/v1/flowdesk/graph-versions                │
│  ...                                                 │
│  (independent, separately managed service)           │
└─────────────────────────────────────────────────────┘
```

### Why the proxy?

The proxy serves two purposes for the FlowDesk team:

1. **Address masking** — the GXE API (`https://api.unpa.internal`) is never exposed to the browser. All requests go to FlowDesk's own domain (e.g., `https://flowdesk.example.com/proxy/...`).

2. **Address unification** — frontend code uses simple relative paths (`/proxy/chat`, `/hubs/chat`, `/api/v1/...`) regardless of where GXE is actually hosted. Changing the GXE endpoint requires updating only the proxy configuration, not the frontend code.

### Package distribution strategy

`@unpa/chat` is a **private React component library**. It is not published to npm. Distribution works via:
- **Local path** — during development (both repos checked out on the same machine)
- **npm tarball** — for deployment handoff (`npm pack` → transfer `unpa-chat-1.0.0.tgz` → `npm install`)
- **Private npm registry** — optional (Azure Artifacts, Verdaccio, GitHub Packages)

---

## 2. UNPA Side: Building the Chat Package

### 2.1 Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20 LTS |
| npm | 9+ |

No additional global tools are needed. Rollup is a devDependency.

### 2.2 Build the package

```powershell
cd d:\UN\Repos\UNPA\UNPA_Ingest\packages\unpa-chat

# Install build dependencies (devDependencies only — peerDeps are not installed)
npm install

# Build: produces dist/index.js (CJS), dist/index.esm.js (ESM), dist/styles.css
npm run build
```

Expected output:

```
packages/unpa-chat/
  dist/
    index.js          ← CommonJS bundle (~50 KB)
    index.js.map
    index.esm.js      ← ES Module bundle (~50 KB)
    index.esm.js.map
    styles.css        ← extracted CSS
```

> The `dist/` directory is **committed to git** as the built artifact. Rebuild only when source files in `src/` change.

### 2.3 What gets bundled vs. what does not

**Bundled in `dist/`** (self-contained):
- All source files from `src/`
- Internal utility functions

**NOT bundled** (peerDependencies — must be provided by the host application):

| Package | Min version |
|---------|-------------|
| `react` | ≥ 17.0.0 |
| `react-dom` | ≥ 17.0.0 |
| `@mui/material` | ≥ 5.0.0 |
| `@mui/icons-material` | ≥ 5.0.0 |
| `@emotion/react` | ≥ 11.0.0 |
| `@emotion/styled` | ≥ 11.0.0 |
| `lucide-react` | ≥ 0.200.0 |

The host application must have all peerDependencies installed. The widget will not render without them.

### 2.4 Preparing for transfer

**Option A: Local path reference** (when both projects are on the same filesystem)

No extra action needed. See [Section 3](#3-flowdesk-side-installing-the-package).

**Option B: npm tarball** (cross-machine transfer)

```powershell
cd d:\UN\Repos\UNPA\UNPA_Ingest\packages\unpa-chat

# Create a versioned tarball
npm pack

# Output: unpa-chat-1.0.0.tgz
# Transfer this file to the FlowDesk team
```

**Option C: Private registry** (optional, for automated CI/CD)

```powershell
# Publish to Azure Artifacts or similar (requires registry configuration)
npm publish --registry https://pkgs.dev.azure.com/your-org/_packaging/your-feed/npm/registry/
```

---

## 3. FlowDesk Side: Installing the Package

The FlowDesk application must install `@unpa/chat` and all its peer dependencies.

### 3.1 Install peer dependencies

In the FlowDesk React application:

```powershell
npm install react react-dom @mui/material @mui/icons-material @emotion/react @emotion/styled lucide-react
```

> Skip packages already present in the project.

### 3.2 Install @unpa/chat

**Option A: Local path** (both repos on same machine)

```powershell
# From the FlowDesk project root
npm install "file:../../UNPA_Ingest/packages/unpa-chat"

# Or with a relative or absolute path:
npm install "file:D:/UN/Repos/UNPA/UNPA_Ingest/packages/unpa-chat"
```

This adds to `package.json`:
```json
{
  "dependencies": {
    "@unpa/chat": "file:../../UNPA_Ingest/packages/unpa-chat"
  }
}
```

> On `npm install`, npm runs the package's `prepare` script (`npm run build`), rebuilding `dist/` automatically.

**Option B: Tarball** (file received from UNPA team)

```powershell
# Place unpa-chat-1.0.0.tgz in a local directory, e.g., ./vendor/
npm install ./vendor/unpa-chat-1.0.0.tgz
```

**Option C: Private registry**

```powershell
npm install @unpa/chat --registry https://pkgs.dev.azure.com/your-org/_packaging/your-feed/npm/registry/
```

### 3.3 Import CSS

In the FlowDesk app's entry point (e.g., `main.jsx` or `index.js`):

```javascript
import '@unpa/chat/dist/styles.css';
```

This loads the widget's default styling. You can override styles using the `sx` prop or MUI theming.

---

## 4. FlowDesk Side: Embedding the Widget

### 4.1 Basic usage

```jsx
import { UnpaChat } from '@unpa/chat';
import '@unpa/chat/dist/styles.css';

function App() {
  return (
    <UnpaChat
      apiBaseUrl="/proxy"       // relative path — proxied by FlowDeskProxy
      graphId="laptop-provisioning"  // graph ID from the UNPA graph catalog
      userId={currentUser.id}        // optional: identify the user
      theme="light"                  // "light" | "dark"
    />
  );
}
```

### 4.2 Props reference

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `apiBaseUrl` | `string` | — | Base URL for API calls. Use `"/proxy"` when FlowDeskProxy is running. Use `"/api/v1"` for direct API (no proxy). |
| `graphId` | `string` | — | AOPEG graph ID to execute. Determines the conversation flow. |
| `userId` | `string` | `null` | Optional user identifier for session tracking and personalization. |
| `theme` | `"light" \| "dark"` | `"light"` | Visual theme. Inherits MUI ThemeProvider if available. |
| `sx` | `object` | `{}` | MUI `sx` prop for container styling overrides. |
| `onComplete` | `function` | `null` | Called when the graph execution completes. Receives `(sessionResult)`. |

### 4.3 Using the headless hook

For complete UI control, use `useUnpaChat` directly:

```jsx
import { useUnpaChat } from '@unpa/chat';

function CustomChat() {
  const {
    messages,          // array of { role, content, choices, form }
    isLoading,         // boolean
    isComplete,        // boolean — graph finished
    sendMessage,       // (text: string) => Promise<void>
    submitChoice,      // (choiceId: string) => Promise<void>
    submitForm,        // (formData: object) => Promise<void>
    sessionId,         // current session UUID
    reset,             // () => void — start a new session
  } = useUnpaChat({
    apiBaseUrl: '/proxy',
    graphId: 'laptop-provisioning',
    userId: 'user-123',
  });

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i} className={msg.role}>
          {msg.content}
          {msg.choices && (
            <div>
              {msg.choices.map(c => (
                <button key={c.id} onClick={() => submitChoice(c.id)}>{c.label}</button>
              ))}
            </div>
          )}
        </div>
      ))}
      <input
        onKeyDown={e => e.key === 'Enter' && sendMessage(e.target.value)}
        disabled={isLoading || isComplete}
      />
    </div>
  );
}
```

### 4.4 API calls made by the widget

The widget calls the following endpoints relative to `apiBaseUrl`:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/flowdesk/chat` | Send a message and receive the next graph step |
| `GET`  | `/api/v1/flowdesk/chat/:sessionId` | Resume an existing session |

Request body for `POST /api/v1/flowdesk/chat`:
```json
{
  "sessionId": "uuid",
  "userId":    "user-123",
  "message":   "I need a laptop",
  "graphId":   "laptop-provisioning"
}
```

Response shape:
```json
{
  "response":     "What type of work will you be doing?",
  "choices":      [{ "id": "dev", "label": "Software development" }, ...],
  "executionLog": [...],
  "state":        "waiting",
  "isComplete":   false
}
```

---

## 5. FlowDesk Side: Proxy Setup (Reference Implementation)

The `flowdesk-proxy/` directory in the UNPA repository is a **reference implementation** of the gateway that every FlowDesk host should deploy. It is designed to be copied, adapted, and deployed by the recipient team.

### 5.1 What FlowDeskProxy does

```
Browser (FlowDesk SPA)
  │
  ├── GET  /hubs/chat          WebSocket (SignalR)
  │     └── ChatHub.cs         → GxeApiService → GXE API /api/v1/flowdesk/chat
  │
  ├── POST /proxy/chat/message  REST fallback
  │     └── ChatController.cs  → GxeApiService → GXE API /api/v1/flowdesk/chat
  │
  └── GET  /api/**              YARP reverse proxy
        └── appsettings.json   → http://gxe-api-host:3010/api/**
```

The client application never sees the GXE API address. All traffic passes through the proxy on a controlled domain.

### 5.2 Running the proxy in development

**Prerequisites:**
- .NET 8 SDK: https://dotnet.microsoft.com/download/dotnet/8.0
- GXE API running on port 3010 (see [DEV_SETUP.md](DEV_SETUP.md))

**Start the proxy:**

```powershell
cd flowdesk-proxy\FlowDeskProxy
dotnet run
```

The proxy starts on **port 9000** by default. Verify:

```powershell
curl http://localhost:9000/health
# or open http://localhost:9000 in a browser
```

**Dev configuration** (`appsettings.Development.json`):

```json
{
  "GxeApi": {
    "BaseUrl": "http://localhost:3010"
  },
  "Cors": {
    "AllowedOrigins": [
      "http://localhost:3004",
      "http://localhost:5173"
    ]
  }
}
```

> Place this file at `flowdesk-proxy/FlowDeskProxy/appsettings.Development.json`. It overrides `appsettings.json` when `ASPNETCORE_ENVIRONMENT=Development`.

### 5.3 Running the embedded demo SPA (ClientApp)

The `ClientApp/` is a standalone React dev app that demonstrates the full chat experience using SignalR. It is for development and demo purposes only.

```powershell
cd flowdesk-proxy\FlowDeskProxy\ClientApp
npm install
npm run dev
# Opens at http://localhost:3004
```

The Vite dev server proxies all requests to the proxy on port 9000:
- `/proxy/**` → `http://localhost:9000`
- `/hubs/**`  → `ws://localhost:9000` (WebSocket)
- `/api/**`   → `http://localhost:9000` → forwarded to GXE

### 5.4 Configuration: connecting to GXE API

Edit `appsettings.json` (or override via environment variables):

```json
{
  "GxeApi": {
    "BaseUrl": "http://YOUR-GXE-HOST:3010",
    "TimeoutMs": 30000
  },
  "Cors": {
    "AllowedOrigins": [
      "https://your-flowdesk-domain.com"
    ]
  }
}
```

**Via environment variables** (recommended for production and Docker):

| Environment Variable | Value | Description |
|---------------------|-------|-------------|
| `GxeApi__BaseUrl` | `http://gxe-host:3010` | GXE API address (double underscore = nesting) |
| `GxeApi__TimeoutMs` | `30000` | Request timeout in milliseconds |
| `Cors__AllowedOrigins__0` | `https://flowdesk.example.com` | First allowed CORS origin |
| `Cors__AllowedOrigins__1` | `https://flowdesk-staging.example.com` | Additional origins (increment index) |
| `ASPNETCORE_ENVIRONMENT` | `Development` / `Production` | Switches appsettings files |
| `ASPNETCORE_URLS` | `http://+:9000` | Binding address |

> ASP.NET Core maps `__` to `:` in configuration keys. `GxeApi__BaseUrl` equals the JSON path `GxeApi.BaseUrl`.

### 5.5 Adapting the proxy for your project

The proxy is designed to be copied into the FlowDesk repository and modified:

1. **Copy** the `flowdesk-proxy/FlowDeskProxy/` directory into the FlowDesk project
2. **Update** `GxeApi:BaseUrl` to point to the production GXE API endpoint
3. **Update** `Cors:AllowedOrigins` to match the FlowDesk frontend domain(s)
4. **Optionally** add authentication middleware (`app.UseAuthentication()`) if FlowDesk has its own auth layer
5. **Remove** `ClientApp/` if the FlowDesk team has their own separate frontend

---

## 6. Configuration Reference

### @unpa/chat widget

The widget reads configuration from its props — no environment variables. All config passes through the React component tree.

| Prop / Parameter | Where set | Example |
|------------------|-----------|---------|
| `apiBaseUrl` | React prop | `"/proxy"` (proxy) or `"/api/v1"` (direct) |
| `graphId` | React prop | `"laptop-provisioning"`, `"hr-onboarding"` |
| `userId` | React prop | `"user-uuid-here"` |

### FlowDeskProxy

| Setting (appsettings.json) | Env Variable Override | Dev Default | Prod Value |
|----------------------------|-----------------------|-------------|------------|
| `GxeApi:BaseUrl` | `GxeApi__BaseUrl` | `http://localhost:3010` | GXE API URL |
| `GxeApi:TimeoutMs` | `GxeApi__TimeoutMs` | `30000` | `30000` |
| `Cors:AllowedOrigins[0]` | `Cors__AllowedOrigins__0` | `http://localhost:3004` | FlowDesk domain |
| `ASPNETCORE_URLS` | (env only) | `http://localhost:9000` | `http://+:9000` |
| `ASPNETCORE_ENVIRONMENT` | (env only) | `Development` | `Production` |

### Port summary

| Service | Port | Who runs it |
|---------|------|-------------|
| GXE API | 3010 | UNPA team |
| FlowDeskProxy | 9000 | FlowDesk team |
| ClientApp (dev) | 3004 | FlowDesk dev only |

---

## 7. Development Workflow (Full Local Stack)

This section describes running the complete development environment on one machine — typical for FlowDesk developers working on the chat integration.

### Step 1: Start the UNPA infrastructure

```powershell
cd d:\UN\Repos\UNPA\UNPA_Ingest

# Start databases (Memgraph + Qdrant + Redis + MSSQL)
docker compose up -d redis memgraph qdrant mssql

# Start GXE API
cd api
npm run dev
# API running at http://localhost:3010
```

### Step 2: Start FlowDeskProxy

```powershell
cd d:\UN\Repos\UNPA\UNPA_Ingest\flowdesk-proxy\FlowDeskProxy

# First run: restore NuGet packages (automatic on dotnet run)
dotnet run
# Proxy running at http://localhost:9000
```

### Step 3: Start the FlowDesk development app

**Option A — Use the embedded ClientApp demo:**

```powershell
cd d:\UN\Repos\UNPA\UNPA_Ingest\flowdesk-proxy\FlowDeskProxy\ClientApp
npm install
npm run dev
# App at http://localhost:3004
```

**Option B — Use your own FlowDesk React app:**

Ensure your Vite config proxies requests to the proxy:

```javascript
// vite.config.js in FlowDesk app
export default {
  server: {
    proxy: {
      '/proxy': 'http://localhost:9000',
      '/hubs':  { target: 'http://localhost:9000', ws: true },
      '/api':   'http://localhost:9000',
    }
  }
}
```

Then install and use the widget:

```powershell
# Install @unpa/chat from local UNPA path
npm install "file:D:/UN/Repos/UNPA/UNPA_Ingest/packages/unpa-chat"

# Install peer dependencies
npm install @mui/material @mui/icons-material @emotion/react @emotion/styled lucide-react
```

### Development ports overview

| Service | URL | Started by |
|---------|-----|-----------|
| GXE API | `http://localhost:3010` | `cd api && npm run dev` |
| FlowDeskProxy | `http://localhost:9000` | `dotnet run` |
| ClientApp demo | `http://localhost:3004` | `npm run dev` (ClientApp/) |
| FlowDesk host (own app) | `http://localhost:5173` (typical) | FlowDesk team |

---

## 8. Production Build

### 8.1 Build @unpa/chat

```powershell
cd packages\unpa-chat
npm install
npm run build
# dist/ is ready for packaging
```

Create a distributable tarball:

```powershell
npm pack
# Creates: unpa-chat-1.0.0.tgz
```

Transfer `unpa-chat-1.0.0.tgz` to the FlowDesk team.

### 8.2 Build FlowDeskProxy (standalone .NET)

```powershell
# 1. Build and bundle the React SPA
cd flowdesk-proxy\FlowDeskProxy\ClientApp
npm install
npm run build
# Output: flowdesk-proxy/FlowDeskProxy/wwwroot/

# 2. Publish the .NET application
cd ..\   # flowdesk-proxy/FlowDeskProxy/
dotnet publish -c Release -o .\bin\publish
```

The `bin\publish\` directory is self-contained — copy it to the target server and run:

```powershell
# On the target server
set ASPNETCORE_ENVIRONMENT=Production
set GxeApi__BaseUrl=http://gxe-api-host:3010
set Cors__AllowedOrigins__0=https://flowdesk.example.com
.\bin\publish\FlowDeskProxy.exe     # Windows
# or
dotnet .\bin\publish\FlowDeskProxy.dll   # Linux
```

### 8.3 Behind nginx or IIS

In production, FlowDeskProxy is typically placed behind a reverse proxy that handles TLS:

**nginx example:**

```nginx
server {
    listen 443 ssl;
    server_name flowdesk.example.com;

    ssl_certificate     /etc/ssl/certs/flowdesk.crt;
    ssl_certificate_key /etc/ssl/private/flowdesk.key;

    location / {
        proxy_pass         http://localhost:9000;
        proxy_http_version 1.1;

        # WebSocket support (required for SignalR)
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";

        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        proxy_read_timeout 3600s;   # Keep WebSocket connections alive
    }
}
```

> WebSocket (`Upgrade` header) support is required for SignalR. Without it, SignalR falls back to long-polling, which is slower but functional.

---

## 9. Docker Deployment

A multi-stage `Dockerfile` is provided at `flowdesk-proxy/Dockerfile`. It builds both the React SPA and the ASP.NET Core application in a single image.

### 9.1 Build the image

From the `flowdesk-proxy/` directory:

```powershell
cd d:\UN\Repos\UNPA\UNPA_Ingest\flowdesk-proxy

docker build -t flowdesk-proxy:latest .
```

Build stages:
1. **spa-build** (node:20-alpine) — runs `npm run build` → wwwroot/
2. **dotnet-build** (dotnet/sdk:8.0) — runs `dotnet publish`
3. **runtime** (dotnet/aspnet:8.0) — minimal runtime image (~230 MB)

### 9.2 Run the container

```powershell
docker run -d \
  --name flowdesk-proxy \
  -p 9000:9000 \
  -e GxeApi__BaseUrl=http://gxe-api-host:3010 \
  -e Cors__AllowedOrigins__0=https://flowdesk.example.com \
  -e ASPNETCORE_ENVIRONMENT=Production \
  flowdesk-proxy:latest
```

Verify:

```powershell
docker logs flowdesk-proxy
curl http://localhost:9000/health
```

### 9.3 Docker Compose with GXE API

Add to the FlowDesk project's `docker-compose.yml`:

```yaml
services:

  # FlowDesk proxy — gateway to the GXE API
  flowdesk-proxy:
    image: flowdesk-proxy:latest
    build:
      context: ./flowdesk-proxy
      dockerfile: Dockerfile
    ports:
      - "9000:9000"
    environment:
      ASPNETCORE_ENVIRONMENT: Production
      GxeApi__BaseUrl: http://gxe-api:3010      # container name of the GXE API
      Cors__AllowedOrigins__0: http://localhost:3004
      Cors__AllowedOrigins__1: https://flowdesk.example.com
    depends_on:
      gxe-api:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:9000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # GXE API — provided by the UNPA team (external image or build)
  gxe-api:
    image: unpa-api:latest          # image built from UNPA_Ingest/api/
    ports:
      - "3010:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      MEMGRAPH_URI: bolt://memgraph:7687
      QDRANT_URL: http://qdrant:6333
      REDIS_HOST: redis
      ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY}"
    depends_on:
      - memgraph
      - qdrant
      - redis
    healthcheck:
      test: ["CMD", "node", "scripts/docker-healthcheck.js"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s

  memgraph:
    image: memgraph/memgraph:latest
    ports: ["7687:7687"]
    volumes: [memgraph-data:/var/lib/memgraph]

  qdrant:
    image: qdrant/qdrant:latest
    ports: ["6333:6333"]
    volumes: [qdrant-data:/qdrant/storage]

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes: [redis-data:/data]

volumes:
  memgraph-data:
  qdrant-data:
  redis-data:
```

### 9.4 Connecting to an external GXE API

If GXE API runs on a separate host (not in the same Docker network):

```yaml
environment:
  GxeApi__BaseUrl: https://api.unpa.internal   # external address
```

Ensure the Docker container can reach this address:
- **Network**: container must not be in an isolated network
- **TLS**: if the GXE API uses HTTPS with a self-signed cert, add `GxeApi__IgnoreSslErrors=true` (dev only)
- **Firewall**: port 3010 must be open from the proxy container to the GXE host

---

## 10. Troubleshooting

### Widget does not render — blank area

**Cause:** Missing peer dependency.

**Fix:** Check the browser console for errors like `Cannot resolve '@mui/material'`. Install the missing package:

```powershell
npm install @mui/material @mui/icons-material @emotion/react @emotion/styled
```

### Widget renders but shows no response from API

**Check 1:** Is the proxy running?
```powershell
curl http://localhost:9000/proxy/chat/session
# Should return 405 Method Not Allowed (not a connection error)
```

**Check 2:** Is `apiBaseUrl` correct in the widget props?
- Use `/proxy` when the FlowDeskProxy is running
- Use `/api/v1` for direct GXE access (no proxy)

**Check 3:** Is the GXE API reachable from the proxy?
```powershell
# Test from proxy container (or host)
curl http://localhost:3010/health
```

### SignalR WebSocket connection fails

**Cause 1:** CORS origin not in the allowed list.

**Fix:** Add the FlowDesk frontend origin to `Cors:AllowedOrigins` in `appsettings.json`.

**Cause 2:** nginx reverse proxy does not forward `Upgrade` header.

**Fix:** Add WebSocket headers to the nginx config (see [Section 8.3](#83-behind-nginx-or-iis)).

**Cause 3:** SignalR falls back to long-polling automatically if WebSocket fails — this is functional but slower. Check the browser Network tab for `/hubs/chat/negotiate` and the subsequent connection type.

### `npm install "file:..."` does not update after UNPA rebuild

npm caches the package contents. Force a fresh install:

```powershell
npm install "file:D:/UN/Repos/UNPA/UNPA_Ingest/packages/unpa-chat" --force
```

Or delete `node_modules/@unpa/chat` and re-install.

### dotnet run fails: port 9000 in use

```powershell
# Find the process using port 9000
netstat -ano | findstr :9000

# Kill it (replace PID)
taskkill /PID <PID> /F
```

### Requests return 502/503 from proxy

The proxy is running but cannot reach the GXE API. Check `GxeApi:BaseUrl` in `appsettings.json` and verify the GXE API is up:

```powershell
curl http://localhost:3010/health
# Expected: {"status":"ok", ...}
```

---

*For the GXE API deployment and infrastructure setup, see [DEV_SETUP.md](DEV_SETUP.md) and [scripts/migration-runbook.md](../scripts/migration-runbook.md).*
