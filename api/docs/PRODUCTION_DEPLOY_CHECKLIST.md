# FlowDesk Chat V2 ↔ Altiora — Production Deploy Checklist

Deployment runbook for the FlowDesk Chat V2 intake chat and its Altiora ITSM
integration (plan I-0…I-8 + post-plan tracks). Written 2026-07-17.

> **Scope note.** This is a checklist, not an action. It does **not** commit the
> uncommitted Altiora `.NET` edits and does **not** flip the live server into
> `altiora` schema-provider mode — both are explicit owner (Ivan) decisions. The
> provider-flip runbook (§5) documents *how* to flip and roll back, for when that
> decision is made.

---

## 1. Prerequisites

- [ ] **Altiora API reachable** from the chat host (`GET {ALTIORA_API_BASE}/api/health` with the `API-Key` header → `200 {"status":"Healthy","database":"Connected"}`).
- [ ] **Altiora `.NET` build deployed** with the three integration edits (currently UNCOMMITTED in `D:\UN\Repos\FlowDesk\FlowDesk`): `TicketRepository.cs` FK-default fix, `EmailService.cs` Dev-mock + 10s SMTP timeout, and the proxy layer (`UnpaProxyController.cs` + `Program.cs AllowsQueryToken` + `ServiceDistributionController` A-1 endpoint). Prod uses a real SMTP server, so the Dev-mock short-circuit is inert there (guarded by `IHostEnvironment.IsDevelopment()`).
- [ ] **Backing services up:** Memgraph (`:7687`), Qdrant (`:6333`), TEI embeddings (`:8081`, 1024-dim), Redis. Same `projectadvisor-network` if containerized.
- [ ] **Chat API host** can bind port **3010** (hardcoded).
- [ ] **Service account** exists in Altiora (`dbo.UserPasswords` seeded) — see §3.

---

## 2. Environment variables (`api/.env`)

### Altiora connection
| Var | Purpose | Example |
|---|---|---|
| `ALTIORA_API_BASE` | Altiora API root | `http://localhost:5000` |
| `ALTIORA_API_KEY` | `API-Key` header (dual-gate auth) | `<key from API_Clients>` |
| `ALTIORA_SERVICE_EMAIL` | Service-account login | `chatservice@flowdesk.local` |
| `ALTIORA_SERVICE_PASSWORD` | Service-account password | `<secret>` |

### FlowDesk feature flags
| Var | Purpose | Prod value |
|---|---|---|
| `FLOWDESK_CHAT_V2` | Enable the Chat V2 interpreter contour | `true` |
| `FLOWDESK_LLM_PROVIDER` | LLM backend (`claude-code`/`claude-sdk`/`api`) | per infra (avoid the platform `LLM_MODEL` collision) |
| `FLOWDESK_LLM_MODEL` | Explicit model (never inherit platform `LLM_MODEL`) | e.g. `claude-sonnet-4-6` |
| `FLOWDESK_SCHEMA_PROVIDER` | `graph` (pre-seeded forms via compile) or `altiora` (on-demand materialize) | **`graph` for pilot** — see §5 |
| `FLOWDESK_DIRECTORY_PROVIDER` | `mock` or `altiora` (real users/duty-stations for resolvers + typeahead) | `altiora` |
| `FLOWDESK_SUBMIT_TARGET` | `altiora` = real `POST /api/tickets`; unset = local Memgraph | `altiora` |

### Schema-sync (I-5, active only when `FLOWDESK_SCHEMA_PROVIDER=altiora`)
| Var | Purpose | Default |
|---|---|---|
| `FLOWDESK_SCHEMA_SYNC_SIGNALR_ENABLED` | SignalR `ServiceFormChanged` push | `true` |
| `FLOWDESK_SCHEMA_SYNC_POLL_INTERVAL` | Fallback poll seconds | `300` |

### Infra (shared platform vars)
`QDRANT_URL`, `FLOWDESK_SERVICE_COLLECTION` (default `flowdesk_services`), TEI URL, Memgraph auth (`memgraph`/`secret_password_123`), Redis URL.

- [ ] All of the above set; secrets from the secret store, not committed.
- [ ] Never log the forwarded end-user bearer token.

---

## 3. Database / identity

