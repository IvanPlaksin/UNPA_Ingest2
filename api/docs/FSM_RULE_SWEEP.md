# FSM rule sweep — state machine vs agent interpreter

Every rule in `interpreter/interpreter-engine.js` that affects **correctness**, and
whether the agent interpreter (`agent-interpreter/`) honours it. Wording,
formatting and voice phrasing are out of scope.

Why this exists: four consecutive live-session bugs (fdv2-2161acf8, fdv2-039fd2b4,
fdv2-2815b706, fdv2-111bd67f) were all the same species — *a rule the state
machine has always enforced that the agent never inherited*. Finding them one
report at a time costs a round trip each. This is the catalogue.

Status: ✓ implemented · ⚠️ partial · ✗ missing · ⊘ not applicable

---

## A. Snapshot enrichment

| # | Rule | Location | Agent |
|---|------|----------|-------|
| A1 | Every form carries the request-level overlay: `beneficiary`, `location`, and for Altiora forms `author`, `description`, `sharedWith`, `manualApprover` (approval only) | `form-overlay.js::effectiveSnapshot` | ✓ shared module |
| A2 | The loader injects `beneficiary`, `location`, `author`, `approver` (approval only) into every Altiora snapshot; a form field of the same id wins (`RESERVED`) | `schema-orchestrator.js:53` | ✓ same loader |
| A3 | Identity fields lead the queue in canonical order: who → where → who is raising | `form-overlay.js` | ✓ fixed 2026-07-29 |
| A4 | `author` is never asked — always the signed-in user | `form-overlay.js` (normalised), `interpreter-engine:2195` (silent fill) | ✓ fixed 2026-07-29 |

| A5 | De-duplication is by CONCEPT, not slotId: the loader's `approver` and the overlay's `manualApprover` are one thing (the authoriser) under two names | `form-overlay.js` | ✓ fixed 2026-07-29 |
| A6 | The pre-form phase is transitional, never steady state: with a service found and no draft, the turn says to create it | `agent-tools.js::turnBrief` | ✓ agent-only rule, found while implementing D2 |
| A7 | **The catalogue is searched by CODE on every turn while there is no draft** — not when the model decides to look | `interpreter-engine:2589` (`route === 'NEW_INTENT' \|\| !draft` → `resolve.search`) · `agent-tools::prefetchCatalog` | ✓ fixed 2026-07-29 |
| A8 | Which service comes BEFORE who it is for: a `__service__` choice is asked alone | `interpreter-engine` (disambiguation precedes intake) | ✓ fixed 2026-07-29 |

**A7 is what fdv2-cd0ab081 cost.** "I need a Extension" → "appoiment" → "I need a
Extension of appoiment": three turns, `nodeTrace: []` on every one. The model
reasoned about what the English might mean and never consulted the catalogue,
which had three matching services all along. The state machine cannot fail this
way — the search is a step of the turn, not a decision.

**Open question on A5.** The duplication is gone, but the two definitions
disagreed on more than the name: the loader's `approver` is *required*, the
overlay's `manualApprover` is *optional* because "Altiora's form auto-resolves
it". Whichever is present now wins unchanged — deciding which semantics is right
is a domain call, not a code call, and is still open.

---

## B. Defaults and silent fills

| # | Rule | Location | Agent |
|---|------|----------|-------|
| B1 | Acting identity published per turn; every no-arg `getCurrentUser()` resolves the real user | `interpreter-engine:2285-2305` (AsyncLocalStorage) | ✓ via `runWithActingUser` |
| B2 | `author` filled silently from the current user on Altiora forms | `interpreter-engine:2190-2196` | ✓ at `draft_create` |
| B3 | Filing on behalf (beneficiary ≠ self) sets `author` silently, no confirm | `interpreter-engine:2177-2185` | ✓ subsumed by B2 |
| B4 | A directory slot is proposed with a resolved default, confirmed in one click | `confirmOrChoose` + `buildConfirmControl(defaultValue, allowSearch)` | ✓ |
| B5 | `location` defaults from the beneficiary's own profile | `interpreter-engine:2179` (comment), resolvers | ✓ `controlDefaultFor` |

