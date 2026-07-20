'use strict';

/**
 * Interpreter RESOLVERS logic (F9.1c) — resolves directory-backed slots
 * (beneficiary, location) into a defaultValue + alternatives. Pure data prep:
 * it never confirms a value (that is the confirm-or-choose step, F9.1d).
 *
 * Directory is injected (mock now, real MCP later — CODEX-RULE-073 boundary).
 *
 * @module instances/flowdesk/interpreter/resolvers
 */

// Unicode-aware boundaries (\b is ASCII-only and fails for Cyrillic).
// Covers terse self-references people actually type when asked "who needs it?"
// ("me", "it's me", "on my behalf", Russian "это я"/"сам") — the word-boundary
// lookarounds keep these from matching inside larger words (email, some, самолёт).
const SELF_HINT_RE = /(?<![\p{L}])(мне|для себя|себе|меня|это я|я сам|сам|me|self|myself|for me|for myself|it'?s me|on my behalf)(?![\p{L}])/iu;

/**
 * Resolve the beneficiary from an extracted hint.
 * @param {Object|string} hint - {mode:'self'} | {query:'Иванова'} | 'Иванова'
 * @param {Object} directory
 * @returns {Promise<{mode, defaultValue, alternatives, matches, needsInput}>}
 */
async function resolveBeneficiary(hint, directory) {
  const asStr = typeof hint === 'string' ? hint : '';
  const mode = (hint && hint.mode) || (SELF_HINT_RE.test(asStr) ? 'self' : null);

  if (mode === 'self') {
    const me = await directory.getCurrentUser();
    return { mode: 'self', defaultValue: me, alternatives: [], matches: [me], needsInput: false };
  }

  const query = (hint && hint.query) || asStr || (hint && hint.name) || '';
  // No beneficiary named yet, or an explicit self-reference → default to the
  // signed-in user. The caller presents this as a confirm-or-choose (accept, or
  // pick someone else), so an unspecified/ambiguous reply can never trap the
  // open-ended "who needs it?" question in a re-ask loop. A non-empty name that
  // simply doesn't resolve still falls through to needsInput below.
  if (!query || SELF_HINT_RE.test(String(query))) {
    const me = await directory.getCurrentUser();
    return { mode: 'self', defaultValue: me, alternatives: [], matches: [me], needsInput: false };
  }

  const matches = await directory.resolveUser(query);
  if (matches.length === 0) return { mode: 'other', defaultValue: null, alternatives: [], matches: [], needsInput: true };
  return { mode: 'other', defaultValue: matches[0], alternatives: matches.slice(1), matches, needsInput: false };
}

/**
 * Resolve the location default + alternatives. Default comes from the
 * beneficiary's own location (self → current user; other → resolved beneficiary),
 * alternatives are the full duty-station list.
 * @param {Object|null} beneficiaryUser - a directory user record (with .location)
 * @param {Object} directory
 * @returns {Promise<{defaultValue, alternatives}>}
 */
async function resolveLocation(beneficiaryUser, directory) {
  const alternatives = await directory.listLocations();
  const srcUser = beneficiaryUser || (await directory.getCurrentUser());
  let defaultValue = null;
  const loc = srcUser && srcUser.location;
  // Propose the beneficiary's profile location as the default. Prefer the
  // directory's canonical record by code, but fall back to the profile location
  // object when only a NAME is on file (common for Altiora users, whose profile
  // carries {code:null, name:'New York'}) — otherwise the default was silently
  // dropped and the user got a bare question instead of the profile suggestion.
  if (loc && (loc.code || loc.name)) {
    defaultValue = (loc.code ? await directory.resolveLocation(loc.code) : null) || loc;
  }
  return { defaultValue, alternatives };
}

/**
 * Resolve the request author. Defaults to the current signed-in user (self)
 * unless a hint names someone else. (F9.2b)
 */
async function resolveAuthor(hint, directory) {
  if (hint) {
    const r = await resolveBeneficiary(hint, directory);
    if (r.defaultValue) return r;
  }
  const me = await directory.getCurrentUser();
  return { mode: 'self', defaultValue: me, alternatives: [], matches: [me], needsInput: false };
}

/**
 * Resolve the approver by administrative affiliation (F9.2b/R5): the manager of
 * the beneficiary (falling back to the author). Alternatives = managers/directors
 * so the user can override. If no manager exists (target is a director), there is
 * no default and the user must choose.
 */
async function resolveApproverFor(draft, directory) {
  const target = draft.slots.beneficiary?.value || draft.slots.author?.value;
  let defaultValue = null;
  if (target && target.userId && directory.resolveApprover) {
    defaultValue = await directory.resolveApprover(target.userId);
  }
  // Alternatives: managers/directors from the directory, minus the default.
  let alternatives = [];
  if (directory.listManagers) {
    const mgrs = await directory.listManagers();
    alternatives = mgrs.filter((u) => !defaultValue || u.userId !== defaultValue.userId);
  }
  return { defaultValue, alternatives, needsInput: !defaultValue };
}

/**
 * Compute resolved data for the slot about to be asked, if it is directory-backed.
 * @param {Object} slotDef - SchemaSnapshot slot
 * @param {Object} draft   - DraftSR
 * @param {Object} directory
 * @returns {Promise<Object|null>} { source, defaultValue, alternatives, mode?, needsInput? } or null
 */
async function runResolverForSlot(slotDef, draft, directory) {
  const ref = slotDef.resolverRef;
  if (!ref) return null;

  if (ref === 'resolver:user' || ref === 'resolve.user') {
    const sv = draft.slots[slotDef.slotId];
    const hint = sv?.hint || sv?.value || null;
    const r = await resolveBeneficiary(hint, directory);
    return { source: ref, ...r };
  }

  if (ref === 'resolver:author' || ref === 'resolve.author') {
    const sv = draft.slots[slotDef.slotId];
    const hint = sv?.hint || null;
    const r = await resolveAuthor(hint, directory);
    return { source: ref, ...r };
  }

  if (ref === 'resolver:location' || ref === 'resolve.location') {
    // Beneficiary's resolved user record, if any.
    const bene = draft.slots.beneficiary?.value;
    const beneUser = bene && bene.location ? bene : null;
    const r = await resolveLocation(beneUser, directory);
    return { source: ref, ...r };
  }

  if (ref === 'resolver:approver' || ref === 'resolve.approver') {
    const r = await resolveApproverFor(draft, directory);
    return { source: ref, ...r };
  }

  return null;
}

module.exports = { resolveBeneficiary, resolveLocation, resolveAuthor, resolveApproverFor, runResolverForSlot, SELF_HINT_RE };
