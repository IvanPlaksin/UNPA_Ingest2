'use strict';

/**
 * resolve.search production service (C3).
 *
 * Wires the three real backends (SERVICE / ARTICLE / SR_STATUS) into the
 * Contract-3 orchestration (SR-ref detection, fan-out, typed-union assembly,
 * cross-type ranking, limit). The orchestration itself is NOT re-implemented —
 * it is imported from the ratified stub, so behaviour matches the contract tests.
 *
 * Each backend degrades gracefully to empty/null on failure (handled inside the
 * backend), so an unavailable source never crashes retrieval.
 *
 * @module instances/flowdesk/services/resolve-search.service
 */

const { resolveSearch: orchestrate } = require('../contracts/resolve-search.stub');
const { getAltioraTools } = require('./altiora-tools.adapter');

/**
 * Build a resolve.search function. By default every backend is routed through the
 * AltioraToolsAdapter (F9.4/N3), which enforces the tool allowlist and the
 * Altiora namespace/scope isolation. Tests may still inject raw backends.
 * @param {Object} [deps] - { serviceBackend, articleBackend, srStatusBackend }
 */
function createResolveSearch(deps = {}) {
  const tools = deps.tools || getAltioraTools();
  const backends = {
    searchServices: deps.serviceBackend || ((q, c) => tools.searchServices(q, c)),
    searchArticles: deps.articleBackend || ((q, c) => tools.searchArticles(q, c)),
    getSRStatus: deps.srStatusBackend || ((n, c) => tools.getSRStatus(n, c)),
  };

  return function resolveSearch(query, context, opts = {}) {
    if (!query || !String(query).trim()) return Promise.resolve([]); // early return
    return orchestrate(query, context || {}, { backends, limit: opts.limit });
  };
}

let _default;
function getResolveSearch() {
  if (!_default) _default = createResolveSearch();
  return _default;
}

module.exports = { createResolveSearch, getResolveSearch };
