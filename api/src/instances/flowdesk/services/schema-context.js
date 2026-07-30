'use strict';

/**
 * Which location the FORM is chosen for — request-scoped.
 *
 * A service is a catalog GUID ("what"); the executable configuration, form schema
 * included, hangs off OrganizationUnitServiceId ("who provides it, and how"). The
 * mapping between them is `/ServiceDistribution/detect`, and it is decided by
 * LOCATION: the same service offered in Geneva and in Nairobi can be two
 * providers with two different forms.
 *
 * The location that decides it is the one the request is FOR — the beneficiary's
 * duty station — not the one the person typing happens to sit in. Those are the
 * same thing for most requests and different for exactly the requests where it
 * matters: an HR officer in Geneva raising a separation for a colleague in
 * Nairobi was being shown Geneva's form and filling Geneva's fields.
 *
 * Before this, `defaultLocationPathOf` read the ACTING user's duty station and
 * nothing else, so there was no way to say otherwise.
 *
 * WHY AMBIENT RATHER THAN A PARAMETER. `loadSnapshot(serviceId)` is called from
 * about two dozen places across both interpreters — the turn brief, every control
 * builder, the submit gate, each router branch — and almost none of them are
 * making a decision about location. Threading a context argument through all of
 * them would put the same value in twenty-four signatures to be read in one. The
 * acting user is carried the same way and for the same reason (see
 * acting-user.context), so this follows an established seam rather than inventing
 * a second one.
 *
 * The stored object is MUTABLE on purpose: the location can be answered in the
 * middle of a turn, and the very next thing the turn does is load the form again
 * to work out the next question. `update()` lets that turn see the new location
 * without opening a nested scope.
 *
 * Outside a turn — background sync, schema TTL refresh — there is no context and
 * callers fall back to the acting user, which is the behaviour that existed
 * before this module.
 *
 * @module instances/flowdesk/services/schema-context
 */

const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();

/**
 * A duty-station PATH, as detect matches it (Region/Country/DutyStation) — or the
 * duty-station name where that is all we have.
 *
 * A location record from the directory is `{code, name, city, ...}` where `code`
 * is the duty-station GUID. The GUID is deliberately NOT used: detect matches on
 * a path, so a GUID would match nothing, and "no provider" reads to the user as
 * "this service is not available at your location" — a wrong answer dressed as a
 * real one. No path means no override, and the acting user's own location stands.
 *
 * @param {object|string|null} value  a `location` slot value
 * @returns {string|null}
 */
function locationPathFrom(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  const path = value.locationPath || value.path || value.dutyStationPath;
  if (path) return String(path);
  const name = value.dutyStation || value.name;
  return name ? String(name) : null;
}

/**
 * The schema context a draft implies: where the request is for, and which org unit
 * the person it is for belongs to (detect scopes on both).
 *
 * Reads the draft first and the answers held before the draft existed second — the
 * opening questions are answered BEFORE the form is created, which is precisely
 * when the form has to be chosen.
 *
 * @param {object|null} draft            DraftSR
 * @param {object|null} pendingContext   answers held on the session pre-draft
 * @returns {{locationPath: string|null, beneficiaryOrgUnitPath: string|null}}
 */
function schemaContextFrom(draft, pendingContext) {
  const slots = (draft && draft.slots) || {};
  const held = pendingContext || {};
  const slotValue = (id) => {
    const s = slots[id];
    if (s && s.value !== undefined && s.value !== null && s.value !== '') return s.value;
    return held[id] !== undefined ? held[id] : null;
  };

  const beneficiary = slotValue('beneficiary');
  const location = slotValue('location');

  return {
    // The location the user CONFIRMED for this request. It is proposed from the
    // beneficiary's profile (see the opening order), so confirming it is how the
    // beneficiary's duty station becomes the form's.
    locationPath: locationPathFrom(location)
      // Not yet asked: the beneficiary's own duty station is the same answer one
      // step earlier, and it is what the location question will propose anyway.
      || (beneficiary && typeof beneficiary === 'object' ? locationPathFrom(beneficiary.location) : null),
    beneficiaryOrgUnitPath: (beneficiary && typeof beneficiary === 'object'
      && (beneficiary.orgUnitPath || beneficiary.organizationUnitPath)) || null,
  };
}

/** Open a context for one turn. `seed` is usually schemaContextFrom(draft, held). */
function runWithSchemaContext(seed, fn) {
  return storage.run({ ...(seed || {}) }, fn);
}

/** The context, or null outside a turn. */
function getSchemaContext() {
  return storage.getStore() || null;
}

/**
 * Revise the context mid-turn — the location was just answered, or the draft was
 * created and now carries what the session held. A no-op outside a turn.
 */
function updateSchemaContext(patch) {
  const store = storage.getStore();
  if (!store || !patch) return;
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) store[k] = v;
  }
}

module.exports = {
  runWithSchemaContext, getSchemaContext, updateSchemaContext,
  schemaContextFrom, locationPathFrom,
};
