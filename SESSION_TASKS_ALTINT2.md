# Session Task Register — ALTINT2 (consolidated / sole owner)

> **Agent:** `ALTINT2` (Claude Code) — **sole session** on FlowDesk Chat V2 + Altiora integration (confirmed by user 2026-07-15).
> **Repo:** `d:/UN/Repos/UNPA/UNPA_Ingest` · **Scope:** `api/src/instances/flowdesk/**`
> **Supersedes:** `SESSION_TASKS_ALTINT1.md` (kept for history; **do not follow its "free to claim" list — it predates the real plan**).
> **Last updated:** 2026-07-15 — after full consistency review.

---

## Two tracks — and the one that matters

| Track | Architect chat | Content | Reality |
|---|---|---|---|
| **Chat V2 core** (F-series) | `8c42961a-7fb3-4f04-905b-ba5eab0c0487` | F1–F13: ADCC conduct, interpreter, directory adapter, KB, catalog expansion | ✅ Done — but built entirely on **invented fixtures** |
| **Altiora integration** (I-series) | **`d930d045-6316-4484-8ee4-89041fb8e1c5`** | Plan **I-0…I-8** — the real .NET ITSM integration | ◑ In progress — **this is the live plan** |

**Authoritative docs:** `api/docs/ALTIORA_API_CHAT_INTEGRATION_SPEC.md` (chat-scoped API reference) + memory `project_altiora_integration.md`.

---

## 🔴 Consistency findings (this review)

### 1. CATALOG GAP — the F-track's services are fictional (**top issue**)
The real dev Altiora catalog is **79 requestable services, all `EO-HR` / `EO-FIN`** (e.g. `EO-HR-BE-TRE-AHL` "Advance Home Leave Queries"). Queries for "laptop"/"access" return **0 hits**.

Everything the F-track built assumes a hardware/IT service desk that **does not exist in Altiora**:

| Artifact | Problem |
|---|---|
| 7 fixtures `schema-snapshot.{hardware,badge,workspace,vpn,software,room,parking}.json` (`IT-HW-LAP`, `SEC-ACC-BADGE`, `FAC-WS-DESK`, `IT-VPN`, `IT-SW`, `FAC-ROOM`, `FAC-PARK`) | **No counterpart in the real catalog.** Invented serviceIds; no catalog GUID → no `OrganizationUnitServiceId` → **I-7 submit cannot work for any of them**. |
| Qdrant `flowdesk_services` — 24 utterances I registered (ids 990000+) for VPN/Software/Room/Parking | **Pollutes** the collection that **I-2 must reseed from the real catalog**. Must be purged or superseded by I-2. |
| Qdrant `altiora_knowledge` — 22 KB articles (laptops/badges/VPN/parking…) | Content describes non-existent services. Harmless (deflection only) but **misleading**; realign after I-2. |
| `register-flowdesk-service-utterances.js` | Hand-authored utterances for fictional services — **superseded by I-2** (sync from Altiora + generate utterances). |

**Verdict:** the F-track code is *internally* correct and well-tested, but its **domain data does not correspond to the task**. F13 "catalog expansion" was, in hindsight, expansion of a fictional catalog. **I-2 is the fix and the true unblocker.**

