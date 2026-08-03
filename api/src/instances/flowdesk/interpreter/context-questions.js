'use strict';

/**
 * The two opening questions, asked with what we already know in them.
 *
 * The location question was "Which location or duty station should this request be
 * processed from?" — a question asked cold, while the control underneath it already
 * offered the answer for one click. Session fdv2-781b9302 shows the user confirming
 * that control on the very next turn: the value was right, the sentence simply did
 * not mention it, so the reader was asked to supply something the assistant already
 * had.
 *
 * The cause is narrow. `describeField` hands the model `promptHint` and nothing else,
 * so the model has no way to name the duty station it is about to propose. It cannot
 * write a better sentence than the information it is given.
 *
 * AND IT DEPENDS ON WHO THE REQUEST IS FOR. "Your duty station" is right when the
 * request is for the person typing and wrong the moment it is for a colleague, where
 * the question is about THEIR posting. One phrasing for both cases is wrong in one of
 * them, every time.
 *
 * @module instances/flowdesk/interpreter/context-questions
 */

const valueOf = (draft, slotId) => {
  const sv = draft && draft.slots && draft.slots[slotId];
  return sv && sv.value !== undefined && sv.value !== null && sv.value !== '' ? sv.value : null;
};

/** A directory user's display name, however the adapter shaped them. */
function nameOf(user) {
  if (!user || typeof user !== 'object') return null;
  const joined = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return user.name || user.displayName || joined || null;
}

/** The duty station carried on a resolved user, as a readable place. */
function locationOf(user) {
  const loc = user && typeof user === 'object' ? user.location : null;
  if (!loc) return null;
  if (typeof loc === 'string') return loc;
  const name = loc.name || loc.label || loc.code || null;
  const city = loc.city && loc.city !== name ? loc.city : null;
  return name ? [name, city].filter(Boolean).join(', ') : null;
}

/**
 * Is the request for the person raising it? Compared by identity, not by a flag: the
 * beneficiary is confirmed through the directory, so both sides are real records.
 */
function isSelf(draft, actingUser) {
  const b = valueOf(draft, 'beneficiary');
  // The literal marker the control commits before the directory has resolved anyone.
  // Live, this is what the draft holds for several turns (fix-25027), so treating a
  // non-object as "cannot tell" would silently disable the self phrasing exactly when
  // it applies.
  if (b === 'self' || b === true) return true;
  if (!b || typeof b !== 'object') return true;   // nothing chosen yet → the default is self
  const bid = b.userId || b.id;
  const a = (actingUser && (actingUser.userId || actingUser.id))
    || (valueOf(draft, 'author') && (valueOf(draft, 'author').userId || valueOf(draft, 'author').id));
  if (!bid || !a) return !!b.self;
  return String(bid) === String(a);
}

/**
 * The location question, with the duty station we are about to propose named in it.
 *
 * Falls back to the plain question when there is nothing to propose — a sentence that
 * promises a suggestion and shows none is worse than a plain ask.
 *
 * @param {object} draft
 * @param {object} [actingUser]
 * @returns {string}
 */
function locationQuestion(draft, actingUser) {
  const beneficiary = valueOf(draft, 'beneficiary');
  const self = isSelf(draft, actingUser);
  // For the person asking, the profile to quote is THEIRS — and the beneficiary slot
  // may still hold the bare marker "self" rather than a resolved record, so the acting
  // user is the reliable source. Reading only the slot is why the live run kept asking
  // the plain question while the profile had the answer.
  const place = (self ? locationOf(actingUser) || locationOf(beneficiary) : locationOf(beneficiary))
    || locationOf(valueOf(draft, 'author'));
  if (!place) return 'Which location or duty station should this request be handled at?';

  if (self) {
    return `Your profile has you at ${place}. Should this request be handled there?`;
  }
  const who = nameOf(beneficiary);
  return who
    ? `${who} is based at ${place}. Should this request be handled there?`
    : `The request is for someone based at ${place}. Should it be handled there?`;
}

/**
 * Per-slot question text that depends on the draft rather than on the schema.
 *
 * Deliberately a small, closed map: a general templating language over prompts is a
 * language nobody would be able to audit, and these are the two questions whose
 * wording genuinely turns on an answer already given.
 */
/**
 * Who the request is for — named, not offered as a fork.
 *
 * "Is this request for yourself, or for someone else?" makes the person answer a
 * question about the SHAPE of the answer before giving it, and costs a turn: yes, then
 * the name. The control already holds the signed-in user, so the question can propose
 * them and the same turn accepts or replaces them (fdv2-65d84c0e).
 */
function beneficiaryQuestion(draft, actingUser) {
  const me = actingUser && typeof actingUser === 'object' ? actingUser : null;
  const who = nameOf(me);
  return who
    ? `Is this request for you, ${who}? If it is for a colleague, search for them instead.`
    : 'Who is this request for? Search for the person, or confirm it is for you.';
}

const DYNAMIC = {
  location: locationQuestion,
  beneficiary: beneficiaryQuestion,
};

/**
 * The question to ask for this field — the dynamic one where there is one, otherwise
 * the schema's own prompt.
 */
function questionFor(slotDef, draft, actingUser) {
  const fn = slotDef && DYNAMIC[slotDef.slotId];
  // NEVER the slotId. A field with no label is a field the template must not ask
  // about — it hands the turn to the model instead ("no_prompt_hint"), and inventing
  // a question out of an identifier would defeat that rule and put "commentDescription"
  // in front of a person. Returning empty keeps that decision with the caller.
  if (!fn) return (slotDef && slotDef.promptHint) || '';
  try { return fn(draft, actingUser) || (slotDef.promptHint || ''); } catch { return slotDef.promptHint || ''; }
}

module.exports = { questionFor, locationQuestion, beneficiaryQuestion, isSelf, nameOf, locationOf };
