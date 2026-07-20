'use strict';

/**
 * ARTICLE retrieval backend (C3) — platform knowledge base for Tier-0 deflection.
 * Embeds the query via TEI and searches a Qdrant doc-collection, namespace-
 * filtered to FlowDesk-relevant knowledge. Extracts an answerSnippet for the
 * KB/deflection branch.
 *
 * This is the R2 "ARTICLE gap" adapter: it connects the platform's document
 * knowledge to the FlowDesk chat without exposing platform executors.
 *
 * @module instances/flowdesk/services/backends/article.backend
 */

const DEFAULT_COLLECTION = process.env.FLOWDESK_KB_COLLECTION || 'altiora_knowledge';
// Altiora = the FlowDesk knowledge domain. The chat may ONLY read KB entries in
// this namespace (N1). Override via FLOWDESK_KB_NAMESPACE.
const DEFAULT_NAMESPACE = process.env.FLOWDESK_KB_NAMESPACE || 'Altiora';

/**
 * @param {Object} [deps]
 * @param {Function} [deps.embed]        - (text) => Promise<number[]>
 * @param {Function} [deps.qdrantSearch] - (collection, vector, {limit, filter}) => hits[]
 * @param {string}   [deps.collection]
 * @param {string}   [deps.namespace]
 */
function makeArticleBackend(deps = {}) {
  const collection = deps.collection || DEFAULT_COLLECTION;
  const namespace = deps.namespace || DEFAULT_NAMESPACE;

  const embed = deps.embed || (async (text) => {
    const { embedViaTei } = require('../../../../services/ai/llm-provider/embedding');
    return embedViaTei(text);
  });

  const qdrantSearch = deps.qdrantSearch || (async (coll, vector, { limit, filter }) => {
    const url = process.env.QDRANT_URL || 'http://localhost:6333';
    const body = { vector, limit, with_payload: true, score_threshold: 0.3 };
    if (filter) body.filter = filter;
    const resp = await fetch(`${url}/collections/${coll}/points/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`Qdrant ${resp.status}`);
    const data = await resp.json();
    return data.result || [];
  });

  return async function searchArticles(query, context = {}) {
    try {
      const vector = await embed(query);
      const filter = namespace ? { must: [{ key: 'namespace', match: { value: namespace } }] } : null;
      const hits = await qdrantSearch(collection, vector, { limit: 5, filter });
      return hits.map((h) => {
        const p = h.payload || {};
        return {
          articleId: p.articleId || p.doc_id || String(h.id),
          title: p.title || p.heading || '(untitled)',
          summary: p.summary || undefined,
          sourceCollection: p.sourceCollection || collection,
          answerSnippet: p.answerSnippet || p.text || p.chunk || undefined,
          score: h.score,
        };
      });
    } catch (err) {
      console.warn('[resolve.search/ARTICLE] degraded:', err.message);
      return []; // graceful degradation (collection may not exist yet)
    }
  };
}

module.exports = { makeArticleBackend, DEFAULT_COLLECTION, DEFAULT_NAMESPACE };