- [ ] **Service account** row present in Altiora `dbo.UserPasswords` (PBKDF2 hash) for `ALTIORA_SERVICE_EMAIL`. Seed via `Database/_DevScripts/AddChatServiceUser.sql` (idempotent) in dev; provision equivalently in prod.
- [ ] **API_Clients** entry for the `API-Key` the chat presents (or the Portal's key, in the proxy model).
- [ ] **On-behalf submits** (beneficiary ≠ actor) require the service user to hold `HelpdeskExecute`. Self-service submits do **not** — grant only if on-behalf is in scope.
- [ ] Verify `GET {ALTIORA_API_BASE}/api/auth/login` → token; `GET /api/users/me` → the service user with an org path.

---

## 4. Startup sequence

1. [ ] **Catalog sync** (populates Qdrant intent index): `node -r dotenv/config scripts/sync-altiora-catalog.js` → 79 real EO-HR/EO-FIN services. (`--purge-stale` only if migrating a collection that still holds legacy points.)
2. [ ] **Utterance generation** (I-2b, casual-recall): `node -r dotenv/config scripts/generate-altiora-utterances.js` → +474 utterance vectors. Idempotent.
3. [ ] **Materialize forms** (graph mode serves these via `compile`): `node -r dotenv/config scripts/materialize-altiora-service.js --all` → 76 forms into Memgraph. **Re-run after any process that calls `registry.invalidateAll()`** (notably the flowdesk test suite's teardown) — it wipes `namespace='Altiora'` forms.
4. [ ] **Start the chat API**: `node --use-system-ca api/index.js` (port 3010). Restart after any `api/` change.
5. [ ] **Schema-sync** auto-starts only when `FLOWDESK_SCHEMA_PROVIDER=altiora` (SignalR connect + fallback poll); in graph mode it stays dormant (nothing to invalidate).

- [ ] Confirm boot: `curl -s -o /dev/null -w "%{http_code}" localhost:3010/api/v1/flowdesk/health` → `200`.

---

## 5. Provider-flip runbook (graph → altiora), and rollback

> The pilot runs in **graph mode** (forms pre-materialized by §4.3, served via `compile`). Flip to **altiora mode** only when scaling past a handful of services or when dynamic catalog freshness is needed — an **owner decision**. Do NOT flip as part of routine deploy.

**Flip:**
1. Ensure catalog sync (§4.1) + directory provider = `altiora` are in place.
2. Set `FLOWDESK_SCHEMA_PROVIDER=altiora`.
3. Restart the chat API. On boot the schema-sync service connects to the SignalR hub (service-account token) and the fallback poll arms.
4. First resolution of each service now materializes on demand (detect → getSchema → materialize → bake LOV → cache) and I-5 keeps it fresh (lazy `markStale` on `ServiceFormChanged` / poll hash-drift).

**Rollback:** unset `FLOWDESK_SCHEMA_PROVIDER` (or set `graph`), restart. Pre-materialized forms (§4.3) still serve. No data migration either way.

---

## 6. Smoke tests (post-deploy)

- [ ] **Resolve:** `POST /api/v1/flowdesk/chat {message:"I need to initiate the separation process"}` → resolves `EO-HR-SA-SS-ISP`, asks a real question.
- [ ] **Disambiguation (I-2c):** `{message:"record my marriage"}` → `responseType:"disambiguation"` with a `controls[]` choice over Record Marriage / Divorce / Dependent-Spouse.
- [ ] **Materialized form:** the separation flow presents real Altiora questions/options (incl. any baked LOV).
- [ ] **Typeahead (I-6):** `GET /api/v1/flowdesk/directory/user?q=<name>` → real Altiora users (requires `FLOWDESK_DIRECTORY_PROVIDER=altiora`).
- [ ] **Submit (I-7):** complete a flow → confirm → real Altiora ticket (`TKT-YYYY-NNNNNN`), fast response (no SMTP hang; requires the EmailService fix deployed).
- [ ] **controls[] contract:** an enum question response carries both `controls:[{type:"choice",…}]` and legacy `choices` (dual-emit).

---

## 7. Monitoring

- [ ] **Chat API log** — watch for: `[schema-sync]` events (`signalr_connected`, `mark_stale`, `poll_done`), `[schema-orchestrator]` warnings (multi-provider replace, LOV partial), `[resolve.search/SERVICE] degraded`.
- [ ] **Altiora ticket create latency** — should be sub-second in prod (real SMTP). A >40s hang means the notification-email path is blocking (dev-only symptom; prod uses real SMTP).
- [ ] **Qdrant** `flowdesk_services` point count ≈ 553 (79 formal + 474 utterance). A drop means a bad sync/purge.
- [ ] **Memgraph** — `registry.listCached()` count tracks materialized forms; a drop to 0 means something ran `invalidateAll` (re-run §4.3).
- [ ] **SignalR health** (altiora mode) — `signalrConnected()` true; on drops the fallback poll (§2) is the guaranteed freshness track.
- [ ] **Auth** — 401s from Altiora → service-token expiry/refresh; never surface the token in logs.

---

## 8. Known follow-ups (not blockers)

- **FE-002** — port the `controls[]` renderer from the mcp/ reference to the production `@flowdesk/chat-v2` package (Altiora Portal); reconcile shadcn/i18n divergence.
- **Browser smoke** — manual end-to-end in the Portal UI before real users.
- **APPROVER-001** — approver-resolution E2E once a dev service with `approvalRequired=true` exists (none today).
- **Owner decisions** — commit the Altiora `.NET` edits; flip to altiora mode when scaling.
- **I-2c tuning** — the disambiguation threshold (semantic-search medium/high bands) can be tuned if too many/few clusters trigger it.
