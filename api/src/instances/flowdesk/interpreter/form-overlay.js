'use strict';

/**
 * Form overlay — the request-level fields every service has, whatever its schema says.
 *
 * A materialized Altiora form describes the SERVICE's own fields and nothing else.
 * The chat also has to establish who the request is for, where they are based, who
 * is raising it, and a free-text summary — none of which appear in the schema, and
 * all of which the service desk treats as part of intake. The state machine has
 * always overlaid them; the agent interpreter did not, and the consequence was
 * exactly the failure Ivan reported: the mandatory location question was skipped,
 * because for the agent that field did not exist.
 *
 * Extracted from interpreter-engine so both interpreters overlay the same fields.
 * One definition, two callers — see form-policy for the same reasoning.
 *
 * @module instances/flowdesk/interpreter/form-overlay
 */

const CONTEXT_SLOTS = [
  { slotId: 'beneficiary', type: 'user', required: true, phase: 'context', resolverRef: 'resolve.user', promptHint: 'Who is this request for?' },
  { slotId: 'location', type: 'location', required: true, phase: 'context', resolverRef: 'resolve.location', dependsOn: ['beneficiary'], promptHint: 'Which location or duty station?' },
];

// A free-text request summary. NOT a schema field — Altiora's form shows its own
// request-level "Description / Additional Notes" for every real service — so the chat
// gathers it once and hands it to the form's `description` (form-handoff). Overlaid
// ONLY on Altiora-materialized snapshots (they carry altioraOusId); the golden fixtures
// have no such form field, so they keep their exact slot order.
const REQUEST_DESCRIPTION_SLOT = { slotId: 'description', type: 'text', required: false, phase: 'context', promptHint: 'Briefly describe your request or add any notes' };

// The requester (author): the person raising the request. Like the beneficiary it is a
// USER-DIRECTORY entity and universal to EVERY service — Altiora stamps `requester` (from
// the authenticated identity) onto every submit, for all schemas — but unlike the
// beneficiary it is never CHOSEN: it is always the current signed-in user, so it is
// resolved silently and never asked. It lives in the draft only so beneficiary self/other
// can be judged against the real requester and so the requester is explicit in the
// assembled request. Altiora-only overlay (altioraOusId), like the description; the golden
// fixtures that declare their own author slot keep their exact semantics.
// `autoResolve` marks it silent: filled from the current user at intake, never asked.
// (A schema that declares its OWN author slot — the platform hardware fixtures — has no
// such flag and is still asked via the ordinary confirm-or-choose.)
const REQUEST_AUTHOR_SLOT = { slotId: 'author', type: 'user', required: false, phase: 'context', resolverRef: 'resolve.author', promptHint: 'Requester', autoResolve: true };

// Two more universal, non-schema request fields the Altiora wizard renders for EVERY
// service (Step1_Details.tsx), both optional:
//   sharedWith    – colleagues given read-only visibility (a MultiEmployeeSelector →
//                   an ARRAY of directory users). Collected via a dedicated share_collect
//                   turn (multi-user, so not a single confirm-or-choose slot).
//   manualApprover– the authorizer. Only meaningful when the service needs approval, so
//                   injected only then. Reuses resolve.approver (the beneficiary's manager,
//                   with other managers as alternatives) — the same person Altiora's form
//                   auto-resolves — but optional, so the user can accept, override, or skip.
// CODE-007: 'closing', not 'context'. Sharing a request read-only with colleagues
// is a decision about a request that already exists — asking it in the opening
// phase, before the user has even said what they need, reads as an interruption
// and was observed in the arena derailing intake. It belongs after the form.
const REQUEST_SHARED_WITH_SLOT = { slotId: 'sharedWith', type: 'userlist', required: false, phase: 'closing', promptHint: 'Would you like to share this request (read-only) with any colleagues?' };
const REQUEST_APPROVER_SLOT = { slotId: 'manualApprover', type: 'user', required: false, phase: 'context', resolverRef: 'resolve.approver', promptHint: 'Who should authorize this request?' };

function effectiveSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.slots)) return snapshot;
  const present = new Set(snapshot.slots.map((s) => s.slotId));
  const fromAltiora = !!(snapshot.metadata && snapshot.metadata.altioraOusId);
  const extras = fromAltiora
    ? [REQUEST_AUTHOR_SLOT, REQUEST_DESCRIPTION_SLOT, REQUEST_SHARED_WITH_SLOT,
       ...(snapshot.metadata.approvalRequired ? [REQUEST_APPROVER_SLOT] : [])]
    : [];
  // De-duplication is by CONCEPT, not by slotId.
  //
  // The loader injects `approver` and this overlay injects `manualApprover` — two
  // ids for one thing, the person who authorises the request. Filtering on the id
  // alone let both through, so an approval-required service carried the same
  // question twice under different names. Exactly the shape the `author`
  // duplication had, and the only reason it never surfaced in a transcript is
  // that approval services are rarer.
  const CONCEPTS = [['approver', 'manualApprover']];
  const conceptTaken = new Set();
  for (const group of CONCEPTS) {
    const held = group.find((id) => present.has(id));
    if (held) for (const id of group) if (id !== held) conceptTaken.add(id);
  }
  const inject = [...CONTEXT_SLOTS, ...extras]
    .filter((s) => !present.has(s.slotId) && !conceptTaken.has(s.slotId));
  if (!inject.length) return snapshot; // schema already carries them → no overlay
  let phases = (snapshot.phases || []).includes('context')
    ? snapshot.phases
    : ['context', ...(snapshot.phases || [])];
  // A 'closing' slot must sort AFTER the service's own phases. Slot ordering uses
  // phases.indexOf(), and an unlisted phase yields -1 — which would sort it first,
  // the exact opposite of the intent (CODE-007).
  if (inject.some((s) => s.phase === 'closing') && !phases.includes('closing')) {
    phases = [...phases, 'closing'];
  }
  // WHO the request is for, WHERE they are based, WHO is raising it — in that
  // order, first, whoever supplied them.
  //
  // The loader injects some of these itself, so the overlay adds only what is
  // missing; splicing that remainder at index 0 put the free-text summary ahead
  // of the already-present duty-station question, and the ask order follows the
  // form's order (fdv2-111bd67f). Ordering identity explicitly makes the opening
  // sequence the same whichever layer contributed which field.
  // The REQUESTER is never a question.
  //
  // Altiora stamps the requester from the authenticated identity on every submit,
  // so the chat only has to know it — never ask it. The schema loader injects its
  // own `author` as required and NOT auto-resolved, which turned it into a
  // question the user could not get past: fdv2-2815b706 shows "Who is submitting
  // this request?" answered three times and asked a fourth. There is one
  // definition of this field, and it is the silent one.
  const normalise = (s) => (s.slotId === 'author'
    ? { ...s, autoResolve: true, required: false }
    : s);

  const IDENTITY_ORDER = ['beneficiary', 'location', 'author'];
  const identity = IDENTITY_ORDER
    .map((id) => snapshot.slots.find((s) => s.slotId === id) || inject.find((s) => s.slotId === id))
    .filter(Boolean)
    .map(normalise);
  const notIdentity = (s) => !IDENTITY_ORDER.includes(s.slotId);
  return {
    ...snapshot,
    phases,
    slots: [...identity, ...inject.filter(notIdentity), ...snapshot.slots.filter(notIdentity)],
  };
}

module.exports = { effectiveSnapshot, CONTEXT_SLOTS };
