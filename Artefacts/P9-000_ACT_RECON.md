# P9-000 — AS-IS Reconnaissance: ACT Governance Integration Surface

**Scope:** submit / cancel / approve actions, identity+RBAC, audit patterns, confirm-gate, draft idempotency. Read-only; every claim cited to file:line.

## Integration Feasibility Assessment (headline)

| Action | Backend endpoint | Node client wiring | Gate | Verdict |
|--------|------------------|--------------------|------|---------|
| **Submit** | `POST /api/tickets` (TicketsController.cs:607) | ✅ `altiora-ticket.createTicket` (:133) | `FLOWDESK_SUBMIT_TARGET` + no-retry POST | **Ready** |
| **Approve/Reject** | `POST /api/authorizations/{id}/decision` (AuthorizationsController.cs:226) — gated by `CanUserApproveAsync` (403 if not approver), Justification mandatory on deny | ❌ none | strong (server-side per-item) | **NeedsEndpoint** (Node client + tool + authorization-Id) |
| **Cancel** | ❌ no dedicated cancel/withdraw; only ungated `PUT /api/tickets/{id}/status` (:1484, int id, no ownership check) | ❌ none | ⚠️ **none** | **Blocked/NeedsEndpoint** |
| **Approval queue** | `GET /api/authorizations/pending[/paged]` (AuthorizationsController.cs:58) — auto-scoped to acting user | ❌ none | n/a | **Available** (unwired) |

**Key implication:** Approve is the *best*-supported new action (proper backend gate + a queue endpoint to know if the user is an approver). **Cancel is the weakest** — there is no safe cancel endpoint; the only status setter is ungated and keyed by int ticketId (chat holds a ticket number). Recommend: either (a) define a proper gated `cancel` endpoint on the .NET side first, or (b) defer Cancel to 9.1 and ship Submit + Approve now.

## Section 1 — Altiora endpoints
- **Submit** end-to-end: `interpreter-engine.js:1107-1117` (CONFIRM_YES → draftService.submit) → `draft-sr.service.js:229-273` (gate `FLOWDESK_SUBMIT_TARGET==='altiora'` at :244-246) → `altiora-ticket.service.js:123-141` `POST /api/tickets` (:133, 60s). DTO `mapDraftToTicketDto` (:73-106): Title/Description/ServiceCode/OrganizationUnitServiceId/FormDataJson(+BeneficiaryId/RequesterId on-behalf). Response → `{srNumber, ticketId, status, altiora:true}` (:134-140). POST never retried (`altiora-client.js:198-214`, idempotent=GET/HEAD only).
- **Cancel**: no client method (only generic get/post/put/patch/del at `altiora-client.js:216-223`). .NET has only `PUT /api/tickets/{id}/status` (`TicketsController.cs:1484`, `StatusUpdateDto{Status,WorkOrderJson?,Comment?}`), which **only checks currentUser!=null (:1490)** — no ownership gate → unsafe to expose as-is; also int-id keyed (needs number→id resolve).
- **Approve/Reject**: `POST /api/authorizations/{id}/decision` (`AuthorizationsController.cs:226-403`), `AuthorizationDecisionDto{Status:"Approved"|"Denied", Justification}` (Justification mandatory on deny :243-246). Gate `CanUserApproveAsync(id,userId)` → 403 (:240). 400 if already processed. `id` = authorization record Id (int), not ticket number. No Node wiring.
- **Approval queue**: `GET /api/authorizations/pending` (:58, scoped to acting user), `/pending/paged` (:76, filters). No Node wiring.
- **Errors**: 401 Unauthorized / 403 Forbid; `altiora-client.js:89-94` collapses **both 401 and 403 into `AltioraAuthError`/`ALTIORA_AUTH`** — cannot distinguish "not the approver" from "bad token" from the thrown error alone; Forbid() returns empty body. Validation → `AltioraValidationError` with `{ErrorCode,Message,...}`.

## Section 2 — Identity / RBAC / ACT flag
- **Acting-user path confirmed**: `.NET InjectUserHeaders` (UnpaProxyController.cs:279-308, bearer at :307) → `flowdesk-user.middleware.js:32-57` (`token` :41, `runWithActingUser` :56) → `acting-user.context.js` AsyncLocalStorage (`getActingToken` :40-43) → `altiora-client.js:235-241` `getActingToken() || serviceTokenProvider()`.
- **RBAC state**: `roles: []` hardcoded `flowdesk-user.middleware.js:53`, never populated (proxy forwards no roles header). Only existing gate = `flowdesk-admin.middleware.js:23-46` (admin allowlist `FLOWDESK_ADMIN_USERS`/`FLOWDESK_ADMIN_TOKEN`) — coarse admin/not-admin, and **fails OPEN** when unconfigured (:28-34).
- **ACT flag recommendation: env allowlist `FLOWDESK_ACT_USERS`** modeled on the admin-middleware pattern (`.split(',').map(trim/lowercase)`, match `email`/`userId`), but **FAIL CLOSED** (default deny), combined with a hard requirement that `getActingToken()` be non-null. Other candidates rejected: no `:User` graph node exists (2.3b); the config store is type-keyed not user-keyed (2.3c); the proxy forwards no roles (2.3d, cross-repo change).
- **Service-account fallback** to hard-reject: `altiora-client.js:239` `getActingToken() || serviceTokenProvider()` (serviceTokenProvider logs in with `ALTIORA_SERVICE_EMAIL/PASSWORD`). ACT must require an acting token and treat the fallback as denial.

