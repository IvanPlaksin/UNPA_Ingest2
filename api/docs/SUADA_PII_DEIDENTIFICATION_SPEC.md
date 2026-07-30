# PII Deidentification Layer — Design Spec

**Task:** TASK-SUADA-PREREQ-002
**Status:** DRAFT — for ratification before implementation
**Scope:** design only; no code changes proposed here beyond the interfaces named

Real chat transcripts are the only source of failures the simulator has never
imagined. They are also, in a UN HR and Finance service desk, among the most
sensitive text the platform holds. This spec defines how a transcript becomes a
test scenario without carrying a person into the training loop.

---

## 1. What personal data exists today

Audited across `chat-telemetry.service.js`, `chat-admin.service.js` and the
firehose writer. Two stores hold identical content: Memgraph nodes and
`logs/chat/chat-turns-*.jsonl`.

### ChatSession

| Field | Contains | Risk |
|---|---|---|
| `userId` | Altiora account id | direct identifier |
| `userDisplayName` | real full name from the directory | direct identifier |
| `orgCode` | org unit code | quasi-identifier (small units are identifying) |
| `sessionId` | opaque | link key, not personal in itself |
| `finalDraftJson` | every slot the user filled | **highest risk** — dependants, dates of birth, bank details, addresses, separation reasons |
| `srNumber`, `ticketId` | ticket references | links back to a named person in Altiora |
| `reviewNote` | free text written by an operator | may name the person |
| `analysisJson` | LLM session analysis | may quote transcript text |

### ChatTurn

| Field | Contains | Risk |
|---|---|---|
| `userText` | the user's own words, capped at 4000 chars | **highest risk** — unbounded free text in an HR context |
| `agentText` | the reply, which routinely echoes confirmed values | high — the agent repeats names and dates back |
| `askingSlot`, `route`, `error` | field id, route label, error code | none |
| `nodeTraceJson`, `llmCallsJson` | node durations, model, cost, tokens | none |
| `promptGraphEntryId/Version/TextHash`, `overlayHash`, `overlayIds` | provenance (PREREQ-001/001.1) | none |
| `durationMs`, `seq`, `ts`, `channel` | mechanics | `ts` is a weak quasi-identifier in a small population |

Structural signal — routes, slot ids, ordering, errors, timings, outcomes,
provenance — carries **no** personal data. The identifying content is confined to
four fields: `userText`, `agentText`, `finalDraftJson`, and the three identity
fields on the session.

### Present state of protection

None. No redaction, no pseudonymisation, no separation of dev and prod data (one
shared Memgraph). Retention is 90 days in the graph and — until
TASK-SUADA-PREREQ-003 — unbounded on disk.

---

## 2. When scrubbing happens

**Ratified decision: on promotion, not on write.**

```
 live chat ──► ChatTurn (raw, 90d)  ──► operator triage (raw, needed)
                     │
                     └──► [PROMOTION: deidentify] ──► DialogueGymScenario
                                                       (source='real_dialogue')
                                                              │
                                                              └──► Suada / GEPA
```

Rationale, restated so the trade-off is on the record:

- The operator triaging a failed session **needs** the raw transcript. Scrubbing
  on write would blind the one human contour that currently produces causal
  labels (`rootCause`), which is the most valuable signal the system has.
- The raw copy is already bounded: 90 days, both stores (after PREREQ-003).
- The scenario, by contrast, is **permanent** and is copied into training runs,
  Pareto comparisons and reflection prompts sent to an LLM. Anything personal
  that crosses this boundary is effectively unrecallable.

The boundary is therefore the promotion step, and it is the **only** path by
which production text may reach Suada. This must be enforced, not merely
documented — see §7.

---

## 3. What must survive

A scenario is useful only if it still reproduces the failure. What is preserved:

| Preserved | Why |
|---|---|
| turn count and ordering | pacing failures (re-asking, loops) live here |
| `route` per turn | misroutes are the largest failure class |
| `askingSlot` sequence | interrogation-order defects |
| `expectedServiceCode` | ground truth for `intentAccuracy` |
| slot **ids** filled, and their **types** | what the dialogue achieved |
| outcome, `errorTurns`, `outOfScopeTurns`, `repairSession` | failure signature |
| language | persona selection |
| provenance (prompt hash, overlay hash) | which prompt produced this failure |
| `userGoal` | rewritten abstractly — see below |
| `initialMessage` | scrubbed, because the persona must open the dialogue |

