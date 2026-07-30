# Altiora ⇄ UNPA_Ingest — Integration Surface & Merge Reference

> **Purpose:** Complete map of every coupling point between our platform (UNPA_Ingest, Node.js
> `api/`) and the external **Altiora** .NET ITSM system (`D:\UN\Repos\FlowDesk\FlowDesk`).
> This is the reference for **pulling/merging upstream Altiora changes** and verifying nothing
> in the contract broke. Reconnaissance date: **2026-07-24**.
>
> **Scope note (namespace):** "Altiora" = the client's .NET product (repo `FlowDesk`).
> "FlowDesk" in *our* code = our client-project instance layer. Do not confuse the two.

---

## 0. TL;DR — the merge picture

> **⚠️ CRITICAL (confirmed 2026-07-24):** The **live** integration in the Altiora repo is **NOT a
> branch** — it is a set of **uncommitted working-tree modifications + untracked files sitting
> directly on `master`**. The `RealAI` branch is an **obsolete** earlier attempt (it vendored the
> now-dead `@unpa/chat` package; current prod uses `@flowdesk/chat-v2`). Do not merge *into*
> `RealAI`. See §0.1 for the corrected strategy.

The Altiora repo (`FlowDesk`, origin = UN DevOps TFS
`https://devops-unops.dfs.un.org/tfs/UNHQCollection/_git/FlowDesk`):

| Branch | Role | State |
|---|---|---|
| `master` | Upstream + **our uncommitted live integration on top** | local HEAD `1ab19dba` == `origin/master` (0/0 divergence at last fetch) |
| `RealAI` | **Obsolete** first integration attempt (`@unpa/chat`) | merge-base + 1 commit `dc3510ba`; behind master by 475 — **ignore for the live merge** |

### 0.1 The REAL integration footprint = uncommitted state on `master`

`git status` on Altiora `master` shows our entire live integration as dirty working tree:

