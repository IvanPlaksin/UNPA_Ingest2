'use strict';

/**
 * resolve.search — Contract 3 reference stub + fan-out orchestration.
 *
 * Defines the ORCHESTRATION (SR-ref detection, fan-out, typed-union assembly,
 * cross-type ranking, limit) as production-ready logic, with the three data
 * backends injected. Default backends are inert stubs (empty / TODO) so the
 * shape is exercisable without live infra. The production wiring (C3, step 11)
 * supplies real backends:
 *   - SERVICE:   Qdrant `flowdesk_services` via semantic-search.js (READY)
 *   - ARTICLE:   platform knowledge (Qdrant doc-collections + SourceDocument),
 *                namespace-filtered  (TODO — adapter)
 *   - SR_STATUS: Memgraph tickets + in-memory requests store (TODO — adapter)
 *
 * Typed union per CODEX-RULE-074; callers branch on `.type`.
 *
 * @module instances/flowdesk/contracts/resolve-search.stub
 */

const SR_REF_RE = /\b((?:SR|INC)-\d{3,})\b/i;

const DEFAULT_LIMIT = 5;

// Semantic confidence tiers — mirrors semantic-search.js calculateConfidence.
function tierFromScore(score, gap) {
  if (score >= 0.85 && gap >= 0.15) return 'high';
  if (score >= 0.70 && gap >= 0.10) return 'medium';
  return 'low';
}

// ── Inert default backends (replaced in production) ─────────────────────────
const inertBackends = {
  // → [{ serviceId, title, domain, level, version, score }]
  async searchServices(/* query, context */) { return []; },
  // → [{ articleId, title, summary, sourceCollection, answerSnippet?, score }]
  async searchArticles(/* query, context */) { return []; },
  // → { srNumber, status, title, createdAt, updatedAt } | null
  async getSRStatus(/* srNumber, context */) { return null; },
};

/**
 * @param {string} query
 * @param {Object} context  - UserContext {userId, missionId?, locationCode?, roles[], lang}
 * @param {Object} [opts]
 * @param {Object} [opts.backends] - {searchServices, searchArticles, getSRStatus}
 * @param {number} [opts.limit]
 * @returns {Promise<Array>} ResolveResult[]
 */
async function resolveSearch(query, context, opts = {}) {
  const backends = { ...inertBackends, ...(opts.backends || {}) };
  const limit = opts.limit || DEFAULT_LIMIT;
  const results = [];

  // 1. SR_STATUS — exact ref match takes priority, score 1.0.
  const refMatch = (query || '').match(SR_REF_RE);
  if (refMatch) {
    const srNumber = refMatch[1].toUpperCase();
    const sr = await backends.getSRStatus(srNumber, context);
    if (sr) {
      results.push({
        type: 'SR_STATUS',
        srNumber: sr.srNumber || srNumber,
        status: sr.status,
        ...(sr.title ? { title: sr.title } : {}),
        ...(sr.createdAt ? { createdAt: sr.createdAt } : {}),
        ...(sr.updatedAt ? { updatedAt: sr.updatedAt } : {}),
        score: 1.0,
      });
    }
  }

  // 2. SERVICE — semantic catalog search.
  const svc = await backends.searchServices(query, context);
  const svcSorted = [...svc].sort((a, b) => b.score - a.score);
  svcSorted.forEach((s, i) => {
    const gap = s.score - (svcSorted[i + 1]?.score || 0);
    results.push({
      type: 'SERVICE',
      serviceId: s.serviceId,
      title: s.title,
      ...(s.domain ? { domain: s.domain } : {}),
      ...(s.level !== undefined ? { level: s.level } : {}),
      schemaRef: { serviceId: s.serviceId, version: s.version || 1 },
      score: s.score,
      confidence: tierFromScore(s.score, gap),
    });
  });

  // 3. ARTICLE — platform knowledge (deflection).
  const arts = await backends.searchArticles(query, context);
  const artsSorted = [...arts].sort((a, b) => b.score - a.score);
  artsSorted.forEach((a, i) => {
    const gap = a.score - (artsSorted[i + 1]?.score || 0);
    results.push({
      type: 'ARTICLE',
      articleId: a.articleId,
      title: a.title,
      ...(a.summary ? { summary: a.summary } : {}),
      ...(a.sourceCollection ? { sourceCollection: a.sourceCollection } : {}),
      ...(a.answerSnippet ? { answerSnippet: a.answerSnippet } : {}),
      score: a.score,
      confidence: tierFromScore(a.score, gap),
    });
  });

  // 4. Cross-type ranking: SR_STATUS exact (score 1.0) first, then by score desc.
  results.sort((a, b) => {
    if (a.type === 'SR_STATUS' && b.type !== 'SR_STATUS') return -1;
    if (b.type === 'SR_STATUS' && a.type !== 'SR_STATUS') return 1;
    return b.score - a.score;
  });

  return results.slice(0, limit);
}

module.exports = { resolveSearch, SR_REF_RE, tierFromScore, DEFAULT_LIMIT };