What is **not** carried: `userId`, `userDisplayName`, `orgCode`, `srNumber`,
`ticketId`, `finalDraftJson`, `reviewNote`, raw `agentText`, absolute timestamps.

The scenario schema already supports this: `DialogueGymScenario` stores
`userGoal`, `initialMessage`, `expectedServiceCode`, `expectedSlotsJson`,
`successCriteriaJson` — none of which requires a real utterance. A persona
regenerates the wording at run time from the goal. **The scenario needs the
user's intent, not the user's sentence.**

---

## 4. Scrubbing strategy

Two mechanisms, applied in order. Neither is trusted alone.

### 4.1 Structural abstraction (primary)

The scenario is **rebuilt from structure**, not filtered from text. An LLM reads
the transcript and emits the scenario fields; it is instructed to describe the
intent and never to copy a value. This inverts the usual redaction problem: the
default output contains no personal data, rather than containing it until a
pattern removes it.

```
userGoal:        "Staff member wants to add a newly-born dependant and does not
                  know which supporting documents are required."
initialMessage:  "I need to add my new baby to my records"
```

Slot values are recorded as **shape, not content**:

```json
{ "dependantName": {"type": "text", "filled": true},
  "dateOfBirth":   {"type": "date", "filled": true, "relative": "P-45D"} }
```

Dates become offsets from session start (`P-45D`), so "requested leave 45 days
after the event" survives while the date does not.

### 4.2 Pattern sweep (secondary, a check — not the mechanism)

Run over every generated field as a **fail-closed gate**:

- the session's own known identifiers (`userDisplayName` and its parts,
  `userId`, `orgCode`, `srNumber`, `ticketId`) — exact and case-insensitive
- long digit runs (≥6) → `[NUMBER]`; IBAN-shaped and index-number-shaped tokens
- e-mail addresses, phone-shaped strings, URLs
- absolute dates (`YYYY-MM-DD`, `DD/MM/YYYY`, spelled months) → relative offsets

A hit means the abstraction step leaked. The promotion is **rejected**, not
patched: a silently patched scenario hides a failing generator, and the next leak
may take a form no pattern covers. Rejections are logged for review.

Deliberately **not** attempted: general-purpose named-entity recognition over the
free text. In six languages, against names from every UN member state, recall
would be well under what this data requires, and a 95%-effective scrubber on
personal data is a scrubber that fails 1 time in 20. Structural rebuilding avoids
needing it at all.

---

## 5. Provenance of a scrubbed scenario

Traceability must survive, or a bad scenario can never be traced to its source.
Fields added to `DialogueGymScenario` (the schema already has `source` and
`sourceRef`):

| Field | Value |
|---|---|
| `source` | `'real_dialogue'` (already in the enum) |
| `sourceRef` | the originating `sessionId` |
| `scrubbedAt` | ISO timestamp |
| `scrubberVersion` | version of the abstraction prompt + pattern set |
| `scrubReviewedBy` | human who approved the promotion (see §6) |

`sourceRef` is a link into data that **expires in 90 days**. This is a feature: a
scenario older than the retention window can no longer be traced back, which is
also the point at which the link stops being personal data. Operationally it
means review must happen while the source still exists.

`scrubberVersion` matters because the abstraction prompt will change. When it
does, scenarios produced by an older version can be re-examined as a cohort.

---

## 6. PII in agentText — the case worth naming

The task asked specifically about this, and it is the sharpest edge.

The agent routinely echoes confirmed values: *"Thank you — I've recorded Maria
Consuelo Ramírez as your dependant, born 12 March 2019."* The agent's own words
are therefore **exactly as sensitive as the user's**, and often more structured
and thus more extractable.