### 2. `altiora-schema-client.js` is built but **unwired**
Implements `detectProviders` / `getSchema` / `getSchemaVersion` (+ its own `scoreProvider`, because Altiora's `MatchScore` is genuinely broken: inverted specificity + random scope attribution). **No consumer** outside its own tests — dangling until I-3/I-4.

### 3. Numbering drift
Three schemes in play: `F1–F13` (chat core), `I-0…I-8` (ratified plan), `IP-0…IP-3` (spec doc), plus ad-hoc `I-1`/`IP-0a`/`IP-0b`/`IP-1a` in code comments. **Canonical = `I-0…I-8`.** Map: spec IP-0≈I-2/I-3, IP-1≈I-4, IP-2≈I-6, IP-3≈I-7.

### 4. Integration Architect is un-briefed
`d930d045` was never told **I-1 is complete** nor the **outbound-auth (hybrid acting-identity) decision** — MCP `project-knowledge` was down at the time, and is **down again now**. Brief it as soon as MCP returns.

### 5. Two AsyncLocalStorage auth contexts (benign)
`services/acting-user.context.js` (I-1, outbound bearer) and the engine's `authStore` (F11d, inbound identity) are separate ALS stores. Not a bug — different legs of the same request. Candidate for later consolidation; **leave as-is**.

### 6. Pre-existing broken test (out of scope, not ours)
`aopeg/executors/__tests__/classify-intent.executor.test.js` — mocks `../../../../../../services/flowdesk/template-store`, which resolves to `api/services/...` (one `../` too many); the executor actually uses `../../services/template-store.js`. **git-clean, legacy AOPEG contour, unrelated to Chat V2.** Leave unless asked.

---

## Verification baseline (2026-07-15, stack UP after reboot)

Memgraph `:7687` ✓ · Qdrant `:6333` 200 ✓ · TEI `:8081` 200 ✓ · chat API `:3010` ✓ · Altiora dev `:5000` ✓

- `npx jest src/instances/flowdesk` → **29/30 suites PASS**; only `classify-intent.executor.test.js` fails (finding #6).
- `schema-graph` suite now **PASSES (108 s)** — F13.2 solved: it was seeding 7 fixtures ≈65 s against a 60 s hook budget, never a real hang (`jest.setTimeout(180000)`).
- `llm-provider` 16/16 ✓. Earlier mass failures were a **transient Memgraph cold start** right after reboot.

---

## Plan I-0…I-8 — true status

| # | Phase | Status | Evidence / owner |
|---|---|---|---|
| **I-0** | Auth setup (Altiora side) | ✅ DONE | Service user `chatservice@flowdesk.local`, `dbo.UserPasswords` seeded, API-Key. `HelpdeskExecute` still NOT granted (only needed for genuine on-behalf). |
| **I-1** | AltioraClient | ✅ DONE + live-verified | `services/altiora-client.js` + `acting-user.context.js`. Dual-gate auth, pluggable tokenProvider (hybrid: end-user in-turn / service acct for jobs), typed errors, GET-only retry. 21/21 tests. |
| **I-2** | **Catalog sync → Qdrant** | ✅ **DONE (additive)** | `services/altiora-catalog-sync.js` + `scripts/sync-altiora-catalog.js` + 7 tests. **79 real services synced** (EO-HR 75 / EO-FIN 4); point id = catalog GUID (idempotent); payload carries **`service_guid`** (I-3 needs it) + `source:'altiora'`. **Purge deliberately NOT run** — see below. |
| **I-3** | ServiceDistribution detect + `controls[]` turn-contract | ◑ **detect DONE / wired** | `detectProviders` now consumed by `materialize-altiora-service.js` (GUID → ousId, live). **`controls[]` still not started.** |
| **I-4** | Schema materializer (Altiora `SchemaJson` → schema-graph, keyed on OUServiceId) | ✅ **DONE (I-4a+I-4b), live E2E** | `services/altiora-schema-materializer.js` (golden = live ousId-59 form) + `scripts/materialize-altiora-service.js`. Chat asks **real Altiora questions/options**. Contract fix: serviceId pattern widened (rejected 75/79 real codes). **I-4b LOV baking DONE** — dictionary-backed `select` → `/FormLookup/values` → baked `presentOptions`; live E2E: `EO-HR-PM-CMP` Duty Station → chat asks "What is your duty station?" with choices `["New York"]`. |
| **I-5** | SignalR `ServiceFormChanged` sync | ✅ **DONE (consolidated + live)** | Enhanced the PRE-EXISTING `services/altiora-schema-sync.js` (IP-1e) — I'd started a duplicate before finding it; folded the ratified refinements in + deleted the dupes. Lazy `registry.markStale` (non-destructive) not delete; `changedParts` structural filter (structure/required/rules/schema only); SignalR now uses the **service-account** token (was empty acting-token) + WS/skipNegotiation. Live: hub connects, event→markStale→checkFreshness 'stale', poll checks cached. Gated on `FLOWDESK_SCHEMA_PROVIDER=altiora` (orchestrator mode) — DORMANT in current graph mode. |
| **I-6** | Directory real + typeahead endpoint | ✅ **DONE** | `directory/providers/altiora.provider.js` (users/search, dutystations, org-unit approver) live-verified. **Typeahead endpoint `GET /flowdesk/directory/:type?q=&limit=` DONE** — `directory-typeahead.js` + controller/route; type∈{user,location}(+aliases)→facade resolveUser/searchLocations→normalized `{value,label,sublabel,meta}`; 400 bad-type, 503 DirectoryUnavailable, empty on <2 chars. 11 tests. Live: mock (default) + altiora (10 real users, real duty station). Provider still `mock` by default in `.env`. |
| **I-7** | Submit → `POST /api/tickets` | ✅ **DONE — full chat E2E → real OUS-backed ticket, verified** | `services/altiora-ticket.service.js` (10 tests) + hook in `draft-sr.service.js submit()` (gate `FLOWDESK_SUBMIT_TARGET=altiora`, ENABLED). `FormDataJson` keyed by Altiora field ids via `fieldIdMapping`. **Full chat flow → TKT-2026-000075 (OUS 59), direct client → TKT-2026-000074; 201 in ~12s.** Two Altiora-side blockers fixed (see below), both **UNCOMMITTED**. |
| **I-8** | E2E | ✅ **DONE** | `scripts/i8-e2e.js` + `docs/i8-report.json` + `docs/I8_E2E_SUMMARY.md`. **Pass 1 (graph): broad sweep 76/76 materialize+bake, 0 errors, 79/79 resolve; deep E2E 3 tiers → real tickets TKT-2026-000077/078/079 (SIMPLE/MEDIUM-cond/MEDIUM-LOV).** Pass 2 (altiora on-demand) verified in an ISOLATED process (live API not flipped — user's call): loadSnapshot materializes+bakes on demand (15 slots, LOV baked, context injected); SignalR connect live-verified in I-5. |

---

## ▶ Current state (2026-07-16)

**I-2 ✅ · I-3 detect ✅ (wired) · I-4a/I-4b ✅ live E2E.** The full chain runs on real data:
`code → GUID (I-2) → detect → ousId (I-3) → getSchema → materialize (I-4a) → Memgraph → compiler → interpreter`.
Live: *"I need to initiate the separation process"* → **EO-HR-SA-SS-ISP** → real Altiora questions → real options `["Yes - please list below","No"]`.

**Next (Ivan-ratified order):** ~~I-4b LOV~~ ✅ → ~~typeahead~~ ✅ → ~~I-5 SignalR~~ ✅ → ~~`controls[]`~~ ✅ → **I-8** broader E2E. Approver-path **deferred** (Ivan).

### ✅ controls[] turn-contract DONE + live (2026-07-16)
Generalized the F9.1 resolveChoices/confirm-or-choose into the typed `controls[]` contract, **dual-emitted** alongside legacy `resolveChoices`/`choices` (deprecation window v2.1→v2.2 per Architect). Scope: confirm/choice/autocomplete + children/showChildrenOn (type:'text' deferred — free-text still via `message`). New: `contracts/controls.schema.json` (control + controlAction defs, ajv-validated), `interpreter/controls.js` (pure builders `buildConfirmControl`/`buildChoiceControl` + `directoryOf`/`toOption`). Engine: `confirmOrChoose` emits a `confirm` control (+ `autocomplete` child on `_search` for directory slots, source = the I-6 typeahead endpoint); enum question emits a `choice` control; new `handleControlAction` delegates to `handleChoice` (submit→select); `runTurn`/`_runTurnBody` accept `controlAction` (precedence over `choice`, same deterministic bypass). Controller extracts `controlAction`; `chat-v2.processMessage` passes it + emits `controls` in the response. **Tests:** `controls.test.js` (10 — builder structure + ajv contract + engine dual-emit + controlAction confirm/submit + backward-compat choice); full flowdesk 575 green (`--maxWorkers=2` avoids the OOM-worker flake). **LIVE (HTTP):** separation flow enum question emits `controls:[{type:'choice',...Yes/No}]` alongside `choices`; free-text slot → `controls:null`; a `controlAction{action:select,value:'No'}` reply fills the slot and advances to review. Contract-only — no frontend consumer yet (UI wiring is a later task).

### ✅ I-5 SignalR sync DONE + live (2026-07-16) — CONSOLIDATED into existing service
**Course-correction:** I began a duplicate (`schema-sync.service.js` + `altiora-signalr.service.js` + `schema-sync.startup.js`) before discovering the pre-existing `services/altiora-schema-sync.js` (IP-1e, already wired into `index.js` gated on `FLOWDESK_SCHEMA_PROVIDER=altiora`, already SignalR+poll+degradation+tested). Deleted my dupes; folded the three ratified refinements into the existing service:
1. **Lazy invalidation** — `registry.markStale(ousId)` (NEW, sets `needsRefresh=true`, non-destructive) instead of `registry.invalidate` (delete). `checkFreshness` now returns 'stale' when the flag is set; `storeSchema` clears it on rewrite. The stale form keeps serving until the next `loadSnapshot` re-materializes (survives a failed re-materialize / event burst).
2. **`changedParts` structural filter** — only structure/required/rules/schema invalidate; availability/manager-only/tips ignored.
3. **SignalR service-account auth** — `defaultConnectSignalR` now uses `createServiceTokenProvider()` + WS transport + skipNegotiation (rides `?access_token=`, AllowsQueryToken). The prior binding used `getActingToken()` = empty off-request, so the `[Authorize]` hub could never authenticate — it was broken.
**Live-verified:** SignalR connects to real Altiora hub with the service token (`signalr_connected`, `signalrConnected()=true`); structural event → `mark_stale flagged:true` → `checkFreshness='stale'`; `pollOnce` checks 2 cached, 0 drifted. **Tests:** existing `altiora-schema-sync.test.js` updated (14, markStale/changedParts/`stale` field); registry `markStale`+`checkFreshness` covered. `@microsoft/signalr` v10 added (Node has global WebSocket).
**Also:** `materialize-altiora-service.js` now stores via `registry.storeSchema` (not bare `seedService`) — runs contract+lint gates AND tags `namespace='Altiora'` so the I-5 poll's `listCached` sees script-materialized forms, consistent with the orchestrator path. **DEV NOTE:** because they're now namespace-tagged, running the flowdesk test suite (which calls `registry.invalidateAll()` in `altiora-schema-registry.test.js` teardown) WIPES the real dev-materialized forms → re-materialize after a test run. Only that test calls invalidateAll; no production caller.
**STATUS:** I-5 is DORMANT in the current config — `FLOWDESK_SCHEMA_PROVIDER` is unset ⇒ chat runs in **graph mode** (serves script-materialized forms via `compile`, no on-demand materialization, so no cache to invalidate). I-5 only becomes ACTIVE when `FLOWDESK_SCHEMA_PROVIDER=altiora` (orchestrator/on-demand mode). Flipping that is an open config decision (raised with Architect).

### ✅ I-6 typeahead endpoint DONE + live (2026-07-16)
`GET /api/v1/flowdesk/directory/:type?q=&limit=` — the autocomplete source `controls[]` will consume. Logic in `services/directory/directory-typeahead.js` (provider-agnostic: takes the directory facade, never the singleton). `:type` ∈ {user, location} + aliases (beneficiary/requester/person → user; dutystation(s)/duty-station → location) → facade `resolveUser`/`searchLocations` → ONE normalized item `{value, label, sublabel?, meta?}`. Guards: unknown type → 400 (`UnknownDirectoryTypeError`), `DirectoryUnavailableError` → 503 (+empty results, graceful), query < 2 chars → empty list (no backend hit), limit clamped [1,50] default 10. Thin controller handler `directoryTypeahead` + route (mounted before generic `/:sessionId` routes). Runs under the active provider — mock by default, altiora when flagged. **Tests:** `directory-typeahead.test.js` (11, against the real mock + fakes for limit/unavailable). **Live:** HTTP smoke on mock (user→U001 Ivan Petrov, location→GVA Geneva, short→0, bad→400) + direct altiora-provider call mapped **10 real Altiora users** (GUID/name/email/dept/location) + real duty station. NOTE `.env` still `FLOWDESK_DIRECTORY_PROVIDER=mock` — flip to `altiora` for real data through the HTTP endpoint.
Only **2 of 79** services materialized (EO-HR-SA-SS-ISP, EO-HR-PM-CMP; `--all` exists; seeding is many Bolt round-trips ⇒ slow).

### ✅ I-4b LOV baking DONE + live E2E (2026-07-16)
Dictionary-backed fields (Altiora dynamic `select`/`lookup` with `dictionaryEntityId`, empty `options`) now resolve to real choices. **Design (keeps materializer pure):** `materializeSchema` captures a durable `slot.lov = {entityId, displayFieldIds, valueFieldId, filters}` and holds the slot as `type:'string'` (contract-valid, no choiceless enum); a separate async `bakeLov(snapshot,{fetchLovValues})` (`services/altiora-lov.service.js`) calls `POST /api/FormLookup/values`, and on ≥1 row **upgrades** the slot to `type:'enum'` + `presentOptions` + `lovBakedAt`. Empty/failed lookup ⇒ slot stays valid free-text (never blocks the whole form; self-heals on re-materialize). Wired into BOTH paths: `scripts/materialize-altiora-service.js` and `schema-orchestrator.loadSnapshot` (before `storeSchema`). Contract: added `lov` + `lovBakedAt` slot props. Client: `altiora-schema-client.getLovValues()`. **Tests:** materializer LOV capture + `altiora-lov.service.test.js` (baking/empty/fail/cap/dedup/contract-valid) — 71 targeted green, full flowdesk 552 green (1 OOM-worker flake, passes isolated). **Dev catalog reality:** 4/79 services have LOV, 10 fields, 3 entities, no filters/multi-display; dicts tiny (duty stations = 1: "New York"). **Live E2E:** materialize `EO-HR-PM-CMP` → `slots=12 lov=1✓`; compile round-trip → `dutyStation.type=enum, presentOptions=[{New York}]`; chat "create or maintain a position" → asks "What is your duty station?" **choices `["New York"]`** → real ticket TKT-2026-000076.
**Limitation (acceptable):** the schema-graph seed/compiler persists `presentOptions` (→ EnumOption) but NOT `lov`/`lovBakedAt` — they're transient, regenerated on each re-materialize. Fine for the ratified I-5 (SignalR re-materializes fully); only a pure-TTL re-bake (not built) would want them persisted. Large-dictionary typeahead (`lov.typeahead`) is a stub for the next task (I-6 typeahead), not yet consumed.

### ✅ I-7 unblocked — two Altiora-side fixes (UNCOMMITTED in `D:\UN\Repos\FlowDesk\FlowDesk`)
The OUS-backed submit 500 + hang were **both Altiora-side**, fixed in Altiora source (Ivan authorized each):
1. **`Repositories/TicketRepository.cs` (`CreateAsync`)** — `FK_Tasks_OrgUnit`: task's `OrgUnit` came from `ticket.AssignedToOrgUnitId ?? 0`, and `0` is an invalid FK. Now defaults `AssignedToOrgUnitId` to the provider org (`ous.OrgUnitId`, else requester's) when unset. Result: tasks land on org 21, 0 FK errors.
2. **`Services/EmailService.cs` (`SendEmailAsync`)** — notifications are sent **inline** during ticket creation via `IEmailService`; with no reachable SMTP in dev, `SmtpClient` blocked the caller for its 100 s timeout ⇒ submit hung >40 s. Added a **Dev mock SMTP** short-circuit (`_env.IsDevelopment()` → log + return true) and reduced the real `SmtpClient.Timeout` to 10 s as defence-in-depth.

**Verified 2026-07-16:** direct client `POST /api/tickets` (OUS 59) → **201 in 12.5s, TKT-2026-000074, AssignedOrg 21**; full chat flow *"initiate the separation process"* → materialize → dialogue → submit → **TKT-2026-000075**. No hang, no FK error.
**⚠ Two Altiora edits are uncommitted** — Integration Architect suggested `feat(proxy): Add UNPA chat integration layer`. Awaiting Ivan before committing in the Altiora repo.

### ✅ Resolved — rule-revealed fields (Ivan-ratified: option (b) "= requiredWhen")
`requiredWhen` is now honored at runtime. New single predicate `reducer.isRequiredNow(slot, ctx)` = *visible* AND (*unconditionally required* OR *requiredWhen holds*), used by BOTH the engine (`activeRequiredSlots`) and submit (`validateForSubmit`) so they can't drift. Materializer `show_field` → `trefCondition = requiredWhen = show-expr`, `required=false`. **Live: "Yes…" → asks the follow-up; "No" → review.** Tests: `contracts/__tests__/required-when.test.js` (9). 469 flowdesk tests green.
Files touched (all ALTINT2-owned): `contracts/draft-sr.reducer.js`, `interpreter/interpreter-engine.js`, `services/altiora-schema-materializer.js`.

### ✅ Stale catalog PURGED (2026-07-16, Ivan-authorized)
`node -r dotenv/config scripts/sync-altiora-catalog.js --purge-stale` (run from `api/`). **1728 stale (non-`altiora`) points deleted; 79 real re-synced (EO-HR 75, EO-FIN 4). Collection now 79 total, 0 stale.** Verified: resolution NOT broken — "initiate separation process" → `EO-HR-SA-SS-ISP` full E2E; "I got divorced" → correctly resolves `EO-HR-SP-PD-RD` (form not materialized yet — only 1/79 materialized, expected). "record my marriage" now hits the off-topic guard/clarify (was a *confident false positive* `FAC-ROOM` 0.894 pre-purge) — honest miss, not a regression; real fix = **I-2b utterance generation** (near-tied HR candidates ~0.87–0.88, gap < 0.10 ⇒ 'low' confidence) + refresh the stale deflection copy (still names fictional "IT/facilities/security" domains). F-track demo flows (laptop/badge/VPN/room/parking) intentionally no longer resolve.

### Follow-up found while verifying (candidate **I-2b**)
Formal catalog prose embeds **worse** than conversational utterances for casual queries (that's why a fictional utterance-based point beat a real description-based one). Generating utterance variants per real service (`services/generate-utterances.js` exists) would lift recall. Not started.

**Superseded — do not extend:** `scripts/register-flowdesk-service-utterances.js` (hand-authored fictional utterances); do not add more invented fixtures.

---

## Post-plan tracks (Ivan: all except commit)

### ✅ UX-001 deflection copy DONE (2026-07-16)
Removed fictional "IT/hardware/facilities/security" from all user-facing copy → real EO-HR/EO-FIN domains. Updated: `interpreter-engine.js` OUT_OF_SCOPE deflection + ROUTER LLM prompt (system role + INFO_QUESTION/OUT_OF_SCOPE domain lists + examples now real: "record my marriage"/"initiate separation"/"advance home leave"); `templates/ui-strings.js` `capabilities` in ALL 6 languages (en/ru/fr/es/ar/zh); legacy `executors/dialog/open-query.js` browse-by-category. Tests unaffected (they assert `route==='OUT_OF_SCOPE'`, not text) — interpreter 20/20 green. Live: deflect now "HR and Finance service requests — separation, position…, dependency…, home leave…, recruitment, payroll and grants."

### ✅ I-2b utterance generation DONE (2026-07-16)
`scripts/generate-altiora-utterances.js` — reads the 79 real altiora catalog points from Qdrant, generates 6 diverse-angle first-person utterances/service via the FlowDesk LLM (structuredOutput, temp 0.3), embeds each (TEI) + upserts with deterministic UUID ids (`hash(code:utterance:idx)`) + payload `type:'utterance'` (idempotent). **474 utterance points (79×6)**, collection now 79 formal + 474 = 553. Flags: `--dry-run`, `--only <code>`, `--distinct` (opt-in sibling negative-prompting). **RESULT: recall MASSIVELY improved — broad casual test 10/10 resolve (0 deflections), scores 0.88–0.94; "I need to record my marriage" now RESOLVES (was the off-topic deflect).** **Precision caveat (honest):** within tight sibling clusters (marriage/divorce/legal-separation/dependent-spouse; name-change/nationality; recruitment/extension) the top pick is exact ~5/10 — the TEI embedding model conflates semantically-adjacent HR events, so the correct service is usually a near-tie ALTERNATIVE not the top. Tried `--distinct` negative-prompting on the marital cluster → OVER-corrected (all collapsed to one sibling), reverted to plain. **The clean fix is UI disambiguation over the top-N alternatives (the controls[] `choice` control now enables this), NOT more utterances** — flagged to Architect. 1 gen error auto-retried (LLM returned <6). NOTE the LLM resolved to anthropic-api (not claude-code) via env.

### ⏸ PAUSED 2026-07-17 08:10 → RESUME 11:10 (Ivan's instruction; one-shot cron `d3090bd4`, session-only)
**On resume, do IN ORDER:**
1. **Materialize the FULL service catalog** (Ivan's explicit ask): `node -r dotenv/config scripts/materialize-altiora-service.js --all` from `api/` (persists all ~76 real forms into Memgraph for graph-mode). Do it AFTER any test run (the registry test's `invalidateAll` wipes namespace='Altiora' forms).
2. **I-2c** low-confidence disambiguation (Architect-briefed): on `classifyUserIntent` confidence='low' (top≥0.55, gap<0.10, multi-candidate) → emit a controls[] `choice` control over top-3 alternatives instead of auto-picking the wrong sibling (fixes the I-2b marriage/divorce/name precision gap). Dual-emit legacy `choices`. Tests + live verify. Report to Architect.
3. **FE-001** frontend controls[] wiring (mcp/ React) — recon first, report before building.
4. **Prod-prep** `api/docs/PRODUCTION_DEPLOY_CHECKLIST.md` (NO commit, NO live flip).

### ✅ I-2c disambiguation DONE + live (2026-07-17)
Fixes the I-2b sibling-precision gap via UX, not more vectors. `interpreter-engine.js`: `shouldDisambiguate(serviceHits)` — resolvable (top≥0.55) but NOT confident (not medium/high per semantic-search bands) with ≥2 candidates → emit `buildDisambiguation` = a controls[] `choice` control (slotId `__service__`) over the top-3, + legacy `choices`, responseType `disambiguation`, route `DISAMBIGUATE`; no draft created (no guess). Reply handled early in `_runTurnBody`: `controlAction.slotId==='__service__'` → `loadSnapshot(value)` → `draftService.create` → fillLoop. Tests `i2c-disambiguation.test.js` (6). Interpreter suite 116/116. **LIVE:** "record my marriage" → offers [Record Divorce, Record Dependent Spouse, **Record Marriage**]; pick RMCU → starts EO-HR-SP-PD-RMCU (asks subjectTile). Correct service always in the offered set.

### ✅ FULL CATALOG MATERIALIZED (2026-07-17, Ivan's instruction)
`materialize-altiora-service.js --all` → **76 materialized · 3 skipped** (no form). All real forms in Memgraph (graph mode). **Fixed a bug:** `catalogEntries` scrolled `source:'altiora'` which now includes the I-2b utterance points → first `--all` re-materialized each service 6× and truncated at the 300 scroll-limit ("287 materialized"). Added `must_not:[{type:'utterance'}]` → clean 76. **DEV NOTE unchanged:** running the flowdesk test suite (registry test's `invalidateAll`) wipes these — re-run `--all` after tests.

### ✅ FE-001 frontend controls[] wiring DONE (mcp/ dev source, 2026-07-17)
Wired the `controls[]` turn-contract into `mcp/src/features/flowdesk-chat-v2/` (React+Zustand+Vite). NEW `components/ControlRenderer.jsx` (switch on control.type: confirm/choice/autocomplete + composite `children`/`showChildrenOn` reveal; emits `sendControlAction`) + `components/AutocompleteControl.jsx` (300ms-debounced typeahead → `GET {API_BASE}/flowdesk/directory/:type?q=&limit=8`, minChars gate, pick → resolver-shaped value). `api/chat-client.js`: `controlAction` added to sendMessage opts + POST body (precedence over choice/message). `store/chat-store.js`: new `sendControlAction` action + `assistantMeta()` helper storing `controls` in message metadata (all 3 send paths). `components/MessageBubble.jsx`: renders `<ControlRenderer>` when `metadata.controls` present, ELSE falls back to `<ChoiceButtons resolveChoices>` (deprecation window). Renders the I-2c disambiguation (a plain choice control) for free. **Tests:** `ControlRenderer.test.jsx` (5: choice/disambiguation/confirm+search-reveal/autocomplete-debounce-fetch-pick/empty) + chat-client controlAction body; full feature suite **23/23 green** (vitest). Contract verified on both ends: backend emits/accepts (live), frontend renders/emits (unit). Browser smoke = the only non-automatable bit.
**OUTSTANDING:** the PRODUCTION render surface is the `@flowdesk/chat-v2` package at `FlowDesk/…/Frontend/Components/flowdesk-chat-v2` (embedded in Altiora Portal via AltioraChat), a DIVERGED copy (shadcn tokens/i18n) in the separate FlowDesk repo. Same 5-file change needs porting there. Flagged to Architect.

### ✅ PROD-PREP DONE (2026-07-17)
`api/docs/PRODUCTION_DEPLOY_CHECKLIST.md` — prereqs · env/flags table · DB/identity (service user, API_Clients, HelpdeskExecute for on-behalf) · startup sequence (sync → utterances → materialize --all → API → schema-sync) · provider-flip runbook (graph→altiora + rollback, marked owner-decision) · smoke tests (resolve/disambiguation/form/typeahead/submit/dual-emit) · monitoring · follow-ups. NO commit step, NO live-flip instruction (Ivan's calls).

### ✅ ENTIRE Ivan-approved post-plan queue COMPLETE: UX-001 · I-2b · I-2c · full-catalog materialize · FE-001(mcp) · prod-prep.
**Follow-ups (not blockers):** FE-002 (port controls[] to `@flowdesk/chat-v2` production package — diverged repo) · browser smoke · APPROVER-001 (needs a dev approvalRequired service) · **Ivan decisions: commit the 3 Altiora .NET edits; flip to altiora mode when scaling.**

## ✅ CHAT-AGENT 5-PART FEATURE DONE + live (2026-07-17, Ivan-requested)
1. **User-profile props** — `FlowDeskChatV2({userProfile})` → store `setUser` → `userContext` in every POST; controller `actingUser = req.flowdeskUser || req.body.userContext || null` (proxy trusted, body fallback, no token-escalation).
2. **Personalized greeting** — i18n `greeting {{name}}` ×6 langs; store `seedGreeting()` by FIRST name (firstName→displayName-first-token) in the selected language.
3. **MY_REQUESTS** — `sr.list` tool → `ticket-list.backend` → `GET /api/tickets` (acting-user scoped; filters status/date/service via a structured LLM extract). Response = markdown + `tickets[]` + `responseType:'ticket_list'`. LIVE: "show my requests" → 10 tickets. **Dev caveat:** without a forwarded bearer it lists the SERVICE-account tickets; production proxy scopes to the real user.
4. **CATALOG_BROWSE** — `catalog.browse` tool → `catalog-browse.backend` → `GET /servicecatalog/root|{id}/children`. Emits a controls[] `choice` (slotId `__catalog_browse__`); drill-down via controlAction (category GUID → children; `svc:CODE` leaf → starts that service; `__root__` → back). Stateless (picked id = cursor). LIVE: root "OneEO" → [Finance and Budget, Human Resources, ←Back].
5. **FIELD_HELP** — matches a slot by label (fallback = active required slot) + `kb.search` (namespace Altiora) → LLM explains. LIVE: "what does the subject field mean?" → practical explanation.
**Engine:** router enum+prompt gained MY_REQUESTS/CATALOG_BROWSE/FIELD_HELP; handlers in `interpreter-engine.js`; `tools()` injectable (`deps.tools`). **Tests:** `chat-agent-backends.test.js` (9) + `chat-agent-intents.test.js` (6) + frontend `profile-greeting.test.js` (6); interpreter 122/122, frontend feature 29/29. **Follow-up:** ticket-list wrapper text is English (i18n enhancement); FlowDesk `@flowdesk/chat-v2` package port (with FE-002).

## ✅ Chat-agent add-ons + no-mocks (2026-07-17, Ivan)
- **Participant captions** (Req A): `MessageBubble.jsx` shows a sender label per message — agent = "Altiora" (`agentName`), user = localized "me" (`senderMe`: en Me / ru Я / fr Moi / es Yo / ar أنا / zh 我) via i18n. `.fdv2-sender` CSS. Tests `MessageBubble.senders.test.jsx` (3).
- **Respond in the selected language** (Req B): `langInstruction(lang)` now appended to the free-text LLM prompts (`infoAnswer`, `handleFieldHelp`); `runQuestionPlanner` already localized. All code-built agent phrases moved to `uiStrings(lang).agent.*` (outOfScope, disambiguate/pickService, tickets header/none/error, catalog root/category/pick/back/empty/error) in ALL 6 langs — used by OUT_OF_SCOPE, `buildDisambiguation`, `handleMyRequests`, `handleCatalogBrowse`. Tests: interpreter 125/125 (incl. ru/fr language asserts). LIVE: ru message → "Вот категории услуг…", "Ваши заявки:".
- **NO MOCKS in the chat** (Ivan directive): `.env FLOWDESK_DIRECTORY_PROVIDER=mock → altiora` (real Altiora users/locations/approvers). LLM already real (`anthropic-api` haiku-4-5); resolve-search wires the real Altiora tools (its "stub" import is only the ranking ALGORITHM); tools/submit/KB all real. `directory/index.js` DEFAULT_PROVIDER pins **mock only under NODE_ENV=test** so unit tests stay deterministic; runtime uses altiora. LIVE: typeahead → real users (Aldan Serikbay…), "мои заявки" → 10 real tickets. **Dev note:** altiora directory needs a real user identity — production proxy injects it; dev must send `userContext` (frontend does; test scripts must too), else getCurrentUser degrades gracefully (ADCC-085).

## ✅ AltioraChat package parity + Portal restart (2026-07-17, Ivan)
The whole session's chat work existed only in the mcp SOURCE (`FlowDeskChatV2`); Ivan required it in the installable `AltioraChat` (`@flowdesk/chat-v2`) too, kept in sync.
- **Ported to `FlowDesk/…/Components/flowdesk-chat-v2`:** NEW `ControlRenderer.jsx` + `AutocompleteControl.jsx` (adapted to the package's runtime-config transport: `apiUrl`/`getFetch`/`buildHeaders`); `chat-client.js` `controlAction`+`userContext` in POST; `chat-store.js` `assistantMeta`(+controls/tickets/breadcrumb) + `sendControlAction` + `user`/`setUser`/`seedGreeting` + userContext threading + reset re-greet; `MessageBubble.jsx` ControlRenderer render + `.fdv2-sender` caption; `i18n/resources.js` greeting/senderMe/agentName ×6; `styles/chat-v2.css` `.fdv2-sender`; `AltioraChat.jsx` new `userProfile` prop → setUser effect; `index.d.ts` types (userProfile, sendControlAction, setUser).
- **Build/version rule honored:** bumped `package.json` 1.0.3→**1.0.4**, `npm run build` (318 modules), verified ported symbols in dist.
- **Installed into BOTH consumers:** mcp (`npm i @flowdesk/chat-v2 --install-links` → v1.0.4) AND the Altiora Portal workspace `Frontend/Clients` (workspace install cached the old copy → refreshed `node_modules/@flowdesk/chat-v2/{dist,package.json}` directly to v1.0.4).
- **Portal frontend RESTARTED (Ivan asked):** stopped the running Vite (PID 25184, :3001), cleared `.vite` optimizer cache, `npm run dev -w FlowDeskPortal` → Vite v7.3.1 on https://localhost:3001; verified the re-optimized `@flowdesk_chat-v2.js` dep bundle contains agentName/sendControlAction/seedGreeting/ControlRenderer.
- **Portal integration note:** `shared/features/src/ChatInterface.tsx` passes `userId` + a rich `emptyState` hero (already greets by firstName) — identity comes from the proxy, greeting from the hero, so the v1.0.4 upgrade delivers controls[]/captions/respond-in-language/agent-intents WITHOUT disturbing the hero. `userProfile` is available for standalone hosts (mcp `AltChatDemoPage` now passes it).
- **SYNC PARITY:** `mcp/src/features/flowdesk-chat-v2/SYNC.md` documents the source↔package mapping, the 3 divergences (entry/transport/voice), and the rule: change source first → port to package (adapt transport) → BUMP VERSION → build → reinstall in mcp + Portal. Package at last sync: **1.0.4**.

## Standing environment notes

- API restart after any `api/` change: `node --use-system-ca api/index.js` (port **3010**, plain node).
- Memgraph scripts need env: `node -r dotenv/config …` (jest loads it via `setupFiles: ['dotenv/config']`).
- Run Altiora dev: from `Backend/FlowDesk.API` → `dotnet run --no-build -c Debug --no-launch-profile --urls http://localhost:5000` (`ASPNETCORE_ENVIRONMENT=Development`). **`--no-launch-profile` matters** — without it it hangs and never binds.
- Never log the forwarded user token.

---

*Registered by **ALTINT2** (sole owner). Supersedes `SESSION_TASKS_ALTINT1.md`.*
