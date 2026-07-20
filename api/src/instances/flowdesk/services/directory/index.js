'use strict';

/**
 * Directory facade + provider factory (F11a) — the single seam the interpreter's
 * RESOLVERS node and the AltioraToolsAdapter call. Backed by a swappable
 * DirectoryAdapter provider (mock now; the Altiora API gateway later — external
 * Login / identity is reached through Altiora, never a direct Graph/LDAP call).
 * The backend is chosen by `FLOWDESK_DIRECTORY_PROVIDER` (default `mock`) with
 * zero caller change — this module keeps the flat method surface the pre-F11
 * facade exposed, delegating each call to the active provider.
 *
 * @module instances/flowdesk/services/directory
 */

const { createMockProvider } = require('./providers/mock.provider');
const { createAltioraProvider } = require('./providers/altiora.provider');
const { createCachedProvider } = require('./providers/cached.provider');
const { createResilientProvider } = require('./providers/resilient.provider');

const REGISTRY = {
  mock: createMockProvider,
  altiora: createAltioraProvider,
};

// Runtime uses the configured provider (Ivan: real Altiora, no mocks in the chat).
// Under test the facade default is pinned to the mock so unit tests stay deterministic
// and never reach a live Altiora — a test explicitly asks for 'altiora' when it wants it.
const DEFAULT_PROVIDER = process.env.NODE_ENV === 'test'
  ? 'mock'
  : (process.env.FLOWDESK_DIRECTORY_PROVIDER || 'mock');
// Cache on in normal runtime; off under test (the decorator is exercised directly
// in cached.provider.test.js — wrapping the factory would pull a live Redis
// connection into every suite and keep the event loop open).
const CACHE_ENABLED = String(process.env.FLOWDESK_DIRECTORY_CACHE_ENABLED || 'true') !== 'false'
  && process.env.NODE_ENV !== 'test';
// Resilience wrapper (maps backend failures → DirectoryUnavailableError). On in
// normal runtime; off under test (exercised directly in resilient.provider.test.js).
const RESILIENT_ENABLED = String(process.env.FLOWDESK_DIRECTORY_RESILIENT_ENABLED || 'true') !== 'false'
  && process.env.NODE_ENV !== 'test';

let _active = null;

/**
 * Get a DirectoryAdapter instance. Named provider or the env default, wrapped in
 * the caching decorator unless disabled (`FLOWDESK_DIRECTORY_CACHE_ENABLED=false`
 * or `config.noCache`). The cache is transparent (providerId unchanged) and
 * degrades to pass-through when Redis is unavailable.
 * @param {string} [providerName]
 * @param {Object} [config]
 * @returns {import('./adapter.interface').DirectoryAdapter}
 */
function getDirectoryProvider(providerName, config = {}) {
  const name = providerName || DEFAULT_PROVIDER;
  const make = REGISTRY[name];
  if (!make) throw new Error(`[directory] unknown provider '${name}'. Valid: ${Object.keys(REGISTRY).join(', ')}`);
  const base = make(config);
  // Layering (outermost first): resilient → cached → base. Resilient turns
  // backend failures into DirectoryUnavailableError (ADCC-085 handling upstream);
  // cached removes repeated lookups. Both are transparent (providerId unchanged).
  let provider = base;
  if (CACHE_ENABLED && !config.noCache) provider = createCachedProvider(provider, { config: config.cache });
  if (RESILIENT_ENABLED && !config.noResilient) provider = createResilientProvider(provider);
  return provider;
}

/** Lazily-built singleton for the default provider (what the flat facade uses). */
function active() {
  if (!_active) _active = getDirectoryProvider();
  return _active;
}

/** Test seam: force a provider instance (or reset with null). */
function _setActiveProvider(p) { _active = p; }

module.exports = {
  // Factory
  getDirectoryProvider,
  listProviders: () => Object.keys(REGISTRY),
  DEFAULT_PROVIDER,
  _setActiveProvider,

  // Backward-compatible flat surface (delegates to the active provider) —
  // existing callers (interpreter engine, AltioraToolsAdapter) are unchanged.
  resolveUser: (query) => active().resolveUser(query),
  getUser: (userId) => active().getUser(userId),
  getCurrentUser: (context) => active().getCurrentUser(context),
  getManager: (userId) => active().getManager(userId),
  resolveApprover: (userId) => active().resolveApprover(userId),
  listManagers: () => active().listManagers(),
  listLocations: () => active().listLocations(),
  resolveLocation: (code) => active().resolveLocation(code),
  searchLocations: (query) => active().searchLocations(query),
};