## Section 3 — Audit patterns (ActionLog model)
- Mirror `chat-telemetry.service.js`: dual persistence — Memgraph via `schema-graph/driver.write` (lazy-required `graphWrite` :44-48) + JSONL firehose `logs/chat/*.jsonl` (:50-58), best-effort (try/catch, never breaks a turn), env-gated (`FLOWDESK_CHAT_TELEMETRY` :37), `runAutocommit` for index DDL (:315-324).
- Schema shape from BackLog `action-log.service.js`: **action + motivation required** (BA-060, motivation min-5), `category` enum, monotonic `seq`, `HAS_*` edge to a parent — but it's coupled to `:BackLogItem` + core `memgraph.service`, so **mirror, don't reuse**.
- **Recommended: `:ChatActionLog` node** (distinct label from core `:ActionLogEntry`), namespace `FlowDesk`, `(:ChatSession)-[:HAS_ACTION_LOG]->(:ChatActionLog)`, fields: `id, sessionId, seq, ts, actionType, action, motivation, category, targetLabel, targetId, srNumber, ticketId, confirmationShown, confirmationAccepted, status, resultJson, error, userId, orgCode, agentId, metadataJson`. Write via flowdesk `schema-graph/driver.write` (injectable for tests).

## Section 4 — Confirm-gate (REUSE: Ready)
- `buildConfirmControl` (`controls.js:54-79`) emits `{type:'confirm', slotId, defaultValue, options}`; dual-emitted with resolveChoices in `confirmOrChoose` (engine :481-496). Frontend `ControlRenderer.jsx` renders confirm (Yes → `send('confirm')`), payload `{controlId, slotId, action, value}` (:33), round-trips via `sendControlAction` → POST `{controlAction}`.
- **Deterministic pending-action mechanism** (BEST for an ACT gate): `setPendingAction`/`resolvePendingAction` (reducer :301-308; engine `resolvePendingAction` :696-791, dispatched at :1052-1055 BEFORE the LLM router), multilingual `AFFIRM_RE`/`NEGATE_RE` (:542-545). An ACT confirm-gate should be a new `pendingAction.type` (deterministic yes/no, not LLM-classified).
- ⚠️ **GOTCHA**: the *submit* gate today (CONFIRM_YES) is NOT deterministic — it round-trips through the LLM router (engine :1107-1118; advance sets no pendingAction :814-824). For governance, the ACT confirm should be a deterministic pendingAction, and the submit gate itself is a candidate to harden.

## Section 5 — Draft lifecycle & idempotency (NEEDS GUARD)
- Statuses: `draft → {parked⇄draft} → submitted|escalated` (reducer). No `confirmed` status. `setStatus` refuses submitted/escalated (:222-224).
- **Idempotency INADEQUATE**: `submit()` (draft-sr.service.js:229-273) has **no** `status==='submitted'` short-circuit; `reducer.submit` mints a **fresh `srNumber` per call** (`makeRef`, :373). A repeated CONFIRM_YES (LLM re-classifies "yes" against the still-loaded submitted draft) → duplicate `(:ServiceRequest)` node (MERGE keys on the new number) or **duplicate Altiora ticket**. **A double-submit guard is a prerequisite** for any side-effecting ACT: early-return `{srNumber}` when `draft.status==='submitted' && draft.srNumber`.

## Consolidated recommendations for the Phase 9 spec
1. **Ship Submit + Approve; defer or spec-first Cancel** (no safe cancel endpoint today).
2. **ACT flag = `FLOWDESK_ACT_USERS` env allowlist, fail-closed + hard-require acting token** (new `flowdesk-act` guard modeled on admin middleware).
3. **ActionLog = `:ChatActionLog`** mirroring chat-telemetry (dual persistence, best-effort, injectable write).
4. **Confirm-gate = deterministic `pendingAction.type`** (not LLM router); explicit approve/reject summaries.
5. **Add a double-submit idempotency guard** before enabling side-effecting ACT.
6. **Approve wiring**: new Node client method + allowlisted tool for `POST /authorizations/{id}/decision` + `GET /authorizations/pending` so the chat only offers approve for items actually in the user's queue; carry the authorization Id (not ticket number).
7. **Error UX**: since the client collapses 401/403, add a per-status distinction if the chat must say "you're not the approver" vs "session expired".