---

## C. Order and dependencies

| # | Rule | Location | Agent |
|---|------|----------|-------|
| C1 | Hidden (`trefCondition`), `autoResolve`, and form-autofilled cascade slots are never asked | `form-policy.js::activeAskableSlots` | ✓ shared |
| C2 | Requiredness is live: `trefCondition` + `requiredWhen` | `form-policy.js::isRequiredNow` | ✓ shared |
| C3 | One question per turn, phase then form order, `dependsOn` defers | `form-policy.js::chooseNextSlot` | ✓ shared |
| C4 | `stale` / `pending` values return to the queue | `form-policy.js::isUnfilled` | ✓ shared |
| C5 | Optional fields are offered with a Skip; skipped ones never return | `advance` + `skippedSet` | ✓ |
| C6 | A large form is offered as a fork instead of 20+ questions | `buildLargeFormAsk`, threshold 14 | ✓ (held until the opening questions are done) |
| C7 | Carry-over: values volunteered for a not-yet-active slot are parked as hints and applied when it opens | `fillLoop` + `advance` (CARRY_APPLY) | ⚠️ the agent writes them immediately, including into hidden slots |

---

## D. Value validation — **the largest gap**

| # | Rule | Location | Agent |
|---|------|----------|-------|
| D1 | An enum value must be in `presentOptions`; a multi enum normalises scalar → array and validates every element; a number must be a number | `form-policy.js::validatePatches` (extracted) | ✓ fixed 2026-07-29 |
| D2 | **Reference-backed slots never take free text.** A mention for a slot with `resolverRef` / `dictRef` / unbaked `lov` is stored as a **hint** (`value: null`) and becomes a value only once it resolves against the directory or dictionary | `fillLoop:2125-2160`, `form-policy::isReferenceSlot` | ⚠️ **directory-backed done** 2026-07-29 — `draft_update` refuses them and the control is the only way in; `dictRef` / unbaked `lov` still accept text, because the agent has no cascade offer (G1) and a refusal without an alternative path is a dead end |
| D3 | A date arrives only through the picker, ISO-validated server-side; invalid → re-ask | `handleControlAction` (`date_select`) | ✗ |
| D4 | Free-input commits are coerced to the slot type and sanity-checked; the client is never trusted | `handleControlAction` (`text_input`/`number_input`/`toggle_input`) | ✗ |
| D5 | A multi-choice commit is validated against the option domain | `handleControlAction` (`multichoice_select`) | ⚠️ single choice only |

**Why D2 matters most.** `draft_update` accepts any string for any known slotId.
Live draft from fdv2-2815b706: `beneficiary: "Ivan Plaksin"` — a free string where
the state machine would hold a resolved directory record. The stored type of a
slot currently depends on *who filled it*: a control writes the directory object,
the model writes prose. Downstream (`form-handoff`, submit) expects the record.
This is the true form of what was logged as "N3 value-type inconsistency".

---

## E. Gates

| # | Rule | Location | Agent |
|---|------|----------|-------|
| E1 | No confirmation while any askable slot remains (`remaining.length === 0`) | `advance:2030` | ✓ guardrail 5 |
| E2 | Submit only after a confirm was shown AND accepted | `pa.type === 'confirm_submit'` | ✓ guardrail 2 |
| E3 | A required field cannot be skipped; offer provide / park / cancel (ADCC-097) | `handleControlAction` + `applyUniversalAction:1741` | ⚠️ refusal ✓, park/cancel do not exist |
| E4 | Escalation writes a node; the words cost a tool call | `draftService.escalate` | ✓ guardrail 3 |
| E5 | A service must come from a real search — no invented codes | `resolve.search` | ✓ guardrail 1 |

---

## F. Control handling