**Modified (tracked) — our edits on upstream files:**
- `Backend/FlowDesk.API/Program.cs` — DI, JWT query-token hook, SignalR mapping, `UnpaChat` HttpClient
- `Backend/FlowDesk.API/appsettings.json` — `UnpaChat:BaseUrl`
- `Backend/FlowDesk.API/Controllers/ServiceDistributionController.cs` — **adds `GET /{ousId}/schema/version`** (our endpoint #5!) + `ComputeSchemaHash`
- `Backend/FlowDesk.API/Repositories/TicketRepository.cs` — integration-support (+15)
- `Backend/FlowDesk.API/Services/EmailService.cs` — dev mock-SMTP (no local mail server; avoid inline block)
- `Frontend/Clients/shared/features/src/ChatInterface.tsx` — embeds `AltioraChat` from `@flowdesk/chat-v2`
- `Frontend/Clients/shared/features/src/index.ts`, `shared/features/package.json`
- `Frontend/Clients/FlowDeskPortal/src/App.tsx`, `pages/Home.tsx`, `vite.config.ts`, `.env`
- `Frontend/Clients/package-lock.json`, `FlowDeskAdmin/*` (build artifacts)

**Untracked (new) — our new files:**
- `Backend/FlowDesk.API/Controllers/UnpaProxyController.cs` — **the inbound bridge**
- `Frontend/Clients/shared/features/src/PortalVoiceLauncher.tsx`
- `Frontend/Components/` — built `@flowdesk/chat-v2` + `@flowdesk/voice-launcher` ESM libs

> **Consequence:** the backend contract our Node side depends on (esp. `/schema/version`,
> `UnpaProxyController`) exists **only in the working tree** — it is not committed anywhere and not
> on any branch. A careless `git pull`/`git checkout` on Altiora could silently wipe it.

### 0.2 Corrected merge strategy

1. **FIRST, capture the live integration** so it is tracked and diffable. In Altiora repo:
   `git checkout -b integration/unpa-chat-v2` then `git add -A && git commit` the current working
   tree. Now our footprint is a real, reviewable commit (not dirty state).
2. `git fetch origin` — get the *new* upstream commits (0 pending at last fetch; re-check).
3. `git merge origin/master` (or rebase our integration commit onto it). Resolve conflicts.
4. Re-verify the §9 breaking-change watch list against merged upstream.
5. Rebuild .NET (:5000), run our Node E2E (`FLOWDESK_E2E_ALTIORA=1`) before promoting.
6. Treat `RealAI` as archived/obsolete — nothing to carry forward from it.

### 0.3 Where conflicts will land

Because the integration is currently uncommitted, "conflicts" surface as: upstream changes to the
**same files we modified**. The tracked modified files above (esp. `Program.cs`,
`ServiceDistributionController.cs`, `appsettings.json`, `NotificationHub.cs` if touched) are the ones
to watch when the new upstream lands. The obsolete `RealAI` 14-file overlap analysis is retained
below for reference only.

<details><summary>Historical: RealAI-vs-master conflict surface (obsolete branch)</summary>

14 files overlapped between `dc3510ba` and upstream; most upstream edits additive. Highest risk was
`Program.cs` (15 upstream commits, +92) and `NotificationHub.cs` (+96). This analysis applied to the
abandoned `@unpa/chat` integration and is kept only for historical context.

</details>

---

## 1. Runtime topology

```
Browser (FlowDesk Portal, Vite :3001, HTTPS)
   │  calls relative /api/proxy/unpa/...   (AltioraChat / VoiceLauncher components)
   ▼
Altiora .NET API (:5000)  ── UnpaProxyController [Route("api/proxy/unpa")]
   │  reverse-proxy → named HttpClient "UnpaChat" (infinite timeout, no proxy)
   │  injects X-FlowDesk-User-* identity headers + X-FlowDesk-User-Token (caller's bearer)
   ▼
OUR Node API (:3010)  ── /api/v1/flowdesk/...   (Chat V2 interpreter, voice relay)
   │  chat calls BACK into Altiora AS THE USER (acting-token) for catalog/schema/tickets/directory
   ▼
Altiora .NET API (:5000)  ── /api/ServiceDistribution, /api/tickets, /api/servicecatalog, ...
```

- **Integration is bi-directional but asymmetric:**
  - **Inbound** (Altiora → us): a *single* proxy controller (`UnpaProxyController`) + one SignalR
    push event we consume (`ServiceFormChanged`).
  - **Outbound** (us → Altiora): **29 REST endpoints** + 1 SignalR subscription (see §3).
- **Ports:** our Node = **3010** (`/api/v1`), Altiora .NET = **5000**, Portal Vite = **3001**
  (Agent 3002). Docker: our node container listens on 3000, host-mapped `3010:3000`.

---

## 2. Inbound: Altiora → us  (`UnpaProxyController`)

File: `Backend/FlowDesk.API/Controllers/UnpaProxyController.cs`
Attributes: `[ApiController] [Authorize] [Route("api/proxy/unpa")]`

| Method(s) | Route | Behavior |
|---|---|---|
| `GET` | `api/proxy/unpa/flowdesk/voice/proxy` | `[AllowAnonymous]` **WebSocket** relay for Voice Live. Literal route wins over catch-all. |
| `GET,POST,PUT,PATCH,DELETE` | `api/proxy/unpa/{**path}` | Catch-all HTTP reverse proxy (`ProxyAsync`), requires auth. |

- **Target base:** `_configuration["UnpaChat:BaseUrl"]`, fallback const
  `DefaultBaseUrl = "http://localhost:3010/api/v1/flowdesk"`.
  ⚠️ **Config mismatch to watch:** `appsettings.json` sets `UnpaChat:BaseUrl =
  "http://localhost:3010/api/v1"` (**no** `/flowdesk`), so in practice the `/flowdesk` prefix
  comes from the forwarded `{path}` (`flowdesk/...`). If upstream changes this key shape, our
  routing breaks silently.
- **HTTP proxy:** `targetUrl = baseUrl.TrimEnd('/') + "/" + path + query`; sent with
  `HttpCompletionOption.ResponseHeadersRead`; SSE relayed with per-chunk `FlushAsync`, response
  buffering disabled. Uses named `HttpClient "UnpaChat"` (`Program.cs`, `Timeout.InfiniteTimeSpan`,
  `UseProxy=false`).
- **WebSocket (voice):** `http→ws`, `https→wss`; target `{wsBase}/flowdesk/voice/proxy{query}`.
  Echoes requested subprotocol `"realtime"`; bidirectional 16 KB frame pump. Anonymous at the
  gateway; the **voice ticket** (single-use, 60 s) is minted by our node `POST
  /flowdesk/voice/token` and validated by our node relay at upgrade.

### Injected identity headers (authoritative — overwrite any client value) — `InjectUserHeaders`
Consumed by our `middleware/flowdesk-user.middleware.js` → feeds `getCurrentUser` + acting-token
context.

| Header | Source |
|---|---|
| `X-FlowDesk-User-Id` | UserId (GUID) |
| `X-FlowDesk-User-Email` | Email |
| `X-FlowDesk-User-Display-Name` | DisplayName or `FirstName LastName` |
| `X-FlowDesk-User-Is-Vip` | `true`/`false` |
| `X-FlowDesk-User-Org-Code` | last segment of `PrimaryOrgUnitCodePath` |
| `X-FlowDesk-User-Org-Name` | `PrimaryOrgUnitName` |
| `X-FlowDesk-User-Org-Path` | `PrimaryOrgUnitCodePath` |
| `X-FlowDesk-User-Duty-Station` | `DutyStationName` |
| `X-FlowDesk-User-Token` | **the caller's own bearer** — lets our chat call Altiora AS the user |

- **Blocked headers** (never forwarded): `Connection, Keep-Alive, Proxy-Authenticate,
  Proxy-Authorization, TE, Trailer, Transfer-Encoding, Upgrade, Host, API-Key` + all inbound
  `Content-*`.
- **Gateway-only query params** (stripped before forward): `api_key`, `API-Key`, `access_token`.
- **Errors:** unresolvable user → `401 {"error":"Unable to resolve current user"}`; upstream down
  → `502 {"error":"Chat service unavailable"}`; client abort mid-SSE swallowed.
- **Trust boundary:** our node chat API must be reachable ONLY through this proxy.

---

## 3. Outbound: us → Altiora  (the 29-endpoint contract)

All calls target `ALTIORA_API_BASE` (default `http://localhost:5000`), path appended.
Source dir: `api/src/instances/flowdesk/services/`.

### Auth model (dual gate)
Every `/api` request needs **both**:
1. **`API-Key`** header (validated against Altiora `ApiClient`/`API_Clients`, cached 2 h). Set when
   `ALTIORA_API_KEY` present. Fallback for WS/EventSource: `?api_key=` / `?API-Key=`.
2. **Bearer** whose claims resolve to a real user (app-only tokens rejected). Chosen per-call by a
   pluggable `tokenProvider`:
   - **Acting-user token** (end-user bearer forwarded as `X-FlowDesk-User-Token`, read via
     `acting-user.context.getActingToken()`) for in-turn calls — preserves Altiora permission scope.
   - **Service-account token** for background jobs — `POST /api/auth/login {email,password}` with
     `ALTIORA_SERVICE_EMAIL`/`ALTIORA_SERVICE_PASSWORD`, cached until ~60 s before JWT `exp`.
   - `createActingTokenProvider` = acting if a request is in flight, else service. Process singleton
     `getAltioraClient()` uses this.
- **Query-token ("ticket") auth** on the Altiora side: `/api/notificationHub` and `/api/proxy/unpa`
  lift the bearer from `?access_token=` (`JwtBearerEvents.OnMessageReceived`).

### Endpoint contract table

| # | Endpoint | Method | Our caller (`services/…`) | Purpose |
|--:|---|---|---|---|
| 1 | `/api/auth/login` | POST | `altiora-client.js`; `directory/providers/altiora.provider.js` | Service login → JWT bearer |
| 2 | `/api/notificationHub` | WS (SignalR) | `altiora-schema-sync.js` | Realtime `ServiceFormChanged` → mark schema stale |
| 3 | `/api/ServiceDistribution/detect` | POST | `altiora-schema-client.js` | Resolve serviceId+location → provider list (**ousIds**) |
| 4 | `/api/ServiceDistribution/{ousId}/schema` | GET | `altiora-schema-client.js` | Fetch published FormDefinition (SchemaJson) |
| 5 | `/api/ServiceDistribution/{ousId}/schema/version` | GET | `altiora-schema-client.js` (via sync poll) | Cache-invalidation probe (`contentHash` SHA256) |
| 6 | `/api/FormLookup/values` | POST | `altiora-schema-client.js` ← `altiora-lov.service.js` | Resolve LOV dictionary options |
| 7 | `/api/tickets` | POST | `altiora-ticket.service.js` | **Create Service Request** from DraftSR |
| 8 | `/api/tickets` | GET | `backends/ticket-list.backend.js` | List current user's requests |
| 9 | `/api/tickets/metadata?mineOnly=true` | GET | `backends/ticket-list.backend.js` | Ticket filter metadata |
| 10 | `/api/tickets/number/{n}` | GET | `backends/ticket-list.backend.js` | Ticket detail by human number |
| 11 | `/api/tickets/{ticketId}` | GET | `chat-admin.service.js` | Admin live ticket passthrough |
| 12 | `/api/tickets/resolve-approver?orgUnitId=` | GET | `directory/providers/altiora.provider.js` | Resolve org-unit approver |
| 13 | `/api/servicecatalog/requestable` | GET | `altiora-catalog-sync.js` | Fetch requestable catalog → Qdrant sync |
| 14 | `/api/servicecatalog/root` | GET | `backends/catalog-browse.backend.js` | Catalog root categories |
| 15 | `/api/servicecatalog/{parentId}/children` | GET | `backends/catalog-browse.backend.js` | Catalog drill-down |
| 16 | `/api/authorizations/pending` | GET | `altiora-approval.service.js` | Acting user's pending approvals |
| 17 | `/api/authorizations/{id}/decision` | POST | `altiora-approval.service.js` | Approve/Deny decision |
| 18 | `/api/users/search/global?searchTerm=&limit=` | GET | `directory/providers/altiora.provider.js` | User search |
| 19 | `/api/users/{id}` | GET | `directory/providers/altiora.provider.js` | Get user |
| 20 | `/api/dutystations` | GET | `directory/providers/altiora.provider.js` | List duty stations |
| 21 | `/api/dutystations/search?q=` | GET | `directory/providers/altiora.provider.js` | Search duty stations |
| 22 | `/api/Task/requestor/tasks/paged?...` | GET | `backends/tasks.backend.js` | List user's tasks |
| 23 | `/api/Task/{taskId}` | GET | `backends/tasks.backend.js` | Task detail |
| 24 | `/api/Task/requestor/tasks/metadata` | GET | `backends/tasks.backend.js` | Task filter metadata |
| 25 | `/api/messages?...&folder=` | GET | `backends/mail.backend.js` | List messages |
| 26 | `/api/messages/{messageId}` | GET | `backends/mail.backend.js` | Message detail |
| 27 | `/api/messages/unread-counts` | GET | `backends/mail.backend.js` | Unread counts (best-effort) |
| 28 | `/api/messages/stats` | GET | `backends/mail.backend.js` | Per-folder stats (best-effort) |
| 29 | `/api/health` | GET | `chat-admin.service.js` | Altiora health probe |

### Critical request/response shapes (verify these on merge)

- **`POST /api/ServiceDistribution/detect`** — req `{ ServiceId, LocationPath, BeneficiaryOrgUnitPath,
  IsSla }` → array of ProviderDetectionResponse. We consume (any casing):
  `OrganizationUnitServiceId` (**the ousId — the whole two-level key pivot**), `ProviderOrgUnitId`,
  `ProviderName`, `ServiceName`, `MatchedLocationScope/OrgScope`, `MatchScore`, `FocalPointUser*`,
  `UseIneed`, `IneedCode`, `ManagerOnly`, `ManagerOnlyDescription`, `RequestTitleMode`,
  `RequestDescriptionMode`, `Info`. 404 → `[]`.
- **`GET /api/ServiceDistribution/{ousId}/schema/version`** → `{ organizationUnitServiceId,
  schemaId, version, updatedAt, contentHash }`. `contentHash` is the cache key.
- **`POST /api/tickets`** — `CreateTicketDto { Title(≤200), Description(≤2000), ServiceCode,
  OrganizationUnitServiceId, FormDataJson (JSON keyed by ORIGINAL Altiora field ids via
  snapshot.metadata.fieldIdMapping), Status:'New', [BeneficiaryId, RequesterId, DutyStationId,
  ManualApproverUserId] }` → `{ ticketNumber, ticketId, status }`. Never retried (dup protection).
- **`POST /api/FormLookup/values`** — `FormLookupRequest { EntityId, DisplayFieldIds[], ValueFieldId?,
  Filters?, FilterLogic?, Search?, MaxResults? }` (Altiora clamps MaxResults to [1,1000]) → `[{label,
  value}]`.
- **`POST /api/authorizations/{id}/decision`** — `{ Status:'Approved'|'Denied', Justification }`
  (Justification mandatory on Denied). 403 → `NOT_APPROVER`, 400 → `ALREADY_PROCESSED`.

### Two-level key (the core data-flow invariant)
`catalog GUID (serviceId)` → **`/ServiceDistribution/detect`** → `OrganizationUnitServiceId (ousId, int)`
→ **`/{ousId}/schema`** (form) → materialize → user fills → **`POST /api/tickets`** with both
`ServiceCode` and `OrganizationUnitServiceId`. If upstream renames `OrganizationUnitServiceId` or
changes the detect contract, the whole intake breaks.

---

## 4. SignalR (`Hubs/NotificationHub.cs`)

- Route: `MapHub<NotificationHub>("/api/notificationHub")`, `[Authorize]`, **exempt** from
  `ApiKeyMiddleware`, accepts bearer via `?access_token=`.
- We connect via `altiora-schema-sync.js` (`@microsoft/signalr`, WebSocket, `skipNegotiation`,
  service-account bearer through `accessTokenFactory`).
- **Event we consume:** **`ServiceFormChanged`** — `{ serviceId (==ousId), catalogItemId, updatedBy,
  changedParts[] }`; `changedParts ∈ {structure, required, rules, schema}` → `registry.markStale(ousId)`.
  Poll fallback pairs with endpoint #5.
- **Related events emitted (we may want to consume later):** `ServiceAvailabilityChanged`,
  `ServiceManagerOnlyChanged`, `ServiceTipsChanged`.
- Client-invokable hub methods exist (`JoinOrgUnitGroup`, `JoinChatConversation`, …) but our
  schema-sync only *listens*.

---

## 5. Altiora `Integration/` subsystem (separate from us — do not confuse)

`Backend/FlowDesk.API/Integration/` is Altiora's **own** generic data-integration/ETL engine
(Connections, Credentials, Endpoints, Entities, Pipelines, Runs, Schedules, Datasets), 11
controllers under `api/integration/...`, wired via `UseFlowDeskIntegrationAsync()`. **We do not call
it.** Named to help future decisions — it is unrelated to the UNPA chat bridge, but a large,
active surface that will churn on upstream merges. It emits its own SignalR event
`PipelineRunStatusChanged`.

---

## 6. Configuration

### Our side (`api/.env` / CI `FLOWDESK_ENV` secret — **not** in `.env.example`)

| Var | Purpose | Default / example |
|---|---|---|
| `ALTIORA_API_BASE` | Altiora API origin | `http://localhost:5000` (no default in `altiora-client.js` — throws if unset) |
| `ALTIORA_API_KEY` | `API-Key` header | `<key from API_Clients>` |
| `ALTIORA_SERVICE_EMAIL` | Service login | `chatservice@flowdesk.local` |
| `ALTIORA_SERVICE_PASSWORD` | Service login | `<secret>` |
| `ALTIORA_API_TOKEN` | Optional pre-minted bearer (provider only) | unset |
| `DIALOGUE_GYM_ALTIORA_TOKEN` | Bearer for Dialogue Gym runner | `<jwt>` |
| `FLOWDESK_E2E_ALTIORA` | Gate for live Altiora E2E tests | `1` |

Provider/feature flags steering Altiora behavior:

| Var | Purpose | Default |
|---|---|---|
| `FLOWDESK_CHAT_V2` | Enable Chat V2 interpreter branch | `false` (prod `true`) |
| `FLOWDESK_SCHEMA_PROVIDER` | Form-schema source: `graph` (seeded) or `altiora` (on-demand materialize + SignalR/poll) | `graph` |
| `FLOWDESK_DIRECTORY_PROVIDER` | Directory backend: `mock` or `altiora` | `mock` (prod `altiora`) |
| `FLOWDESK_SUBMIT_TARGET` | `altiora` ⇒ real `POST /api/tickets`; else local Memgraph | unset |
| `FLOWDESK_CATALOG_PROVIDER` | `altiora` or `graph` (KB, no live Altiora) | `altiora` |
| `FLOWDESK_HYBRID_SERVICE_SEARCH` | Hybrid vector+keyword service search (`0` disables) | on |
| `FLOWDESK_ACT_USERS` | ACT allowlist (side-effecting actions), fails closed | empty |
| `FLOWDESK_SCHEMA_SYNC_SIGNALR_ENABLED` | SignalR push | `true` |
| `FLOWDESK_SCHEMA_SYNC_POLL_INTERVAL` | Poll fallback seconds | `300` (min 30) |
| `FLOWDESK_SERVICE_COLLECTION` | Qdrant collection | `flowdesk_services` |
| `FLOWDESK_KB_NAMESPACE` / `FLOWDESK_CODEX_SCOPE` | Isolation | `Altiora` / `altiora` |
| `FLOWDESK_OTHER_SPECIFY_HEURISTIC` | Materializer heuristic (`0` disables) | on |
| `FLOWDESK_ALLOW_SCHEMA_WIPE` | Escape hatch for full registry wipe | `0` |
| `FLOWDESK_MSSQL_*` | Direct MSSQL import from Altiora's FlowDesk DB | `localhost:1435 / FlowDesc / sa` |

### Altiora side pointing at us
`Backend/FlowDesk.API/appsettings.json`:
```json
"UnpaChat": { "BaseUrl": "http://localhost:3010/api/v1" }
```
Consumers: `UnpaProxyController.cs`, `Program.cs` (named `HttpClient "UnpaChat"`, infinite timeout).
Grep `"Unpa"` in the Altiora Backend hits **exactly 3 files**: `UnpaProxyController.cs`,
`appsettings.json`, `Program.cs`.

### `api/src/config/domain-map.config.js` (ours)
Not network config — a taxonomy grouping ~198 graph labels into 13 UI data-domains. The `flowdesk`
domain ("FlowDesk / ITSM") ties Altiora-imported labels (`ServiceCatalogItem, ServiceRequest,
ServiceDef, SlotDef, EnumOption, Workflow, …`) to the `flowdesk_services` Qdrant collection;
`namespaceHints: ['FLOWDESK','Altiora']`.

---

## 7. Altiora Frontend → our chat (embedded UI)

Base path everywhere: **`/api/proxy/unpa`** (relative → Portal origin → `UnpaProxyController`).

| File | Wiring |
|---|---|
| `Frontend/Clients/shared/features/src/ChatInterface.tsx` | imports `{ AltioraChat }` from `@flowdesk/chat-v2`; `CHAT_API_BASE = "/api/proxy/unpa"` |
| `Frontend/Clients/FlowDeskPortal/src/pages/Home.tsx` | embeds `ChatInterface` |
| `Frontend/Clients/shared/features/src/PortalVoiceLauncher.tsx` | `VOICE_API_BASE = "/api/proxy/unpa"`, `VoiceLauncher` from `@flowdesk/voice-launcher` |
| `Frontend/Clients/FlowDeskPortal/src/App.tsx` | mounts `<PortalVoiceLauncher>` |

Component-issued paths (through the proxy, onto our node): `POST /flowdesk/voice/token`, WS
`…/flowdesk/voice/proxy?ticket=&sessionId=`, `GET /flowdesk/voice/transcript/{sessionId}`, chat
SSE under `apiBaseUrl`. The exported React component is `AltioraChat` (npm name still
`@flowdesk/chat-v2`); listens for window events `openAltioraChat` / `closeAltioraChat`.

> ✅ **Confirmed (2026-07-24):** The **live** integration uses **`@flowdesk/chat-v2` +
> `@flowdesk/voice-launcher`** (via `ChatInterface.tsx` / `PortalVoiceLauncher.tsx`, built libs
> under untracked `Frontend/Components/`). The `@unpa/chat` package vendored in the obsolete
> `RealAI` commit `dc3510ba` (`Frontend/Clients/packages/unpa-chat/` + `AiChatPage.tsx`) is
> **obsolete — do not carry it forward** in the merge.

---

## 8. Auth & middleware (Altiora pipeline)

Order (`Program.cs`): Kestrel (200 MB body) → **`ApiKeyMiddleware`** → `UseAuthentication`
(JWT/Azure AD) → `UseAuthorization` → `MapControllers` + `MapHub`.

- **API-Key gate** (`Middleware/ApiKeyMiddleware.cs`): header `API-Key` (or `?api_key=` / `?API-Key=`);
  validates active, non-expired `ApiClient`; failure `401` + `X-401-Source`. **Bypass paths:**
  `/api/notificationHub`, `/api/help/media`, (DEBUG) `/swagger`. **The UNPA proxy is NOT bypassed** —
  it requires `API-Key`, then strips it before forwarding.
- **User auth:** production = Azure AD bearer (`AddMicrosoftIdentityWebApi(AzureAd)`); DEBUG adds a
  `LocalJwt` HS256 scheme (`Jwt:Key/Issuer=FlowDesk.Api/Audience=FlowDeskClient`) + `MixedAuth`
  policy; `AuthController` login/refresh/generate-hash are **DEBUG-only**.
- **Query-token auth** for `/api/notificationHub` + `/api/proxy/unpa` (`AllowsQueryToken`): bearer
  lifted from `?access_token=`.
- **Voice ticket** is a *separate* single-use 60 s concept minted/validated by our node, not by C#.
- **Permissions:** `RequirePermissionAttribute` + `PermissionCodes` (e.g. `ServiceCatalog*`,
  `ServiceDistribution*`). Many `[RequirePermission(...)]` on `ServiceDistribution` are currently
  **commented out** (only `[Authorize]`) — watch for upstream re-enabling them (could 403 our calls).

---

## 9. Breaking-change watch list (verify after every upstream merge)

Ranked by blast radius:

1. **`UnpaProxyController`** — route strings (`api/proxy/unpa`, `flowdesk/voice/proxy`),
   `X-FlowDesk-User-*` header names/semantics, `X-FlowDesk-User-Token`, blocked/gateway lists.
   *(Owned by us; upstream shouldn't touch, but Program.cs registration can drift.)*
2. **`UnpaChat:BaseUrl` shape** (`/api/v1` vs `/api/v1/flowdesk`) — the path-prefix assumption.
3. **`POST /api/ServiceDistribution/detect`** contract + **`OrganizationUnitServiceId`** field name
   (the two-level-key pivot) + `GET .../schema/version` (`contentHash`).
4. **`POST /api/tickets`** `CreateTicketDto` field names, esp. `OrganizationUnitServiceId`,
   `ServiceCode`, `FormDataJson` keying.
5. **SignalR** `/api/notificationHub` route + `ServiceFormChanged` payload
   (`serviceId==ousId`, `changedParts`).
6. **`API-Key` header name** + `?access_token=` query-token path list (`AllowsQueryToken`).
7. **`ApiKeyMiddleware` bypass list** — our proxy must stay NON-bypassed; `notificationHub` must stay
   bypassed.
8. **Catalog/directory/task/mail** endpoint shapes (`/api/servicecatalog/*`, `/api/users/*`,
   `/api/dutystations*`, `/api/Task/*`, `/api/messages/*`) — lower risk (read-only, tolerant casing).
9. **`Program.cs`** — DI registration of `UnpaChat` HttpClient (infinite timeout, no proxy), JWT
   `OnMessageReceived` query-token hook, SignalR mapping.
10. **Frontend** — `@flowdesk/chat-v2` / `@flowdesk/voice-launcher` (or legacy `@unpa/chat`) embed in
    `ChatInterface.tsx` / `App.tsx`; `vite.config.ts` dev-proxy `/api` → :5000.

### Suggested merge procedure
1. `cd D:/UN/Repos/FlowDesk/FlowDesk && git fetch origin`
2. On a scratch branch: `git checkout RealAI && git merge origin/master` (or rebase our 1 commit).
3. Resolve the 14 conflict files in §0 — prioritize `Program.cs`, `NotificationHub.cs`,
   `appsettings.json`, `ApiKeyMiddleware.cs`.
4. Re-verify the §9 watch list against the merged upstream code (grep for the endpoint strings,
   DTO field names, header names).
5. Rebuild .NET (:5000) + run our node E2E (`FLOWDESK_E2E_ALTIORA=1`) against it before promoting.

---

*Generated by reconnaissance on 2026-07-24. Cross-reference project memory notes:
`project_altiora_integration.md`, `project_ip1_schema_materialization.md`,
`project_altiora_voice_ws_proxy_fix.md`, `project_flowdesk_act_governance.md`.*
