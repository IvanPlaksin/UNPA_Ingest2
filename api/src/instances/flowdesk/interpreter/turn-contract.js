'use strict';

/**
 * TURN-001 — what an agent turn carries to the client, in one place.
 *
 * The turn crosses three layers on its way out, and each one used to rebuild it
 * field by field:
 *
 *   agent-loop.service   builds it from the tool session
 *   agent-session.service  reshapes it to look like the state machine's turn
 *   chat-v2.service      assembles the HTTP response
 *
 * Three hand-written copies of the same object. Adding a field meant editing all
 * three, and forgetting one had NO symptom: the tool reported success, the client
 * had nothing to draw, and the model — which had been told its rows were on screen —
 * described them in prose instead, which reads like a working answer. That is how
 * REQ-005 shipped broken twice over (fdv2-3c8050bf), and it is the fourteenth
 * instance of the same class in this project: the mechanism exists, the call is
 * accepted, the effect never happens.
 *
 * So the list lives here and the layers copy BY it. A new field is added once, and
 * the guard test (turn-contract.test.js) fails if any hop stops carrying it.
 *
 * ONLY the client-bound payload belongs here. `session`, `meta` and `history` also
 * come out of the loop and stop at the layer that needs them — travelling further
 * would put the model's cost accounting and the whole tool session on the wire.
 */

/**
 * Each field says whether it is ALWAYS on the turn or only when it has something in
 * it. That distinction is not cosmetic:
 *
 *   - `response` and `controls` are always present, `controls` as null when there
 *     are none. The client checks for the key.
 *   - `cards` and `openForm` are omitted when empty. An empty `cards` array would
 *     draw an empty list container under an ordinary answer, and an `openForm: null`
 *     is a hand-off the host might try to honour.
 */
const TURN_PAYLOAD = Object.freeze({
  // What the assistant said this turn.
  response: { always: true, fallback: null },
  // Widgets that COLLECT an answer — each one fills a slot.
  controls: { always: true, fallback: null },
  // Rows the turn SHOWS — requests, tasks. They fill nothing (REQ-005).
  cards: { always: false },
  // The hand-off: the host opens Altiora's own form with the draft prefilled.
  openForm: { always: false },
});

const TURN_PAYLOAD_FIELDS = Object.freeze(Object.keys(TURN_PAYLOAD));

/** Is there anything in it? An empty array and an empty object are nothing. */
function present(value) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

/**
 * The client-bound part of a turn, copied by the contract rather than by hand.
 *
 * Spread it into whatever else the layer computes for itself — `responseType`,
 * `state`, `executionLog` are each layer's own business and are NOT contract fields.
 *
 * @param {object} source anything shaped like a turn (the loop's result, a turn)
 * @returns {object} only the fields above, with the presence rules applied
 */
function pickTurnPayload(source) {
  const src = source || {};
  const out = {};
  for (const name of TURN_PAYLOAD_FIELDS) {
    const rule = TURN_PAYLOAD[name];
    if (present(src[name])) out[name] = src[name];
    else if (rule.always) out[name] = rule.fallback;
  }
  return out;
}

module.exports = { TURN_PAYLOAD, TURN_PAYLOAD_FIELDS, pickTurnPayload, present };
