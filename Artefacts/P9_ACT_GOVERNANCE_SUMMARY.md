# Phase 9 — ACT Governance (chat-initiated actions on Altiora)

**Status:** Submit + Approve + Reject shipped. Cancel deferred (no safe Altiora endpoint — see P9-000 recon §1).
**Principle:** the chat may *attempt* a side-effecting write only when the acting user is ACT-enabled AND a live acting token is present; Altiora still enforces its own permissions at the write. Every attempt is audited.

## Authorization model (fail-closed)

`services/act-authorization.js` — `checkAct(user, actingToken)`:
- **Allowlist**: `FLOWDESK_ACT_USERS` (comma-separated userIds/emails, lowercased) UNION admin-managed persistent grants (`act-permissions.service`). **Fails closed** — empty ⇒ nobody may ACT.
- **Acting token required**: the proxy-forwarded end-user bearer. The service-account fallback (`altiora-client` `getActingToken() || serviceTokenProvider()`) is treated as *denial* for any user-initiated ACT.
- Returns `{ok:true}` or `{ok:false, code:'NO_ACTING_USER'|'NOT_ENABLED'}`.

## Supported actions

| Action | Altiora endpoint | Gate | Node wiring |
|---|---|---|---|
| **Submit** (raise SR) | `POST /api/tickets` | `checkAct` + `FLOWDESK_SUBMIT_TARGET==='altiora'` (opt-in; default local materialization is ungated) | `draft-sr.service.submit` → `altiora-ticket.service.createTicket` |
| **Approve** | `POST /api/authorizations/{id}/decision` `{Status:'Approved'}` | `checkAct` (ALWAYS) | `altiora-approval.service.submitDecision` |
| **Reject** | `POST /api/authorizations/{id}/decision` `{Status:'Denied', Justification}` (justification mandatory) | `checkAct` (ALWAYS) | same |
| **Cancel** | — (no safe endpoint; the only status setter is ungated + int-keyed) | — | deferred to 9.1 |

Approval target resolution: `GET /api/authorizations/pending` (acting-user scoped) → match the spoken/typed request number to its integer `authorizationId` (`findByTicket`; exact then unique-suffix, ambiguous→queue pick).

## Deterministic confirm gate (never LLM-classified)

Governance confirmations are resolved by the multilingual affirm/negate matchers BEFORE the LLM router:
- **Submit**: `pendingAction:{type:'confirm_submit'}` on the DraftSR (`resolvePendingAction`).
- **Approve/Reject**: *draft-less* — the chat has no DraftSR for an approval — so the confirm state lives in a session-keyed engine map (`ACT_PENDING`) resolved by `resolveActPending` ahead of the draft-scoped handlers and the router. Reject collects a mandatory reason (inline "…because X" or a follow-up prompt) before confirming. Execution **re-gates** (the acting token may expire between turns).
- **Both** accept a typed/spoken yes/no OR a click on the `__act_confirm__` confirm control (text-UI parity, P9-010). An unclear reply clears the gate and routes normally (no trap).

## Router intents

`ACT_APPROVE`, `ACT_REJECT` (kept separate — cleaner classification than polarity inference, and reject has the reason branch). Alongside the read intents `MY_REQUESTS` / `QUERY_TASKS` / `QUERY_MAIL`.

## Audit (ChatActionLog)

`services/chat-action-log.service.js` `recordAction` → Memgraph `(:ChatSession)-[:HAS_ACTION_LOG]->(:ChatActionLog)` + JSONL. Best-effort (never breaks a turn). Every ACT attempt is logged with `actionType` (`SUBMIT_SR` / `APPROVE_ITEM` / `REJECT_ITEM`), `status` (`EXECUTED` / `DENIED`), `targetId`, `motivation` (BA-060), and confirmation flags. Denials (allowlist miss, `NOT_APPROVER` 403, `ALREADY_PROCESSED` 400, expired token) are logged as `DENIED` with the reason.

## Error UX

The client collapses 401/403 into `AltioraAuthError`; the approval service re-keys **403→`NOT_APPROVER`** and **400→`ALREADY_PROCESSED`** so the chat can say "you're not the approver" / "already decided" rather than "session expired". Messages localized in en/ru/fr/es/ar/zh (`templates/act-strings.js`); voice-first `speech` on every result.

## Voice / text parity

Approve/reject works over voice (spoken yes/no) and the text window; since the portal assistant's voice + text share ONE session, a decision started by voice can be confirmed in text and vice-versa.

## Tests

`services/__tests__/altiora-approval.service.test.js` (10) · `interpreter/__tests__/act-approve-reject.test.js` (13) · plus the P9-003/004/005 suites `act-governance` / `act-permissions` / `act-deterministic-confirm` / `altiora-ticket.service` (31). Full flowdesk interpreter+services suite green.

## Config

- `FLOWDESK_ACT_USERS` — ACT allowlist (fail-closed).
- `FLOWDESK_SUBMIT_TARGET=altiora` — opt-in real ticket submit (else local materialization).
- Approve/Reject need no extra flag (always gated by `checkAct` + acting token).

## Deferred

- **Cancel** — needs a proper gated .NET endpoint (current `PUT /api/tickets/{id}/status` is ungated + int-keyed).
- **Visual action-status styling** in the text UI (success/error message chrome) — voice speaks the outcome and text shows the outcome sentence today; richer styling would need a chat-v2 package change + rebuild.