Consequence for the design: `agentText` is never carried into a scenario, in any
form. The scenario captures what the agent *did* (route, slot asked, control
shown, whether it grounded before asking) from the structured fields, which is
what the judge scores anyway. `JudgeRecord` criteria — grounding, tone, controls
correctness, helpfulness — are computed **at run time on the simulated dialogue**,
never on the historical text. Nothing in the evaluation loop needs the original
reply to exist.

Second-order case: the *fact of a value* can identify. "A dependant born in a
month when the office recorded one birth" is identifying in a 12-person unit even
with every name removed. This is why slot values become type-and-filled-ness, and
why `orgCode` is dropped rather than generalised.

---

## 7. Enforcement

A documented boundary that nothing enforces is not a boundary.

1. **One promotion path.** The only writer of `DialogueGymScenario` with
   `source='real_dialogue'` is the promotion service. Direct creation with that
   source is rejected at the service layer.
2. **The gate is not optional.** The pattern sweep (§4.2) runs inside promotion.
   There is no flag to skip it.
3. **Human approval.** Promotion produces a scenario in
   `groundTruthVerified=false`. It cannot enter a GEPA run until a human verifies
   it — the existing `POST /scenarios/:id/verify-ground-truth` contour, which
   already gates `scenarioFilter: { groundTruthVerified: true }`. The reviewer is
   therefore also the second pair of eyes on the scrub.
4. **A test that reads the code**, in the style now used for the other two
   contract fixes: assert that no module outside the promotion service writes
   `source: 'real_dialogue'`.

Point 3 is the strongest control here, and it is free: the ratification contour
already exists and already blocks unverified scenarios from the optimizer.

---

## 8. What this does not cover

Stated plainly so it is not mistaken for settled:

- **The raw stores themselves.** Session identity fields and transcripts remain
  in Memgraph and on disk for 90 days, unencrypted, on a Memgraph instance shared
  with development. Deidentification at the Suada boundary does not make the raw
  store compliant with anything; it only stops personal data entering a permanent
  training corpus. Whether the raw store is acceptable is a separate question and
  a separate decision, and it belongs to Ivan, not to this spec.
- **Legal classification.** Whether this data is subject to a specific UN data
  protection instrument, and whether pseudonymisation suffices where that
  instrument applies, is not a determination I can make. This spec reduces
  exposure; it does not certify compliance.
- **Right to erasure.** If a person's data must be deleted on request, the
  scenario derived from their session is — by design — no longer linkable to them
  after 90 days, so it cannot be found and deleted. That is the intended
  end-state of deidentification, but it should be a conscious choice, not a
  surprise.

---

## 9. Implementation outline (for a later task)

| Step | Where | Size |
|---|---|---|
| `scenario-promotion.service.js` — read session + turns, call abstraction, run gate, write scenario | `api/src/services/dialogue-gym/` (namespace CORE) | M |
| Abstraction prompt + schema (structured output) | same module | S |
| Pattern gate + rejection logging | same module | S |
| `POST /api/v1/dialogue-gym/scenarios/promote-session/:sessionId` | `dialogue-gym.route.js` | S |
| Admin action "promote to scenario" on a triaged session | `mcp/.../flowdesk-admin` | S |
| Provenance fields on the scenario schema | `dialogue-gym.cypher` | S |
| Tests: gate rejects planted identifiers; agentText never carried; single-writer assertion | `__tests__` | M |

Total ≈ M–L. **Not urgent**: with 129 sessions of which 122 are development
noise, there is nothing worth promoting today. This is a prerequisite for Phase 6
(production signal ingestion), not for EXP-001 or Phase 1 — which is exactly why
it is worth specifying now and building when there is real traffic to promote.

---

## Open questions for ratification

1. Is rebuilding the scenario abstractly (§4.1) accepted as the mechanism, with
   pattern matching demoted to a fail-closed check rather than the primary tool?
2. Is rejecting a leaking promotion — rather than auto-patching it — the right
   failure mode?
3. Is dropping `orgCode` entirely acceptable, or is org-level analysis
   ("which unit fails most") a requirement that would force a coarser
   generalisation instead?
4. §8 raises the raw-store question. Does it become a task, or is the 90-day
   window on a shared instance an accepted risk?
