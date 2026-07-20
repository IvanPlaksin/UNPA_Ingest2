'use strict';

/**
 * DirectoryAdapter contract (F11a) — the provider-agnostic interface every
 * directory backend implements. The interpreter's RESOLVERS node and the
 * AltioraToolsAdapter reach the directory ONLY through this contract, so the
 * backing source (mock now; the Altiora API gateway later — external Login /
 * identity is reached through Altiora, never a direct Graph/LDAP call) can be
 * swapped by config with zero caller change.
 *
 * This module is documentation + shared helpers (typedefs, method list, the
 * NotImplementedError used by not-yet-wired providers). It has no runtime
 * behavior of its own.
 *
 * @module instances/flowdesk/services/directory/adapter.interface
 */

/**
 * @typedef {Object} User
 * @property {string} userId
 * @property {string} name
 * @property {string} email
 * @property {{code:string, name:string}} location   - primary duty station
 * @property {string} department
 * @property {'staff'|'manager'|'director'} role
 * @property {string|null} managerId                 - administrative superior (approver chain)
 */

/**
 * @typedef {Object} Location
 * @property {string} code                           - duty-station code (e.g. "GVA")
 * @property {string} name                           - display name (e.g. "Geneva")
 * @property {string} [building]
 * @property {string} [city]
 * @property {string} [timezone]
 */

/**
 * @typedef {Object} AuthContext
 * @property {string} [token]        - bearer/session token from Altiora Login, if present
 * @property {string} [userId]       - explicit user id (dev/pilot, trusted client)
 * @property {Object} [sessionUser]  - user object already resolved by auth middleware
 */

/**
 * @typedef {Object} DirectoryAdapter
 * @property {string} providerId
 * @property {(query:string) => Promise<User[]>} resolveUser
 * @property {(userId:string) => Promise<User|null>} getUser
 * @property {(context?:AuthContext) => Promise<User>} getCurrentUser
 * @property {(userId:string) => Promise<User|null>} getManager
 * @property {(userId:string) => Promise<User|null>} resolveApprover
 * @property {() => Promise<User[]>} listManagers
 * @property {() => Promise<Location[]>} listLocations
 * @property {(code:string) => Promise<Location|null>} resolveLocation
 * @property {(query:string) => Promise<Location[]>} searchLocations
 */

/** The nine methods every provider must implement (used by the contract test). */
const ADAPTER_METHODS = [
  'resolveUser', 'getUser', 'getCurrentUser',
  'getManager', 'resolveApprover', 'listManagers',
  'listLocations', 'resolveLocation', 'searchLocations',
];

/** Thrown by a provider whose backend contract is not wired yet (e.g. Altiora API). */
class NotImplementedError extends Error {
  constructor(method, providerId) {
    super(`[directory:${providerId}] ${method}() is not wired yet — awaiting the Altiora API contract`);
    this.name = 'NotImplementedError';
    this.code = 'DIRECTORY_NOT_IMPLEMENTED';
    this.method = method;
    this.providerId = providerId;
  }
}

/** Thrown when the backing directory source is unreachable (graceful-degradation seam). */
class DirectoryUnavailableError extends Error {
  constructor(providerId, cause) {
    super(`[directory:${providerId}] directory source unavailable${cause ? `: ${cause}` : ''}`);
    this.name = 'DirectoryUnavailableError';
    this.code = 'DIRECTORY_UNAVAILABLE';
    this.providerId = providerId;
    this.cause = cause;
  }
}

module.exports = { ADAPTER_METHODS, NotImplementedError, DirectoryUnavailableError };