| # | Rule | Location | Agent |
|---|------|----------|-------|
| F1 | A control answer is applied **by code**, then the flow advances | `handleControlAction` → `handleChoice` | ✓ `recordControlAnswer` (2026-07-29) |
| F2 | The control type comes from the slot schema, never from the model | `controls.js` | ✓ |
| F3 | `__open_form__` open / stay handled deterministically | `handleControlAction` | ✓ |
| F4 | Review ✎ edit: reference-derived values cannot be edited directly; filled dependents are announced; the next turn is steered onto that slot | `handleControlAction` (`edit`) | ✗ |
| F5 | A typed "yes" confirms a pending directory value, exactly like the click | `fillLoop:2128` | ⚠️ only the submit gate reads affirmatives |

---

## G. Cascades

| # | Rule | Location | Agent |
|---|------|----------|-------|
| G1 | Dictionary cascade: resolve the cluster and offer it as ONE review before asking | `cascadeOffer:1444` | ✗ |
| G2 | `cascade_accept` re-resolves server-side; `cascade_edit` remembers the refusal (`declinedSet`) so it is not re-offered | `handleControlAction` | ✗ |
| G3 | Editing a filled slot with filled dependents warns first, then resets them | `detectCascadeEdit` + `confirm_cascade_edit` | ✗ |
| G4 | Changing a slot marks its dependants stale | `draft-sr.reducer::applyPatches` | ⚠️ works only for slots the *draft service's own* (un-overlaid) snapshot knows → not for overlay slots. Same in the FSM (R7, deferred) |

---

## H. Session states

| # | Rule | Location | Agent |
|---|------|----------|-------|
| H1 | `park` archives a draft and indexes it for resume; `unpark` restores | `draft-sr.service::park` | ✗ |
| H2 | `confirm_cancel` / `confirm_restart` gates | `resolvePendingAction:1782` | ✗ |
| H3 | `offer_resume` for an unfinished earlier draft | `resolvePendingAction:1875` | ✗ |
| H4 | `confirm_switch`: a new intent while a draft is open parks the current one | `resolvePendingAction:1842` | ✗ |
| H5 | `directory_unavailable`: retry or manual entry, never a dead end | `advance` | ✗ |
| H6 | `share_collect`: `sharedWith` is a multi-user turn of its own | `advance` | ✗ (agent asks it as one field) |
| H7 | Disambiguation is never offered twice with the same candidates (CODE-004) | `disambigSeenCount` | ⚠️ prompt-level only |

---

## I. Repair

| # | Rule | Location | Agent |
|---|------|----------|-------|
| I1 | Ladder `TARGETED_REASK → REFORMULATE → PRESENT_OPTIONS → OFFER_SKIP_OR_PARK → HUMAN_HANDOFF`, thresholds 1/2/3 per slot and 5 per session | `draft-sr.reducer:257-267` | ✗ **known gap** |
| I2 | A successful fill clears that slot's counter | `resetSlotRepair` | ✗ |
| I3 | The repair router never re-routes to a new intent mid-repair | `applyRepairDecision:1606` | ✗ |

---

## J. Grounding

| # | Rule | Location | Agent |
|---|------|----------|-------|
| J1 | Everything understood this turn is echoed BEFORE the question; mandatory when anything was extracted (ADCC-089) | `fillLoop` + `validateGrounding` | ⚠️ the turn tells the model what was stored, but nothing enforces the echo |
| J2 | The last question is stored verbatim so "repeat that" works | `setLastQuestion` | ✗ |

---

## Ranked backlog out of this sweep

1. ~~**D2 + D1**~~ — done 2026-07-29 for directory-backed slots. **Full D2 = this + G1.**
2. ~~**A5 (N2)**~~ — done 2026-07-29.
3. **D3/D4/D5** — coerce and validate control commits.
4. **I1–I3** — repair ladder (already queued).
5. **H1/H2 + E3** — park / cancel, which complete ADCC-097 (already queued).
6. **F4, G1–G3, H3–H6, J1–J2** — the remaining dialogue features.
