'use strict';

/**
 * SERVICE retrieval backend (C3) — resolves a user's free-text intent to candidate
 * services. Two paths, tried in order:
 *
 *   1. HYBRID (IP-KB, default): the knowledge-base retrieval — embed the query,
 *      pull `schema_kb` vector hits, then JOIN each hit to the schema graph by the
 *      shared kbId (`ServiceKnowledge-[:DESCRIBES]->ServiceDef`) and hydrate graph
 *      signals. This is vector + graph via linkage, mirroring the project KB.
 *   2. FALLBACK: the original pure-vector semantic-search over `flowdesk_services`
 *      (aggregate by service_code). Used when nothing is indexed yet or hybrid is
 *      disabled — so there is no regression on un-indexed services.
 *
 * Toggle hybrid off with FLOWDESK_HYBRID_SERVICE_SEARCH=0.
 *
 * @module instances/flowdesk/services/backends/service.backend
 */

/**
 * @param {Object} [deps]
 * @param {Function} [deps.classify] - (query, opts) => semantic-search result (fallback path)
 * @param {Function} [deps.hybrid]   - (query, {lang}) => Promise<hybrid hit[]>
 * @param {boolean}  [deps.hybridEnabled] - override the FLOWDESK_HYBRID_SERVICE_SEARCH flag
 * @param {Function} [deps.versionOf] - (serviceId) => Promise<number> schemaRef version
 */
function makeServiceBackend(deps = {}) {
  const classify = deps.classify || (async (query, opts) => {
    const search = require('../semantic-search.js');
    return search.classifyUserIntent(query, opts || {});
  });
  const hybrid = deps.hybrid || (async (query, ctx) =>
    require('../schema-knowledge.service').hybridSearchServices(query, { lang: ctx.lang }));
  const hybridEnabled = deps.hybridEnabled != null
    ? deps.hybridEnabled
    : process.env.FLOWDESK_HYBRID_SERVICE_SEARCH !== '0';
  const versionOf = deps.versionOf || (async () => 1);

  // Lazy + best-effort: the backend is constructed in tests that stub none of this.
  const timed = async (kind, name, fn) => {
    try { return await require('../chat-telemetry.service').timed(kind, name, fn); }
    catch (err) { if (err && err.__telemetry) return fn(); throw err; }
  };

  return async function searchServices(query, context = {}) {
    // Path 1 — hybrid graph+vector retrieval via the knowledge base.
    if (hybridEnabled) {
      try {
        // The two retrieval paths are timed apart: when a search is slow the
        // question is always WHICH of them, and when one is down (TEI returning
        // 500 on a broken CUDA context, as it did on 2026-07-29) the fallback
        // hides it behind a normal-looking total.
        const found = await timed('search', 'services: hybrid (vector+graph)', () => hybrid(query, { lang: context.lang }));
        if (found && found.length) {
          const out = [];
          for (const m of found) {
            out.push({
              serviceId: m.serviceId,
              title: m.title || m.serviceId,
              domain: m.domain || undefined,
              level: 3,
              version: await versionOf(m.serviceId),
              score: m.score,
            });
          }
          return out;
        }
      } catch (err) {
        console.warn('[resolve.search/SERVICE] hybrid degraded, falling back:', err.message);
      }
    }

    // Path 2 — pure-vector fallback (unchanged behaviour).
    try {
      const res = await timed('search', 'services: vector classify', () => classify(query, { lang_filter: context.lang }));
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
