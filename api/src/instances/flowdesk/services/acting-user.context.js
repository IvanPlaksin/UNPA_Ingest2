'use strict';

/**
 * Request-scoped acting-user context.
 *
 * The chat runs behind Altiora's UnpaProxyController, which authenticates the user and
 * injects their identity (and bearer) as X-FlowDesk-User-* headers. When the chat calls
 * BACK into Altiora it should act as that user — correct permission scoping, and a ticket
 * created by its own requester (no HelpdeskExecute needed).
 *
 * Threading the token from the route through the interpreter, the tools adapter and every
 * backend would touch signatures the whole way down for something that is really ambient
 * request state. AsyncLocalStorage carries it instead: `flowdeskUserMiddleware` opens the
 * context per request, and anything at any depth can read the acting identity.
 *
 * Background work (catalog sync, schema TTL refresh, SignalR) runs with NO context — there
 * is no user in flight — and callers fall back to the service account.
 *
 * @module instances/flowdesk/services/acting-user.context
 */

const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();

/**
 * Run `fn` with `user` as the acting identity for the whole async subtree.
 * @param {object|null} user  shape of req.flowdeskUser (may carry `token`)
 */
function runWithActingUser(user, fn) {
  return storage.run(user || null, fn);
}

/** The acting user, or null when running outside a request (background jobs). */
function getActingUser() {
  return storage.getStore() || null;
}

/** The acting user's Altiora bearer, or null when absent/outside a request. */
function getActingToken() {
  const user = storage.getStore();
  return (user && user.token) || null;
}

module.exports = { runWithActingUser, getActingUser, getActingToken };
