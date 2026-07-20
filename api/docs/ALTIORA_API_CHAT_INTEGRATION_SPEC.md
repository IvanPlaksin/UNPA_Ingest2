# Altiora API — Integration Spec for FlowDesk Chat V2

> **Audience:** Claude Code sessions continuing the FlowDesk Chat V2 ↔ Altiora integration.
> **Scope:** ONLY the Altiora API surface relevant to the AI chat intake service. This is not a full Altiora API reference.
> **Status:** Verified against Altiora `origin/master` (commit `b5ecb0ae`, .NET 9) as of 2026-07-15. Endpoints marked **[ADDED]** were created by this integration; everything else pre-exists in Altiora.
> **Altiora repo:** `D:\UN\Repos\FlowDesk\FlowDesk` (backend `Backend\FlowDesk.API`). **Chat repo:** `d:\UN\Repos\UNPA\UNPA_Ingest` (chat under `api/src/instances/flowdesk/`).

---

## 1. Architecture — proxy model (authoritative)

```
User (browser, authenticated in Altiora Portal)
  → FlowDeskChatV2 React component  (embedded INSIDE the Altiora Portal SPA)
  → Altiora API proxy endpoints (+ WebSockets/SSE)   [/api/proxy/unpa/*]
  → UNPA chat API  (Node, http://localhost:3010/api/v1/flowdesk/*)
```

Key consequences:
- **The chat does NOT authenticate to Altiora itself.** The user is already authenticated in the Portal. Altiora's proxy resolves the current user on every request and forwards identity downstream as headers.
- **No dedicated chat entry in `API_Clients`** is required — the chat rides on the Portal's `Api-Key` + the user's bearer token.
- Altiora is the **source of truth** for: service catalog, form schemas, directory/reference data, and Service Request (ticket) storage.
- The chat's Memgraph schema-graph is a **materialized read-through cache** of Altiora form schemas (see §6).

---

## 2. Dev environment (how to run + reach it)

| Component | URL | Notes |
|---|---|---|
| Altiora API | `http://localhost:5000` | `dotnet run --no-build -c Debug --urls http://localhost:5000` from `Backend/FlowDesk.API`, env `ASPNETCORE_ENVIRONMENT=Development` |
| Altiora Portal (chat host) | `https://localhost:3001` | self-signed cert; vite dev-proxy forwards `/api`(+ws) → `:5000` |
| Swagger (no key) | `http://localhost:5000/swagger/index.html` | bypasses the API-Key gate in DEBUG |
| UNPA chat API | `http://localhost:3010/api/v1/flowdesk/*` | our side (Node); proxy target |

- **DB (dev):** `appsettings.Development.json` → `Server=localhost,1433;Database=FlowDesk;User ID=_webuser;Password=12345678;TrustServerCertificate=True;` (SQL Server, default instance MSSQLSERVER on 1433).
- **Portal HTTPS cert:** `Frontend/Clients/FlowDeskPortal/localhost.{key,crt}` must be a valid self-signed pair (the committed key was an empty placeholder — regenerate with `openssl req -x509 -newkey rsa:2048 -nodes -keyout localhost.key -out localhost.crt -days 825 -subj /CN=localhost`).
- Frontends are an **npm workspace** at `Frontend/Clients` — run `npm install` there (not per-app).

---

## 3. Authentication & authorization (two gates)

Every `/api` request passes two gates, in order (`Program.cs` middleware pipeline):

