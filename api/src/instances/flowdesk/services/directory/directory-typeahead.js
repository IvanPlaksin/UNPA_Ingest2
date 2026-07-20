'use strict';

/**
 * Directory typeahead (I-6) — the read model behind `GET /flowdesk/directory/:type?q=`.
 *
 * Autocomplete controls (the `controls[]` turn-contract, next task) need a live
 * "search users / search duty stations as you type" endpoint; none existed. This
 * module is the provider-agnostic core of it: it maps a URL `:type` to the right
 * DirectoryAdapter search method, guards the query, and normalizes both the User
 * and Location shapes to ONE typeahead item `{ value, label, sublabel?, meta? }`
 * the front-end can render without knowing which directory it came from.
 *
 * It takes the directory facade as an argument (never imports the singleton), so
 * it is unit-tested against the mock provider and works unchanged once
 * FLOWDESK_DIRECTORY_PROVIDER flips to `altiora`. All Altiora auth/caching/
 * resilience already live in the provider stack beneath the facade.
 *
 * @module instances/flowdesk/services/directory/directory-typeahead
 */

/** URL `:type` (and common synonyms) → the canonical directory search kind. */
const TYPE_ALIASES = {
  user: 'user', users: 'user', beneficiary: 'user', requester: 'user', person: 'user', people: 'user',
  location: 'location', locations: 'location', dutystation: 'location', dutystations: 'location', 'duty-station': 'location',
};

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
/** Below this the search is not run — an unbounded 1-char scan is neither useful nor cheap. */
const MIN_QUERY = 2;

/** Thrown for an unrecognized `:type`; the controller maps it to 400. */
class UnknownDirectoryTypeError extends Error {
  constructor(type) {
    super(`unknown directory type '${type}'`);
    this.name = 'UnknownDirectoryTypeError';
    this.code = 'BAD_DIRECTORY_TYPE';
    this.type = type;
  }
}

/** DirectoryAdapter.User → typeahead item. */
function userItem(u) {
  const email = u.email || undefined;
  const department = u.department || undefined;
  const locationName = (u.location && u.location.name) || undefined;
  return {
    value: String(u.userId),
    label: u.name || '(unknown)',
    sublabel: email || department || locationName || undefined,
    meta: { email, department, location: locationName },
  };
}

/** DirectoryAdapter.Location → typeahead item. */
function locationItem(l) {
  const city = l.city || undefined;
  return {
    value: String(l.code),
    label: l.name || String(l.code),
    sublabel: city || l.building || undefined,
    meta: { city, building: l.building || undefined, timezone: l.timezone || undefined },
  };
}

/**
 * Run a typeahead search.
 *
 * @param {Object} directory                the directory facade (flat resolveUser/searchLocations surface)
 * @param {string} rawType                  the URL `:type` segment
 * @param {string} q                        the query fragment
 * @param {Object} [opts]
 * @param {number|string} [opts.limit]      max items (clamped to [1, MAX_LIMIT])
 * @returns {Promise<{type:string, query:string, results:Array}>}
 * @throws  {UnknownDirectoryTypeError}     for an unrecognized type
 *          (DirectoryUnavailableError bubbles up from the provider for the caller to map to 503)
 */
async function typeahead(directory, rawType, q, opts = {}) {
  const type = TYPE_ALIASES[String(rawType || '').trim().toLowerCase()];
  if (!type) throw new UnknownDirectoryTypeError(rawType);

  const query = String(q == null ? '' : q).trim();
  const parsed = parseInt(opts.limit, 10);
  const limit = Math.min(Math.max(Number.isFinite(parsed) ? parsed : DEFAULT_LIMIT, 1), MAX_LIMIT);

  // Typeahead convention: too short → an empty result, never an error (the control
  // simply shows nothing until the user has typed enough to disambiguate).
  if (query.length < MIN_QUERY) return { type, query, results: [] };

  const rows = type === 'user'
    ? await directory.resolveUser(query)
    : await directory.searchLocations(query);
  const map = type === 'user' ? userItem : locationItem;

  const results = (Array.isArray(rows) ? rows : []).filter(Boolean).map(map).slice(0, limit);
  return { type, query, results };
}

module.exports = {
  typeahead,
  userItem,
  locationItem,
  TYPE_ALIASES,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MIN_QUERY,
  UnknownDirectoryTypeError,
};
