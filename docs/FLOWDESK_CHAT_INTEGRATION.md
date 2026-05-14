# FlowDesk AI Chat — Build & Integration Guide

> **Purpose:** This guide covers how to build the `@unpa/chat` React component, distribute it to the FlowDesk application, and wire up the API proxy layer between the widget and the GXE API.
>
> **Roles:**
> - **UNPA team** — builds and publishes the `@unpa/chat` package from `packages/unpa-chat/`
> - **FlowDesk team** — installs the package, configures the proxy, embeds the widget at `/ai-chat`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [UNPA Side: Building the Chat Package](#2-unpa-side-building-the-chat-package)
3. [FlowDesk Side: Installing the Package](#3-flowdesk-side-installing-the-package)
4. [FlowDesk Side: Embedding the Widget](#4-flowdesk-side-embedding-the-widget)
5. [Proxy Setup](#5-proxy-setup)
6. [Configuration Reference](#6-configuration-reference)
7. [Development Workflow (Full Local Stack)](#7-development-workflow-full-local-stack)
8. [Production Build & Deployment](#8-production-build--deployment)
9. [FlowDeskProxy Reference Implementation](#9-flowdeskproxy-reference-implementation)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Architecture Overview

The AI chat feature spans three layers. Each has its own deployment boundary:

```
┌──────────────────────────────────────────────────────────┐
│                FlowDesk Application                       │
│                                                           │
│  React SPA  (FlowDeskPortal / Vite)                       │
│  ┌───────────────────────────────────┐                    │
│  │  /ai-chat → <AiChatPage>          │                    │
│  │    └── <UnpaChat                  │                    │
│  │          apiBaseUrl={VITE_UNPA_   │  npm package       │
│  │            API_BASE_URL}          │  file:../packages/ │
│  │          userId={user.id}         │  unpa-chat         │
│  │          graphId="<uuid>"         │                    │
│  │          initialPrompt={...}      │                    │
│  │        />                         │                    │
│  └───────────────┬───────────────────┘                    │
└──────────────────│──────────────────────────────────────┘
                   │
       ┌───────────┴──────────────────────────────────────┐
       │ DEV: Vite dev proxy                               │
       │  /api/proxy/unpa/** → http://localhost:3010/api/v1│
       │                                                   │
       │ PROD: FlowDesk backend (YARP)                     │
       │  https://{flowdesk-api}/api/proxy/unpa/**         │
       │    → {GXE API internal}/api/v1/**                 │
       └───────────────────┬───────────────────────────────┘
                           │ HTTP (internal)
┌──────────────────────────▼───────────────────────────────┐
│              GXE API  (UNPA service, port 3010)           │
│  POST /api/v1/flowdesk/chat                               │
│  GET  /api/v1/graph-catalog/{graphId}                     │
│  GET  /api/v1/flowdesk/graph-versions                     │
│  GET  /api/v1/flowdesk/health                             │
│  (independently deployed; never exposed to the browser)   │
└──────────────────────────────────────────────────────────┘
```

### Why the proxy?

1. **Address masking** — the GXE API is an internal UNPA service. The browser never sees its address; all requests go through FlowDesk's own domain.
2. **Path normalization** — the widget calls `/api/proxy/unpa/flowdesk/chat`; the proxy rewrites this to `/api/v1/flowdesk/chat` before forwarding to GXE. Only the proxy configuration needs to change if the GXE API moves.

### Package distribution

`@unpa/chat` is a private React component library. It is not published to npm.

- **Current approach** — the built package (`packages/unpa-chat/`) lives in the FlowDesk `Clients/` directory alongside the portal, installed via a relative `file:` path.
- **Alternative** — `npm pack` tarball, transferred out-of-band.
- **Optional** — private npm registry (Azure Artifacts, GitHub Packages).

---

## 2. UNPA Side: Building the Chat Package

### 2.1 Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20 LTS |
| npm | 9+ |

Rollup is a devDependency — no global install needed.

### 2.2 Build

```powershell
cd d:\UN\Repos\UNPA\UNPA_Ingest\packages\unpa-chat

npm install        # install devDependencies

npm run build      # Rollup → dist/
```

Expected output:

```
packages/unpa-chat/
  dist/
    index.js          ← CommonJS bundle
    index.js.map
    index.esm.js      ← ES Module bundle
    index.esm.js.map
    styles.css        ← extracted CSS
```

> **The `dist/` directory is committed to git** as the built artifact. Rebuild only when source files in `src/` change.

### 2.3 Bundled vs. peer dependencies

**Bundled** — all source files in `src/`.

**Not bundled** (peerDependencies — must be present in the host app):

| Package | Min version |
|---------|-------------|
| `react` | ≥ 17.0.0 |
| `react-dom` | ≥ 17.0.0 |
| `@mui/material` | ≥ 5.0.0 |
| `@mui/icons-material` | ≥ 5.0.0 |
| `@emotion/react` | ≥ 11.0.0 |
| `@emotion/styled` | ≥ 11.0.0 |
| `lucide-react` | ≥ 0.200.0 |

### 2.4 Preparing for transfer

**Option A: Shared filesystem** — packages/ lives inside the recipient's repo. No transfer step (current approach).

**Option B: Tarball**

```powershell
cd d:\UN\Repos\UNPA\UNPA_Ingest\packages\unpa-chat
npm pack
# Output: unpa-chat-1.0.0.tgz — transfer to the FlowDesk team
```

---

## 3. FlowDesk Side: Installing the Package

### Repository layout

In the FlowDesk project the package folder lives alongside the portal:

```
FlowDesk\Frontend\Clients\
  FlowDeskPortal\        ← React application
  packages\
    unpa-chat\           ← @unpa/chat source + built dist/
  shared\
    ...
```

### 3.1 package.json entry

```json
{
  "dependencies": {
    "@unpa/chat": "file:../packages/unpa-chat"
  }
}
```

The path `../packages/unpa-chat` is relative to `FlowDeskPortal/`.

### 3.2 Install

```powershell
# From FlowDeskPortal/
npm install
```

npm resolves `file:../packages/unpa-chat`, runs the package's `prepare` script (`npm run build`), and symlinks the result into `node_modules/@unpa/chat`.

> If the UNPA team ships `dist/` pre-built and committed, the `prepare` script is a no-op — the existing `dist/` is used directly.

### 3.3 Import styles

In the app entry point (`main.tsx`):

```ts
import '@unpa/chat/dist/styles.css';
```

### 3.4 TypeScript declarations

The package is authored in JavaScript (JSX). FlowDesk declares the component types locally so TypeScript can type-check usages:

```ts
// src/declarations.d.ts
import type { CSSProperties } from 'react';

declare module '@unpa/chat' {
  export interface UnpaChatProps {
    apiBaseUrl:     string;
    userId:         string;
    graphId?:       string;
    graphVersion?:  string;
    sessionId?:     string;
    welcomeText?:   string;
    placeholder?:   string;
    initialPrompt?: string;
    theme?:         'dark' | 'light';
    className?:     string;
    width?:         string | number;
    height?:        string | number;
    style?:         CSSProperties;
    onComplete?:    (result: unknown) => void;
    onError?:       (err: unknown) => void;
  }

  export function UnpaChat(props: UnpaChatProps): JSX.Element;
  export function useUnpaChat(config: object): object;
  export function UnpaChatProvider(props: object): JSX.Element;
  export function useUnpaChatContext(): object;
}
```

> Update this file whenever new props are added to the package.

---

## 4. FlowDesk Side: Embedding the Widget

### 4.1 AiChatPage — current implementation

The widget is rendered inside a dedicated page component routed at `/ai-chat`:

```ts
// src/pages/AiChatPage.tsx
import { useLocation } from 'react-router-dom';
import { UnpaChat } from '@unpa/chat';
import '@unpa/chat/dist/styles.css';
import type { User } from '@shared/api';

interface AiChatPageProps {
    user: User;
}

interface LocationState {
    initialPrompt?: string;
}

export function AiChatPage({ user }: AiChatPageProps) {
    const location = useLocation();
    const state = location.state as LocationState | null;
    const initialPrompt = state?.initialPrompt;

    return (
        <div className="h-full w-full flex flex-col">
            <UnpaChat
                apiBaseUrl={import.meta.env.VITE_UNPA_API_BASE_URL || '/api/proxy/unpa'}
                userId={user.id}
                graphId="934e9016-6157-4f76-8dbe-c0f8c9dd08a2"
                initialPrompt={initialPrompt}
                theme="light"
                height="100%"
                width="100%"
                onComplete={(result: unknown) => {
                    console.log('Chat completed:', result);
                }}
                onError={(err: unknown) => {
                    console.error('Chat error:', err);
                }}
            />
        </div>
    );
}
```

### 4.2 Router registration

```ts
// src/App.tsx
<Route path="/ai-chat" element={<AiChatPage user={user} />} />
```

### 4.3 `initialPrompt` navigation flow

The home page contains a `ChatInterface` component with a text input. When the user presses send, React Router navigates to `/ai-chat` and passes the typed text as router state:

```ts
// shared/features/src/ChatInterface.tsx
const handleSend = () => {
    if (!input.trim()) return;
    navigate('/ai-chat', { state: { initialPrompt: input } });
};
```

`AiChatPage` reads this state via `useLocation()`. The `<UnpaChat>` component receives `initialPrompt` as a prop and automatically sends it as the first message once the graph initializes — the user never has to type it again on the chat page.

### 4.4 Key prop choices

| Prop | Value | Reason |
|------|-------|--------|
| `apiBaseUrl` | `VITE_UNPA_API_BASE_URL \|\| '/api/proxy/unpa'` | Env-configurable; defaults to the Vite proxy path |
| `graphId` | `"934e9016-6157-4f76-8dbe-c0f8c9dd08a2"` | UUID of the deployed GXE dialog graph |
| `theme` | `"light"` | Matches the FlowDesk portal's light-mode design system |
| `height` / `width` | `"100%"` | The page container dictates the size via flexbox; the widget fills it |
| `initialPrompt` | from `location.state` | Bridges home-page chat input → dedicated chat page |

---

## 5. Proxy Setup

The widget's `apiBaseUrl` points to a proxy path — never directly to the GXE API. The proxy implementation differs between development and production.

### 5.1 Development — Vite dev server proxy

In dev, Vite's built-in proxy handles the rewrite. No additional proxy process is needed.

```ts
// vite.config.ts (FlowDeskPortal)
proxy: {
    // UNPA chat API — rewrite /api/proxy/unpa/* → /api/v1/* on GXE
    '/api/proxy/unpa': {
        target: env.VITE_UNPA_API_PROXY_TARGET,   // http://localhost:3010
        changeOrigin: true,
        rewrite: (path: string) =>
            path.replace(/^\/api\/proxy\/unpa/, '/api/v1'),
    },
    // FlowDesk backend API
    '/api': {
        target: env.VITE_API_PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        ws: true,
    },
},
```

**What this does:**

```
Browser: POST /api/proxy/unpa/flowdesk/chat
               ↓ Vite rewrites path
GXE API: POST http://localhost:3010/api/v1/flowdesk/chat
```

The UNPA-specific rule is listed first (before `/api`) so it matches more specifically and is not swallowed by the general `/api` proxy.

### 5.2 Production — FlowDesk backend YARP proxy

In production the `VITE_UNPA_API_BASE_URL` is set to an absolute HTTPS URL pointing to the FlowDesk backend, which forwards the request to the GXE API internally:

```
Browser: POST https://flowdesk-api.{host}/api/proxy/unpa/flowdesk/chat
                  ↓ FlowDesk backend YARP
GXE API: POST {GXE internal URL}/api/v1/flowdesk/chat
```

This keeps the GXE API address entirely off the client machine.

### 5.3 Environment variables

`.env` (development):

```dotenv
# Widget reads this via import.meta.env.VITE_UNPA_API_BASE_URL
VITE_UNPA_API_BASE_URL=/api/proxy/unpa

# Vite dev proxy forwards to this address
VITE_UNPA_API_PROXY_TARGET=http://localhost:3010
```

`.env.aca` / production:

```dotenv
# Absolute URL — bypasses Vite proxy (which doesn't run in production)
VITE_UNPA_API_BASE_URL=https://flowdesk-api.salmonsmoke-6ce7cdfe.eastus.azurecontainerapps.io/api/proxy/unpa
```

> `VITE_UNPA_API_PROXY_TARGET` is only used by the Vite dev server and is not embedded in the built JS bundle. `VITE_UNPA_API_BASE_URL` is embedded at build time via `import.meta.env`.

---

## 6. Configuration Reference

### @unpa/chat widget

| Prop | Source | Dev value | Prod value |
|------|--------|-----------|------------|
| `apiBaseUrl` | `import.meta.env.VITE_UNPA_API_BASE_URL` | `/api/proxy/unpa` | Absolute HTTPS URL |
| `userId` | `user.id` (auth context) | authenticated user id | authenticated user id |
| `graphId` | hardcoded | `934e9016-6157-4f76-8dbe-c0f8c9dd08a2` | same |
| `theme` | hardcoded | `"light"` | `"light"` |

### Vite dev proxy

| Variable | Purpose | Example |
|----------|---------|---------|
| `VITE_UNPA_API_BASE_URL` | Widget's `apiBaseUrl` | `/api/proxy/unpa` |
| `VITE_UNPA_API_PROXY_TARGET` | Where Vite forwards `/api/proxy/unpa/**` | `http://localhost:3010` |

### Port summary

| Service | Port | Owner |
|---------|------|-------|
| GXE API | 3010 | UNPA team |
| FlowDeskPortal (Vite dev) | 5173 | FlowDesk dev |
| FlowDesk backend (dev) | varies | FlowDesk dev |

---

## 7. Development Workflow (Full Local Stack)

### Step 1: Start the GXE API

```powershell
cd d:\UN\Repos\UNPA\UNPA_Ingest

# Start databases
docker compose up -d redis memgraph qdrant

# Start the API
cd api
npm run dev
# API running at http://localhost:3010
```

Verify:

```powershell
curl http://localhost:3010/api/v1/flowdesk/health
```

### Step 2: Configure the FlowDesk portal

Set the env variables (`.env` in `FlowDeskPortal/`):

```dotenv
VITE_UNPA_API_BASE_URL=/api/proxy/unpa
VITE_UNPA_API_PROXY_TARGET=http://localhost:3010
```

### Step 3: Install and start the portal

```powershell
cd D:\UN\Repos\FlowDesk\FlowDesk\Frontend\Clients\FlowDeskPortal

npm install         # resolves file:../packages/unpa-chat
npm run dev         # Vite dev server + proxy
# App at http://localhost:5173
```

### Step 4: Rebuild @unpa/chat after changes

When you modify `packages/unpa-chat/src/`:

```powershell
cd D:\UN\Repos\FlowDesk\FlowDesk\Frontend\Clients\packages\unpa-chat
npm run build
```

Vite's HMR picks up the rebuilt `dist/` automatically (no portal restart needed if symlinked correctly). If not, restart the Vite dev server.

### Step 5: Open the chat

Navigate to `http://localhost:5173/ai-chat` directly, or type a message on the home page and press Send — the `ChatInterface` component navigates to `/ai-chat` with the message pre-loaded as `initialPrompt`.

---

## 8. Production Build & Deployment

### 8.1 Build @unpa/chat

```powershell
cd packages\unpa-chat
npm run build
# dist/ is updated
```

The rebuilt `dist/` is committed to git. When the FlowDesk portal runs `npm install`, it picks up the files from `../packages/unpa-chat/dist/` directly.

### 8.2 Build FlowDeskPortal

```powershell
cd FlowDeskPortal

# Set production env (or use the .env.aca file)
$env:VITE_UNPA_API_BASE_URL = "https://flowdesk-api.{host}/api/proxy/unpa"

npm run build
# Output: dist/ — static files to serve from CDN or web server
```

`VITE_UNPA_API_BASE_URL` is baked into the JS bundle at build time. In production `import.meta.env.VITE_UNPA_API_BASE_URL` resolves to the absolute HTTPS URL, so the widget calls the FlowDesk backend directly — no Vite proxy involved.

### 8.3 FlowDesk backend proxy (YARP)

The FlowDesk backend must forward `/api/proxy/unpa/**` to the GXE API. In `appsettings.json` (or the YARP configuration):

```json
{
  "ReverseProxy": {
    "Routes": {
      "unpa-chat": {
        "ClusterId": "gxe-api",
        "Match": { "Path": "/api/proxy/unpa/{**remainder}" },
        "Transforms": [
          { "PathPattern": "/api/v1/{**remainder}" }
        ]
      }
    },
    "Clusters": {
      "gxe-api": {
        "Destinations": {
          "primary": { "Address": "https://gxe-api.internal/" }
        }
      }
    }
  }
}
```

This mirrors exactly what the Vite dev proxy does: strip `/api/proxy/unpa`, prefix `/api/v1`, forward to GXE.

---

## 9. FlowDeskProxy Reference Implementation

The `flowdesk-proxy/` directory in the UNPA repository is an **ASP.NET Core 8 reference implementation** of a standalone proxy gateway. It is provided as an example for projects that cannot use the Vite dev proxy or an existing backend.

> **FlowDesk does not use this.** FlowDesk routes the UNPA chat traffic through its own backend (see Section 5.2). The reference proxy is here for teams that need a standalone gateway.

### What it provides

- YARP reverse proxy: `/api/**` → GXE API
- SignalR hub (`/hubs/chat`) for WebSocket-based streaming (optional future feature)
- A built-in React demo SPA (`ClientApp/`) for standalone testing

### Running the reference proxy

```powershell
cd flowdesk-proxy\FlowDeskProxy

# appsettings.Development.json
{
  "GxeApi": { "BaseUrl": "http://localhost:3010" },
  "Cors": { "AllowedOrigins": ["http://localhost:5173"] }
}

dotnet run
# Proxy at http://localhost:9000
# Health: http://localhost:9000/health
```

### Docker image

```powershell
cd flowdesk-proxy
docker build -t flowdesk-proxy:latest .

docker run -d -p 9000:9000 \
  -e GxeApi__BaseUrl=http://gxe-api-host:3010 \
  -e Cors__AllowedOrigins__0=https://your-frontend.com \
  flowdesk-proxy:latest
```

### Adapting for a project

1. Copy `flowdesk-proxy/FlowDeskProxy/` into the target project
2. Set `GxeApi:BaseUrl` to the internal GXE API address
3. Set `Cors:AllowedOrigins` to include the frontend origin
4. Remove `ClientApp/` if the target project has its own frontend
5. Add authentication middleware if required

---

## 10. Troubleshooting

### Widget shows no API response

**Check 1: `VITE_UNPA_API_BASE_URL` is set correctly**

In dev:
```dotenv
VITE_UNPA_API_BASE_URL=/api/proxy/unpa
```
In the browser Network tab, requests should go to `/api/proxy/unpa/flowdesk/chat`.

**Check 2: Vite proxy target is reachable**

```powershell
curl http://localhost:3010/api/v1/flowdesk/health
# Expected: {"status":"ok"}
```

If this fails, the GXE API is not running. See Step 1 in Section 7.

**Check 3: Path rewrite is correct**

The Vite proxy should strip `/api/proxy/unpa` before forwarding. If you see 404s on the GXE side, the path is not being rewritten. Verify the `rewrite` function in `vite.config.ts`.

### `initialPrompt` is not sent

The `navigate(path, { state })` call in `ChatInterface.tsx` must be passing the state object. Add a `console.log` to `AiChatPage`:

```ts
console.log('location.state:', location.state);
```

If `state` is `null`, the navigation call is not passing state (or the user navigated directly to `/ai-chat` without going through the home page — this is expected and correct, `initialPrompt` will simply be `undefined`).

### Widget does not render — blank area

**Cause:** Missing peer dependency.

**Fix:** Check the browser console for unresolved module errors. Install the missing peer:

```powershell
npm install @mui/material @mui/icons-material @emotion/react @emotion/styled lucide-react
```

### TypeScript error: module '@unpa/chat' has no exported member

The package has no bundled type declarations. Add or update `src/declarations.d.ts` (see [Section 3.4](#34-typescript-declarations)).

### @unpa/chat dist/ is stale after source changes

```powershell
cd D:\UN\Repos\FlowDesk\FlowDesk\Frontend\Clients\packages\unpa-chat
npm run build
```

Then restart the Vite dev server if HMR did not pick up the change:

```powershell
cd D:\UN\Repos\FlowDesk\FlowDesk\Frontend\Clients\FlowDeskPortal
npm run dev
```

### Production: widget calls fail with CORS error

The production `VITE_UNPA_API_BASE_URL` points to the FlowDesk backend. Ensure:
1. The FlowDesk backend YARP route for `/api/proxy/unpa/**` is deployed and active.
2. The FlowDesk backend CORS policy allows the SPA origin.
3. The GXE API endpoint configured in the FlowDesk backend's YARP cluster is reachable from the backend container.

---

*For GXE API infrastructure setup, see [DEV_SETUP.md](DEV_SETUP.md).*  
*For the @unpa/chat API reference, see [../packages/unpa-chat/docs/api-reference.md](../packages/unpa-chat/docs/api-reference.md).*
