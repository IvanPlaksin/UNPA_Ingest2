> ⛔ **SUPERSEDED (2026-07-15) by `SESSION_TASKS_ALTINT2.md`.** ALTINT2 is now the **sole session** on these tasks (confirmed by the user).
> Kept for history only. **Do not follow the "Not started / free to claim" list below** — it predates the real ratified plan (**I-0…I-8**, Architect chat `d930d045-6316-4484-8ee4-89041fb8e1c5`) and the **CATALOG GAP** finding (the real Altiora catalog is 79 EO-HR/EO-FIN services; the F-track's hardware/badge/VPN services are fictional). See ALTINT2's register for true status.

# Session Task Register — ALTINT1

> **Agent name:** `ALTINT1` (Claude Code session)
> **Repo:** `d:/UN/Repos/UNPA/UNPA_Ingest`
> **Scope:** FlowDesk Chat V2 / Altiora (`api/src/instances/flowdesk/**`)
> **Last updated:** 2026-07-15
> **Session status:** ⏸ **PAUSED — awaiting user command** (machine reboot pending; Docker Desktop is down → Memgraph :7687 / Qdrant / TEI offline).
> **Purpose:** prevent task/file collisions with other concurrent Claude Code sessions.
> **Coordination protocol:** work is planned/ratified via the Architect chat `8c42961a-7fb3-4f04-905b-ba5eab0c0487`.

---

## ⚠️ Collision warning (read first)

A **parallel session** is active in the same area. Observed live edits by that session:

| File | Owner | Note |
|---|---|---|
| `api/src/instances/flowdesk/services/directory/providers/altiora.provider.js` | **OTHER SESSION** | Created + actively refined (e.g. `mapLocation` updated to `dutyStationId`/`cityName`/`timeZoneTitle`). **ALTINT1 does NOT own this file** — I only *consume* its exported `mapSessionUser`. |
| `api/src/instances/flowdesk/services/directory/providers/__tests__/altiora.provider.test.js` | **OTHER SESSION** | Created by that session. |
| `api/src/instances/flowdesk/services/directory/providers/__tests__/adapter-contract.test.js` | **ALTINT1** (created) + OTHER (appended an "Altiora provider — implements the interface shape (F11c)" block) | **Shared file — coordinate before editing.** |

**Hard dependency to preserve:** `mock.provider.js` imports `mapSessionUser` from `altiora.provider.js`. If the other session changes that export's name/shape, `mock.provider.js` breaks.

---

## Tasks owned by ALTINT1

All tasks below are **COMPLETE** and verified unless stated otherwise. Files listed are those ALTINT1 created (NEW) or modified (MOD).

---

### Task F10 — ADCC v1.0 (Altiora Dialogue Conduct Codex) — ✅ DONE / RATIFIED
**Description:** Deterministic conversation-conduct layer. Fixes the root bug where an answer to an open question ("I need big screen") was re-classified as a new intent. 6 principles + 22 Codex rules; 12/12 CALM patterns emerge from the core (zero gaps).

| File | State | Code owned |
|---|---|---|
| `api/scripts/seed-adcc-principles-rules.js` | NEW | Seeds 6 `CodexPrinciple` (ADCC-PRINCIPLE-A..F) + 22 `CodexRule` (ADCC-080..100 + META-001), `domain='Altiora'`, scope `['altiora','dialogue-conduct']`, `DERIVES_FROM` links. |
| `api/src/instances/flowdesk/interpreter/repair-router.js` | NEW | `interpret()` (ADCC-081 priority order), `tryAcceptAsAnswer()` (ADCC-082 answer-first by slot type), `fuzzyMatchOption()`. |
| `api/src/instances/flowdesk/interpreter/templates/dialogue-markers.js` | NEW | 6 universal actions + repair markers × 6 UN langs, `detectUniversalAction/detectRepairMarker/isMetaMarker`, `CORRECTION_FORM_RE`. CJK=substring, else Unicode lookaround (`\b` is ASCII-only). |
| `api/src/instances/flowdesk/contracts/draft-sr.schema.json` | MOD | Added `dialogueStack`, `repair`, `pendingAction`, `lastAgentQuestion`, `userId`, `sequence` definition, `parked` status. |
| `api/src/instances/flowdesk/contracts/draft-sr.reducer.js` | MOD | `topSequence/syncTopSequence/closeSequence/bumpRepair/clearSequences`; `REPAIR_LADDER`, `REPAIR_THRESHOLDS`, `ladderStepFor`, `recordRepair`, `resetSlotRepair`; `setLastQuestion`, `setPendingAction/clearPendingAction`, `park/unpark`, `completeness`. |
| `api/src/instances/flowdesk/services/draft-sr.service.js` | MOD | Stack ops, repair ops, pendingAction ops, `park/unpark/discard/parkArchive/getParkedByUser` (+ per-user `parked:{userId}` index), `userId` on `create`. |
| `api/src/instances/flowdesk/interpreter/interpreter-engine.js` | MOD | **(largest surface — see Task F11d too)** REPAIR_ROUTER wiring, `applyRepairDecision`, `applyUniversalAction`, `resolvePendingAction`, `syncStack`, grounding call, `closer` on submit, confirm-switch (ADCC-084), offer_resume (ADCC-098), graceful `runTurn` catch (ADCC-085), ROUTER prompt. |
| `api/src/instances/flowdesk/interpreter/templates/ui-strings.js` | MOD | ~14 new keys × 6 langs (cancelConfirm, skipOffer, handoffOffer, parked, restartConfirm, capabilitiesList, optionsHint, switchConfirm, resumeOffer, submitted, internalError, directoryUnavailable, directoryManual, …). ⚠ single-quoted JS — **escape apostrophes**. |
| `api/src/instances/flowdesk/interpreter/templates/echo.js` | MOD | `validateGrounding`, `GroundingViolationError`, `isEchoable`, `buildPreamble` (`other[]`/`hasAny` generic ack). |
| `api/src/instances/flowdesk/contracts/llm-provider.stub.js` | MOD | `runSlotExtract`: prompt guidance (canonical `"self"` marker, no invented placeholders) + placeholder filter. |
| `__tests__/repair-router.test.js`, `repair-ladder.test.js`, `grounding-switch-resume.test.js`, `calm-acceptance.test.js`, `directory-degradation.test.js` | NEW | Under `api/src/instances/flowdesk/interpreter/__tests__/`. |

---

### Task F10.1 — ROUTER OUT_OF_SCOPE tightening — ✅ DONE
**Description:** "what time is it / weather / joke" → crisp OUT_OF_SCOPE redirect; service-domain questions (incl. technical, e.g. VPN full-vs-split tunnel) stay INFO_QUESTION.

| File | State | Code owned |
|---|---|---|
| `api/src/instances/flowdesk/interpreter/interpreter-engine.js` | MOD | `router()` prompt only (role + INFO/OUT_OF_SCOPE definitions + few-shot). |

---

### Task LLM-SWITCH — Claude Code CLI → Claude API (SDK) — ✅ DONE
**Description:** FlowDesk chat LLM switched to the Anthropic Messages API via `@anthropic-ai/sdk` (Haiku). Zero code change — env only.

| File | State | Code owned |
|---|---|---|
| `api/.env` | MOD | `FLOWDESK_LLM_PROVIDER=anthropic-api`, `FLOWDESK_LLM_MODEL=claude-haiku-4-5-20251001`. |

---

### Task F11 — Real directory integration (Altiora) — ✅ DONE (except F11c = other session)
**Description:** Directory made provider-swappable and wired to the real Altiora API (IP-2). Layering: `resilient → cached → base`.

| File | State | Task | Code owned |
|---|---|---|---|
| `api/src/instances/flowdesk/services/directory/adapter.interface.js` | NEW | **F11a** | 9-method `DirectoryAdapter` contract, `ADAPTER_METHODS`, `NotImplementedError`, `DirectoryUnavailableError`, typedefs. |
| `api/src/instances/flowdesk/services/directory/index.js` | MOD (rewritten) | **F11a** | `getDirectoryProvider(name, config)` factory, registry `{mock, altiora}`, `FLOWDESK_DIRECTORY_PROVIDER`, cache+resilient layering, backward-compatible flat facade. |
| `api/src/instances/flowdesk/services/directory/providers/mock.provider.js` | NEW | **F11b** | Wraps `user.mock.js`/`location.mock.js`; `getCurrentUser` maps header shape via `mapSessionUser` (⚠ imports from `altiora.provider.js` — other session's file). |
| `api/src/instances/flowdesk/services/directory/providers/cached.provider.js` | NEW | **F11e** | Decorator: stale-while-revalidate (users/search), plain TTL (locations), `invalidateUser/invalidateLocations`, djb2 hashing, Redis best-effort. |
| `api/src/instances/flowdesk/services/directory/providers/resilient.provider.js` | NEW | **F11f** | Maps backend failures → `DirectoryUnavailableError`; last-known-good fallback store. |
| `api/src/instances/flowdesk/interpreter/interpreter-engine.js` | MOD | **F11d** | `AsyncLocalStorage` (`authStore`) + `getCurrentUser` wrapper + `runTurn` publishes `{sessionUser: userContext}` → real logged-in identity with **zero threading**, concurrency-safe. Also the F11f degradation path (`pendingAction: directory_unavailable`, retry/manual entry). |
| `api/src/instances/flowdesk/interpreter/__tests__/auth-context.test.js` | NEW | **F11d** | Header identity → getCurrentUser; no-headers → pilot default. |
| `api/src/instances/flowdesk/services/directory/providers/__tests__/adapter-contract.test.js` | NEW (⚠ shared) | **F11g** | `runAdapterContract` provider-agnostic suite + factory tests. |
| `api/src/instances/flowdesk/services/directory/providers/__tests__/cached.provider.test.js`, `resilient.provider.test.js` | NEW | F11e/F11f | |
| `api/.env` | MOD | **F11h** | `FLOWDESK_DIRECTORY_PROVIDER=mock` (pilot default — `altiora` requires the Portal proxy for identity), `ALTIORA_API_BASE/API_KEY/SERVICE_EMAIL/SERVICE_PASSWORD`. |

**NOT owned:** `providers/altiora.provider.js` (**F11c** — other session).
**Not modified:** `interpreter/resolvers.js` — verified it already delegates to `directory.resolveApprover()` (provider-agnostic; no tweak needed). **Leave as-is.**

---

### Task F12 — ARTICLE-KB deflection — ✅ DONE
**Description:** Tier-0 self-service. Created Qdrant `altiora_knowledge` (1024-dim Cosine, matches TEI) + 22 articles, namespace `Altiora`. INFO_QUESTION now returns grounded answers.

| File | State | Code owned |
|---|---|---|
| `api/scripts/seed-altiora-knowledge.js` | NEW | `ARTICLES[]` (22: Hardware/Badge/Workspace/VPN/Software/Room/Parking/general), collection create-if-absent, TEI batch embed, Qdrant upsert (ids 1..N, idempotent). |

**Not modified:** `services/backends/article.backend.js` — already correct (namespace-filtered). **Leave as-is.**

---

### Task F13 / F13.1 — Service catalog expansion (3 → 7 services) — ✅ DONE
**Description:** Established the reusable "add a service" pattern + added 4 services (VPN, Software, Conference Room, Parking). All 7 fixtures round-trip exactly.

| File | State | Code owned |
|---|---|---|
| `api/src/instances/flowdesk/contracts/fixtures/schema-snapshot.vpn.json` | NEW | `IT-VPN`, 5 slots. |
| `api/src/instances/flowdesk/contracts/fixtures/schema-snapshot.software.json` | NEW | `IT-SW`, 6 slots (approver gated `slots.licenseType != 'individual'`). |
| `api/src/instances/flowdesk/contracts/fixtures/schema-snapshot.room.json` | NEW | `FAC-ROOM`, 7 slots (`attendees` number, `startTime` string — **no `time` slot type exists**). |
| `api/src/instances/flowdesk/contracts/fixtures/schema-snapshot.parking.json` | NEW | `FAC-PARK`, 4 slots. |
| `api/src/instances/flowdesk/schema-graph/seed-schema-graphs.js` | MOD | **F13a**: `FIXTURES` now auto-discovers `schema-snapshot.*.json` (drop-in). |
| `api/src/instances/flowdesk/schema-graph/__tests__/schema-graph.test.js` | MOD | `SERVICE_BY_FIXTURE` extended to all 7. |
| `api/scripts/register-flowdesk-service-utterances.js` | NEW | Registers example utterances into Qdrant `flowdesk_services` (ids 990000+, idempotent). |
| `api/jest.config.js` | MOD | **F13.1**: `setupFiles: ['dotenv/config']`. |

**Add-a-service recipe (owned by ALTINT1):** create fixture → `node -r dotenv/config api/src/instances/flowdesk/schema-graph/seed-schema-graphs.js` → add block to `register-flowdesk-service-utterances.js` + run → optional KB articles in `seed-altiora-knowledge.js`.

---

## Not started / free to claim

| ID | Description | Notes |
|---|---|---|
| **IP-3** | Real ticket submit → `POST /api/tickets` (replace Memgraph-only materialization). Would touch `services/draft-sr.service.js` (**ALTINT1-owned** — coordinate). | Highest user value. |
| **IP-1** | Form-schema materialization: Altiora `SchemaJson` → schema-graph, keyed on `OrganizationUnitServiceId`; two-level key via `/ServiceDistribution/detect`; SignalR `ServiceFormChanged` invalidation. Would touch `schema-graph/**` (**ALTINT1-owned** — coordinate). | |
| **IP-0** | Catalog sync from Altiora `/api/servicecatalog` → Qdrant `flowdesk_services`. Would touch `register-flowdesk-service-utterances.js` (**ALTINT1-owned**). | Intent NLP stays chat-side. |
| **F13.2** | Investigate `schema-graph/__tests__` hang at `beforeAll(seedAll())` under jest. | See Known issues. |
| **F14** | Native-language KB articles (currently English-only). | Content task. |

---

## Known issues / environment

1. **Docker Desktop is DOWN** → Memgraph `:7687`, Qdrant `:6333`, TEI `:8081` offline. Memgraph-backed jest suites (`schema-graph`, `draft-sr.service`, `resolve-search.service`) fail with **connection errors — environmental, not code**. They pass when the stack is up. Machine reboot pending.
2. **Memgraph tests + jest:** `schema-graph/__tests__` hangs at `beforeAll(seedAll())` under jest even when Memgraph is up — while driver-connect, single write, two writes, and standalone `seedAll()` (~2s) all succeed. **Unresolved (F13.2).** Verify schema-graph work standalone with `node -r dotenv/config`.
3. **Creds:** `api/.env` `MEMGRAPH_PASSWORD` == the hardcoded default in `services/import-config.js` → the F13.1 dotenv setupFile is creds-neutral.
4. **Altiora dev API** `http://localhost:5000` is a **separate .NET service (not Docker)** — was UP and live-verified (login 200, `resolveUser('a')` → 20 real users).
5. **API restart required** after any `api/` change: plain `node --use-system-ca api/index.js` on **port 3010** (not nodemon).

---

## Verification status (last good run, before Docker went down)

- **165 non-Memgraph flowdesk tests green** (interpreter / directory / contracts / services).
- All **7 schema fixtures round-trip exactly** (standalone).
- **12/12 CALM patterns** green; **F11c/d 13 tests** green.
- Live-verified: 7 services resolve + flow + INFO; Altiora directory returns real users.

---

*Registered by **ALTINT1**. If you are another session: please do not edit files marked ALTINT1-owned without coordinating here first; append your own register rather than editing this one.*
