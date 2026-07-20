'use strict';

/**
 * SERVICE retrieval backend (C3) — wraps the existing semantic-search over the
 * Qdrant `flowdesk_services` collection (TEI embeddings). Maps its result to the
 * resolve.search ServiceHit input shape.
 *
 * @module instances/flowdesk/services/backends/service.backend
 */

/**
 * @param {Object} [deps]
 * @param {Function} [deps.classify] - (query, opts) => semantic-search result
 * @param {Function} [deps.versionOf] - (serviceId) => Promise<number> schemaRef version
 */
function makeServiceBackend(deps = {}) {
  const classify = deps.classify || (async (query, opts) => {
    const search = require('../semantic-search.js');
    return search.classifyUserIntent(query, opts || {});
  });
  const versionOf = deps.versionOf || (async () => 1);

  return async function searchServices(query, context = {}) {
    try {
      const res = await classify(query, { lang_filter: context.lang });
      const hits = [];
      const push = (m) => { if (m && m.service_code) hits.push(m); };
      push(res.top_match);
      for (const a of res.alternatives || []) push(a);

      const out = [];
      for (const m of hits) {
        out.push({
          serviceId: m.service_code,
          title: m.service_name || m.service_code,
          domain: m.domain_code || undefined,
          level: 3,
          version: await versionOf(m.service_code),
          score: m.score,
        });
      }
      return out;
    } catch (err) {
      console.warn('[resolve.search/SERVICE] degraded:', err.message);
      return []; // graceful degradation
    }
  };
}

module.exports = { makeServiceBackend };
