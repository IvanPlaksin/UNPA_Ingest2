'use strict';

/**
 * ACT authorization (Phase 9) — gates whether the CHAT may invoke side-effecting
 * actions (submit / approve / reject) on the user's behalf.
 *
 * Binary RBAC (PO-ratified): a single per-user "ACT enabled" allowlist,
 * `FLOWDESK_ACT_USERS` (comma-separated userIds/emails), evaluated exactly like
 * the admin allowlist (`flowdesk-admin.middleware.js`) — EXCEPT it **fails
 * CLOSED**: unset/empty ⇒ nobody may ACT. Altiora still enforces its own
 * permissions at the actual write; this only decides whether the chat may try.
 *
 * Also enforces the hard requirement that a real acting user (bearer) be present
 * — an ACT must never fall back to the service account (`altiora-client.js`
 * getActingToken() || serviceTokenProvider()).
 *
 * @module instances/flowdesk/services/act-authorization
 */

/**
 * The effective ACT allowlist (lowercased userIds/emails): the static env
 * `FLOWDESK_ACT_USERS` UNION the admin-managed persistent grants
 * (act-permissions.service, cached). Fail-closed is preserved — if both are
 * empty the list is empty. The dynamic read is wrapped so a store failure can
 * never break the gate (env allowlist still applies).
 */
function actUsers() {
  const env = String(process.env.FLOWDESK_ACT_USERS || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  let dynamic = [];
  try { dynamic = require('./act-permissions.service').getDynamicKeys(); } catch { /* store unavailable → env only */ }
  return dynamic.length ? [...new Set([...env, ...dynamic])] : env;
}

/** ACT maps to this gated permission (submit a real Altiora ticket). */
const ACT_PERMISSION = 'submit_service_request';

/**
 * Is this user allowed to invoke ACT?
 *  1. If the ACT permission is globally enabled-for-ALL (admin default), any user
 *     is authorized (still fail-closed on the acting-token in checkAct).
 *  2. Otherwise the per-user allowlist (env ∪ managed grants). FAIL CLOSED —
 *     empty allowlist ⇒ false.
 * @param {{userId?:string, email?:string}} user
 * @returns {boolean}
 */
function isActAuthorized(user) {
  try { if (require('./act-permissions.service').getDefault(ACT_PERMISSION)) return true; } catch { /* store unavailable → allowlist only */ }
  const list = actUsers();
  if (list.length === 0) return false; // fail closed
  const id = String(user && user.userId || '').toLowerCase();
  const email = String(user && user.email || '').toLowerCase();
  return (id && list.includes(id)) || (email && list.includes(email));
}

class ActAuthorizationError extends Error {
  constructor(message, code) { super(message); this.name = 'ActAuthorizationError'; this.code = code; }
}

/**
 * Require a real acting user token — reject the service-account fallback for any
 * user-initiated ACT. Throws ActAuthorizationError('NO_ACTING_USER') when absent.
 * @param {string|null|undefined} actingToken  from getActingToken()
 */
function requireActingUser(actingToken) {
  if (!actingToken) throw new ActAuthorizationError('ACT requires an authenticated acting user', 'NO_ACTING_USER');
}

/**
 * Full gate: user must be on the ACT allowlist AND have a live acting token.
 * Returns {ok:true} or {ok:false, code, reason} (does not throw for the allowlist
 * miss so the caller can emit a friendly "not enabled" message).
 * @param {{userId?:string, email?:string}} user
 * @param {string|null} actingToken
 */
function checkAct(user, actingToken) {
  if (!actingToken) return { ok: false, code: 'NO_ACTING_USER', reason: 'no acting user' };
  if (!isActAuthorized(user)) return { ok: false, code: 'NOT_ENABLED', reason: 'ACT not enabled for user' };
  return { ok: true };
}

module.exports = { isActAuthorized, requireActingUser, checkAct, ActAuthorizationError };