### Gate 1 — API-Key (`Middleware/ApiKeyMiddleware.cs`)
- Header **`API-Key: <key>`**, or query fallback **`?api_key=`** / **`?API-Key=`** (for SSE/WebSocket where custom headers can't be set).
- Validated against the `API_Clients` table (cached 2h).
- **Bypass list:** `/api/notificationHub`, `/api/help/media`, `/swagger` (DEBUG only). `/api/proxy/unpa/*` is **NOT** bypassed — it requires the key.
- Dev key (Portal's, sent automatically as `VITE_API_KEY`): `rV2GOgPdHjYwIKq47dyus19yraCAr6eIJQ2DWrnQiOBPJoozSepYEnw5T6gsKDw3`.

### Gate 2 — Bearer identity (`[Authorize]`, `Program.cs`)
- **Prod:** Azure AD (`AddMicrosoftIdentityWebApi`, MSAL). **Dev:** LocalJwt HS256 (`LocalAuth:Enabled=true`).
- `ICurrentUserService.GetOrCreateCurrentUserAsync()` derives the acting user from the token: Azure `oid`, or local-JWT `sub`/NameIdentifier → `AppUser`. **App-only tokens (no user identity) return 401.**
- **`?access_token=` query fallback** (for clients that cannot set headers — SignalR, SSE/EventSource) is accepted **only on an allow-list of paths**, in both auth schemes: `/api/notificationHub` and **[ADDED]** `/api/proxy/unpa`. Everywhere else the query token is ignored and `[Authorize]` returns 401. See `AllowsQueryToken()` in `Program.cs`.

### Dev token flow (LocalJwt) — `Controllers/AuthController.cs` (`#if DEBUG`)
1. `POST /api/auth/login { email, password }` (with `API-Key` header) → verifies password vs `dbo.UserPasswords` (PBKDF2 via `IPasswordHasher`) → returns `{ token, userId, email }`. JWT claims: `sub=UserId`, `email`, `jti`, `name`; `iss=FlowDesk.Api`, `aud=FlowDeskClient`, `Jwt:Key` from `appsettings.Development.json`, 3h expiry.
2. `POST /api/auth/generate-hash { email, password }` → returns a PBKDF2 hash for an existing user (used to seed a password).

> **Note:** `dbo.UserPasswords` is NOT in the checked-in DDL and is absent from fresh DBs. Seed it via `Database/_DevScripts/AddChatServiceUser.sql`.

### Dev service user (for testing the proxy/token flow)
- Email `chatservice@flowdesk.local`, password `ChatSvc#Dev2026`, UserId `6936e0e0-972a-493c-98d2-87d93cf15e5e`. No roles granted (add `HelpdeskExecute` explicitly when on-behalf ticket creation is needed).
- In the **real** flow the bearer comes from the Portal-logged-in user, not this account.

---

## 4. Proxy layer — `Controllers/UnpaProxyController.cs` **[ADDED]**

Reverse proxy: `[Authorize] {GET|POST|PUT|PATCH|DELETE} /api/proxy/unpa/{**path}` → `{UnpaChat:BaseUrl}/{path}` (config `UnpaChat:BaseUrl`, default `http://localhost:3010/api/v1/flowdesk`).

Behavior:
- Resolves the current `AppUser`; if unresolved → 401 `{"error":"Unable to resolve current user"}`.
- Forwards method, body, and query (minus gateway params `api_key`/`access_token`/`API-Key`).
- **Injects current-user identity as headers** (consumed by our `api/src/middleware/flowdesk-user.middleware.js`):

| Header | Source (`AppUser`) |
|---|---|
| `X-FlowDesk-User-Id` | `UserId` (**required** — middleware no-ops without it) |
| `X-FlowDesk-User-Email` | `Email` |
| `X-FlowDesk-User-Display-Name` | `DisplayName` (or `FirstName+LastName`) |
| `X-FlowDesk-User-Is-Vip` | `IsVip` → `"true"`/`"false"` |
| `X-FlowDesk-User-Org-Code` | last segment of `PrimaryOrgUnitCodePath` |
| `X-FlowDesk-User-Org-Name` | `PrimaryOrgUnitName` |
| `X-FlowDesk-User-Org-Path` | `PrimaryOrgUnitCodePath` (e.g. `UNCS/DPKO/UNTMIS/ODSRSGFP`) |
| `X-FlowDesk-User-Duty-Station` | `DutyStationName` |
| `X-FlowDesk-User-Token` **[ADDED]** | the caller's own bearer (from `Authorization`, or `?access_token=` for SSE) — lets the chat call back into Altiora acting as the user. **Never log it.** |

- Streams responses including **SSE** (`text/event-stream`) with `ResponseHeadersRead` + `DisableBuffering` + per-chunk flush.
- Chat unreachable → 502 `{"error":"Chat service unavailable"}`.
- Registered named `HttpClient "UnpaChat"` (infinite timeout, no web proxy) in `Program.cs`.

**Verified E2E (2026-07-15):** authed proxy call injected all 8 headers correctly and relayed a downstream 200.

---

## 5. IP-0 — Intent → service resolution (two-level key)

**Model:** a global `ServiceCatalog` (GUID tree) is "distributed" into per-org-unit offerings `OrganizationUnitService` (int). **Forms attach to the distribution (`OrganizationUnitServiceId`), not the catalog item** — the same service has different forms per location/provider.

### Catalog — `Controllers/ServiceCatalogController.cs` (`[Authorize]`, `api/servicecatalog`)
- `GET /api/servicecatalog/search?q={term}&limit=10&includeInactive=false&rootId={guid?}` → `ServiceCatalog[]`. **Plain SQL `LIKE` only — NO intent NLP.** Only disambiguator is `rootId` (subtree). **No location/service-center filter** (catalog is location-agnostic).
- `GET /api/servicecatalog/{id:guid}` · `/code/{code}` · `/requestable` · `/{id}/children` · `/{id}/descendants` · `/root`.

> Intent NLP stays on the **chat side** (Qdrant `flowdesk_services`, semantic search). Sync that collection from Altiora's catalog; use Altiora only for the distribution resolution below.

### Distribution resolution — `Controllers/ServiceDistributionController.cs`
- **`POST /api/ServiceDistribution/detect`** — body `{ ServiceId(guid, required), LocationPath, BeneficiaryOrgUnitPath }` → `ProviderDetectionResponse[]` (ordered by match specificity). **This is how you go catalog-item + location → concrete `OrganizationUnitServiceId`.**
- `GET /api/ServiceDistribution/{serviceId:guid}` → all `OrganizationUnitService` for a catalog item.

**IP-0 output contract (target):** `{ catalogServiceId: GUID, organizationUnitServiceId: int }`. Location is a **primary discriminator** of the form — resolve beneficiary/location BEFORE fetching the schema.

---

## 6. IP-1 — Form schema (fetch + materialize + sync)

### 6a. Fetch — `Controllers/ServiceDistributionController.cs`
- `GET /api/ServiceDistribution/{organizationUnitServiceId:int}/schema` → current published `SchemaJson` (raw JSON).
- `GET /api/ServiceDistribution/schemas/{schemaId:int}` → specific version.
- `GET /api/ServiceDistribution/{organizationUnitServiceId:int}/schemas` → full version history `[{Id, Version, SchemaJson, CreatedAt, UpdatedAt, status}]`.

**Schema shape (opaque, authored by the React Flow form builder — server never parses fields):**
```
{ fields: [ { id: string, required: bool, /* type, entityId/fieldId for LOV, ... */ } ],
  rules:  [ /* conditional visibility / validation */ ] }
```
Stored in `OrganizationUnitServiceFormSchemas` (`Id, OrganizationUnitServiceId, SchemaJson, Version, IsPublished, CreatedAt, UpdatedAt`), keyed by `OrganizationUnitServiceId`. Field type / enum options / conditional visibility live **inside** the JSON, not in columns.

### 6b. LOV (dropdown option-sources) — `Controllers/FormLookupController.cs` (`api/FormLookup`)
- `POST /api/FormLookup/values` → `[{ value, label }]` (dynamic dictionary lookup, BI_Entities/BI_Fields).
- `POST /api/FormLookup/rows` → grid rows.
- A schema field references an option-source by entity/field id; options are resolved **at runtime**, not embedded in the schema.

### 6c. Change signal (for cache invalidation)
- **Versioning:** `Version INT` + `IsPublished BIT` + `UpdatedAt` on `OrganizationUnitServiceFormSchemas`. No content-hash/ETag natively (`Cache-Control: no-store` on all `/api`).
- **[ADDED]** `GET /api/ServiceDistribution/{organizationUnitServiceId:int}/schema/version` → `{ organizationUnitServiceId, schemaId, version, updatedAt, contentHash(SHA256) }` — cheap poll-probe (no full body).
- **SignalR event (primary signal):** hub `/api/notificationHub`, event **`ServiceFormChanged`** payload `{ serviceId(=OrganizationUnitServiceId), catalogItemId, updatedBy, changedParts[∈ structure|required|rules|schema] }`. Token via `?access_token=`. Related: `ServiceAvailabilityChanged`, `ServiceManagerOnlyChanged`, `ServiceTipsChanged`.

**Ratified materialization decisions:** phase = single (`order = fields[]` index); LOV = **hybrid** (bake `EnumOption` at materialize + TTL/version, re-fetch on `ServiceFormChanged` or TTL); schema-graph keyed on `OrganizationUnitServiceId`.

---

## 7. IP-2 — Directory / reference data

All `[Authorize]`. Used both for server-side slot resolution and (via a chat-side typeahead endpoint) for autocomplete controls.

| Purpose | Endpoint |
|---|---|
| User search (internal, scoped) | `GET /api/users/search?searchTerm=&limit=10` |
| User search (global) | `GET /api/users/search/global?searchTerm=&limit=20` |
| User by id | `GET /api/users/{id:guid}` |
| **Current user** | `GET /api/users/me` → full `AppUser` (roles+permissions) |
| Azure AD / Graph search | `GET /api/users/search/azure?searchTerm=` |
| Locations | `GET /api/locationlookups/{regions,countries,cities,...}` |
| Duty stations | `GET /api/dutystations`, `/search?q=`, `/orgunit/{id}/effective` |
| Org units / providers | `GET /api/organization/{tree,children,ancestors,descendants,providers,search}` |
| Approver preview | `GET /api/tickets/resolve-approver?orgUnitId={int}` → `{ source: Approver|Manager|None, users[] }` |

- **Beneficiary** = any `AppUser`; use the user-search endpoints; carried as `CreateTicketDto.BeneficiaryId`.
- Chat-side plan: add `GET /flowdesk/directory/:type?q=` (typeahead) proxying these — does **not** exist in Altiora.

---

## 8. IP-3 — Service Request creation

### Model — `Tickets` (`Models/Ticket.cs`)
`TicketId(int)`, `TicketNumber(string,unique)`, `ServiceId(catalog GUID)`, `OrganizationUnitServiceId(int)`, `CategoryId`, `FormSchemaId`, **`FormDataJson`** (filled form), `WorkflowId`/`CurrentStateId`, `RequesterId`, `BeneficiaryId`, location block, `Status` (default `'New'`).

### Create — `Controllers/TicketsController.cs`
- **`POST /api/tickets`** (`[Authorize]`), body `CreateTicketDto`:
  `{ Title, Description, ServiceCode (catalog GUID or code string), OrganizationUnitServiceId, Priority, Status, FormDataJson, BeneficiaryId, RequesterId (needs HelpdeskExecute for on-behalf), RegionId/CountryId/DutyStationId/AreaId/BuildingId/RoomId/LocationPath, ManualApproverUserId, AssignedToOrgUnitId, SharedWithIds[], Attachments[] }`.
- Server auto-resolves the current published form schema (stamps `FormSchemaId`); auto-creates an Authorization (`Status="Auth Pending"`) when `ApprovalRequired` or High priority; else `'Pending'`/`'In Progress'`.
- **Response:** `201 Created` + the `Ticket` object (`TicketId`, `TicketNumber`, `Status`, `FormSchemaId`, ...).
- **No server-side draft state** (DraftSR is chat/session-only). **No server-side validation of `FormDataJson` against the schema** — the chat is responsible for required/type/enum validation.
- **Errors:** `401` (no user), `400 { ErrorCode, ClientErrorCode, Message }` (integration failure), `500 { Message }`.

**On-behalf:** setting `RequesterId` (create for another user) requires the acting identity to hold role **`HelpdeskExecute`**.

---

## 9. Endpoint quick-reference (chat scope)

| Method | Path | IP | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | auth | Dev LocalJwt token |
| POST | `/api/auth/generate-hash` | auth | Dev password hash |
| GET | `/api/users/me` | IP-2 | Current user |
| GET | `/api/servicecatalog/search` | IP-0 | Catalog substring search |
| POST | `/api/ServiceDistribution/detect` | IP-0 | catalog+location → OUServiceId |
| GET | `/api/ServiceDistribution/{ouId}/schema` | IP-1a | Current form SchemaJson |
| GET | `/api/ServiceDistribution/{ouId}/schema/version` **[ADDED]** | IP-1c | version+hash probe |
| GET | `/api/ServiceDistribution/{ouId}/schemas` | IP-1c | version history |
| POST | `/api/FormLookup/values` | IP-1b | LOV options |
| GET | `/api/users/search` | IP-2 | User/beneficiary search |
| GET | `/api/dutystations/search` | IP-2 | Location typeahead |
| GET | `/api/tickets/resolve-approver` | IP-2 | Approver preview |
| POST | `/api/tickets` | IP-3 | Create Service Request |
| — | `/api/notificationHub` (SignalR) | IP-1c | `ServiceFormChanged` events |
| ALL | `/api/proxy/unpa/{**path}` **[ADDED]** | proxy | → chat API w/ user headers |

---

## 10. Gaps & constraints (design-driving)

1. **No intent NLP in Altiora** — catalog search is `LIKE` only; keep semantic intent on the chat side.
2. **Two-level key** — `OrganizationUnitServiceId` (not the catalog GUID) is the form/schema key; derive it via `/ServiceDistribution/detect` after resolving beneficiary/location.
3. **Opaque form schema** — `{fields[], rules[]}`; types/enums/conditions are inside the JSON; LOV resolved separately via `/FormLookup`.
4. **No content-hash/ETag/webhook** — cache invalidation = SignalR `ServiceFormChanged` (primary) + `schema/version` poll (fallback).
5. **No server draft, no server-side form validation** — DraftSR lives in the chat; the chat validates before `POST /api/tickets`.
6. **Auth is proxy-injected (inbound)** — the chat trusts the `X-FlowDesk-User-*` headers from `UnpaProxyController` and performs no authentication of its own. These headers are authoritative, so **the chat API must never be reachable except through the proxy**.

---

## 13. Outbound auth — chat → Altiora (RESOLVED)

The proxy covers the inbound leg only. The chat also calls **back** into Altiora (catalog, detect, schema, LOV, directory, ticket create), and that leg must authenticate. **Hybrid, by acting identity:**

| Caller | Acts as | Why |
|---|---|---|
| In-turn calls (a user request is in flight) | the **end user** — their bearer, forwarded as `X-FlowDesk-User-Token` | Altiora scopes reads per acting user (e.g. `/users/search`); and the ticket is created by its own requester, so **`HelpdeskExecute` is NOT needed** for the self-service path |
| Background jobs (catalog sync, schema TTL refresh, SignalR) | the **service account** (`ALTIORA_SERVICE_EMAIL`) | no user is in flight |

Mechanism (chat side):
- `middleware/flowdesk-user.middleware.js` reads `X-FlowDesk-User-Token` into `req.flowdeskUser.token` and opens an **AsyncLocalStorage** context for the request (`services/acting-user.context.js`) — so the token need not be threaded through the interpreter, tools adapter and backends.
- `services/altiora-client.js` → `getAltioraClient()` uses `createActingTokenProvider()`: the acting user's token when a request is in flight, else the service account. Pass `token` per call to force a specific identity.

`HelpdeskExecute` is still required only for genuine **on-behalf** creation (`CreateTicketDto.RequesterId` ≠ acting user).

**Verified E2E (2026-07-15):** bearer via `Authorization` → forwarded and matches; bearer via `?access_token=` (SSE) → forwarded and matches; `api_key`/`API-Key`/`access_token` stripped from the downstream call.

---

## 11. Source pointers (Altiora repo)

- Auth: `Controllers/AuthController.cs`, `Services/CurrentUserService.cs`, `Repositories/AuthRepository.cs`, `Middleware/ApiKeyMiddleware.cs`
- Catalog/distribution/schema: `Controllers/ServiceCatalogController.cs`, `Controllers/ServiceDistributionController.cs`, `Controllers/FormLookupController.cs`, `Models/ServiceFormSchema.cs`
- Directory: `Controllers/UsersController.cs`, `Controllers/DutyStationsController.cs`, `Controllers/OrganizationController.cs`, `Controllers/LocationLookupsController.cs`
- Tickets: `Controllers/TicketsController.cs`, `Models/Ticket.cs`
- Proxy **[ADDED]**: `Controllers/UnpaProxyController.cs`, `Program.cs` (HttpClient "UnpaChat"), `appsettings.json`/`appsettings.Development.json` (`UnpaChat:BaseUrl`)
- User model: `Models/User.cs` (`AppUser`)

## 12. Chat-side pointers (UNPA_Ingest repo)

- Proxy header consumer: `api/src/middleware/flowdesk-user.middleware.js`
- Chat routes (proxy target): `api/src/instances/flowdesk/routes/flowdesk.route.js` (mounted `/api/v1/flowdesk`)
- Tools adapter (choke-point, 11 tools, currently mocks/local): `api/src/instances/flowdesk/services/altiora-tools.adapter.js`
- Schema compiler + seed: `api/src/instances/flowdesk/schema-graph/{schema-compiler.js,seed-schema-graphs.js}`
- DraftSR + submit: `api/src/instances/flowdesk/services/draft-sr.service.js`
- resolve.search backends: `api/src/instances/flowdesk/services/backends/*.backend.js`
- Turn/controls contract precedent: `resolveChoices` / `confirm_or_choose` in `interpreter/interpreter-engine.js` + `mcp/.../ChoiceButtons.jsx`
