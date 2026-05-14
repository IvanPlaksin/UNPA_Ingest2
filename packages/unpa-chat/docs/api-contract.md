# API Contract — @unpa/chat

All HTTP endpoints that the package calls. The `apiBaseUrl` prop/config is prepended to every path.

---

## Endpoints Summary

| Method | Path | Purpose | Called by |
|--------|------|---------|-----------|
| `POST` | `/flowdesk/chat` | Send a message and get a response | `sendMessage`, `submitForm`, `handleChoiceClick` |
| `GET` | `/graph-catalog/{graphId}` | Fetch a single graph's metadata | `initialize`, `reset` (when `graphId` is set) |
| `GET` | `/graph-catalog?limit=100` | List available graphs | `fetchGraphCatalog` (utility, not used by UnpaChat directly) |
| `GET` | `/flowdesk/graph-versions` | List graph versions | `fetchGraphVersions` (utility) |
| `GET` | `/flowdesk/user/{userId}/context` | Fetch user context | `fetchUserContext` (utility) |
| `GET` | `/flowdesk/health` | Health probe | `fetchHealth` (utility) |

---

## `POST /flowdesk/chat`

The core endpoint. Every user turn goes through here.

### Request

```http
POST {apiBaseUrl}/flowdesk/chat
Content-Type: application/json
```

```json
{
  "sessionId":    "sess-k4j7n2qx",
  "userId":       "user-123",
  "message":      "I need a new laptop",
  "graphId":      "laptop-provisioning",
  "graphVersion": "1.2.0"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | `string` | ✓ | Session identifier. All messages in one conversation share the same `sessionId`. |
| `userId` | `string` | ✓ | Authenticated user. Used for personalization and access control. |
| `message` | `string` | ✓ | Text sent by the user (or an auto-sent prompt / choice value). |
| `graphId` | `string` | | Restricts execution to a specific dialog graph. |
| `graphVersion` | `string` | | Pins a specific published version of the graph. |

### Response — success

```json
{
  "response":     "What type of laptop do you need?",
  "choices":      [
    { "value": "developer", "label": "Developer workstation" },
    { "value": "standard",  "label": "Standard laptop" }
  ],
  "state": {
    "service_code": "IT",
    "location": { "name": "New York" }
  },
  "executionLog": [
    { "node": "start",        "status": "completed" },
    { "node": "ask_type",     "status": "waiting",
      "inputState": { "prompt": "What type?", "choices": ["developer", "standard"] } }
  ],
  "isComplete":    false,
  "engineStatus":  "WAITING_FOR_INPUT",
  "spawnResult":   null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `response` | `string` | Bot message text. May contain `**bold**` markers. |
| `choices` | `Choice[] \| null` | Quick-select options for the current turn. `null` if no choices. |
| `state` | `object` | Accumulated session state (persisted across all turns in the session). |
| `executionLog` | `ExecutionLogEntry[]` | Node-by-node execution trace. |
| `isComplete` | `boolean` | `true` when the graph has reached its end node. Triggers `onComplete`. |
| `engineStatus` | `string` | Internal engine status string (`WAITING_FOR_INPUT`, `COMPLETED`, etc.). |
| `spawnResult` | `unknown` | Result of a spawned sub-graph, if any. Typically `null`. |

### Response — error

```json
{
  "error": "Graph not found: unknown-graph"
}
```

`sendChatMessage` throws `new Error(data.error)` when this field is present. The hook catches it and appends an error message to the conversation, then calls `onError` if provided.

---

## `GET /graph-catalog/{graphId}`

Fetches metadata for a single graph. Called during `initialize()` and `reset()` to display the graph name as the welcome message.

### Request

```http
GET {apiBaseUrl}/graph-catalog/laptop-provisioning
```

### Response

```json
{
  "data": {
    "id":          "laptop-provisioning",
    "name":        "Laptop Provisioning",
    "description": "Self-service laptop request workflow",
    "nodeCount":   12,
    "status":      "PUBLISHED"
  }
}
```

The package uses `data.name` as the welcome message when `welcomeText` prop is not set. The full `data` object is returned by `initialize()`.

---

## `GET /graph-catalog?limit=100`

Lists all published graphs. Not called by the `<UnpaChat>` component directly; available via `fetchGraphCatalog` for host app dropdowns or graph selectors.

### Response

```json
{
  "data": [
    { "id": "laptop-provisioning", "name": "Laptop Provisioning", "nodeCount": 12 },
    { "id": "onboarding",          "name": "Employee Onboarding",  "nodeCount": 8  }
  ],
  "total": 2
}
```

The utility function filters out graphs with no nodes (`nodeCount > 0` or `nodes.length > 0`).

---

## `GET /flowdesk/graph-versions`

Returns available graph versions. Not used by the chat component itself; useful for a version picker in the host app.

### Response

```json
{
  "versions": [
    { "graphId": "laptop-provisioning", "version": "1.2.0", "publishedAt": "2025-10-01T00:00:00Z" },
    { "graphId": "laptop-provisioning", "version": "1.1.0", "publishedAt": "2025-09-01T00:00:00Z" }
  ]
}
```

---

## `GET /flowdesk/user/{userId}/context`

Fetches user-specific context (duty station, service code, etc.) for pre-populating form fields.

### Request

```http
GET {apiBaseUrl}/flowdesk/user/user-123/context
```

### Response

```json
{
  "userId":       "user-123",
  "service_code": "IT",
  "dutyStation":  "New York",
  "location":     { "name": "New York", "id": "nyc" }
}
```

Throws on non-2xx HTTP status. The hook merges this data into `dialogState` automatically.

---

## `GET /flowdesk/health`

Lightweight health probe. Returns HTTP 200 with a JSON object when the backend is up.

### Response

```json
{ "status": "ok", "timestamp": "2025-10-01T12:00:00Z" }
```

Does not throw on errors — returns the raw parsed JSON or throws a network error.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `POST /flowdesk/chat` returns `{ "error": "..." }` | `sendChatMessage` throws. Hook appends error message, calls `onError`. |
| Any endpoint returns non-2xx | `fetchUserContext` throws. Other utilities return whatever `res.json()` returns. |
| Network failure / CORS | `fetch` rejects. Hook catches, appends error message, calls `onError`. |

The component always displays an error message in the conversation when a request fails. `onError` is for host-level handling (logging, toast notifications) on top of that.

---

## Proxy Routing

When deployed behind FlowDeskProxy (or any reverse proxy), the proxy routes:

```
{proxyOrigin}/api/**  →  {gxeApiBaseUrl}/api/**
```

Set `apiBaseUrl="/api/v1"` on the component and configure the proxy to forward `/api/v1/**` to `{GxeApi__BaseUrl}/api/v1/**`. See [FLOWDESK_CHAT_INTEGRATION.md](../../docs/FLOWDESK_CHAT_INTEGRATION.md) for the full proxy setup.
