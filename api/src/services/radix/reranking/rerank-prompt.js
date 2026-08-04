/**
 * Reranking prompt and output schema.
 *
 * @module services/radix/reranking/rerank-prompt
 */

'use strict';

/**
 * Characters of a candidate shown to the reranker.
 *
 * Length is capped so every candidate is judged on comparable evidence. A source
 * chunk carries hundreds of words while a draft carries a name and a sentence;
 * handing the model both at full length lets the longer text win on surface area
 * rather than on relevance, which would quietly undo the separate draft/chunk
 * quotas. The FULL content still goes into the final prompt — the cap applies
 * only to what the reranker weighs.
 */
const CONTENT_LIMIT = 800;

/**
 * Forces the model to return positions rather than prose, so the result is
 * machine-checkable and a malformed answer is detectable rather than guessed at.
 */
const RERANK_SCHEMA = Object.freeze({
  type: 'object',
  description: 'Relevance ranking of the supplied candidates',
  properties: {
    ranking: {
      type: 'array',
      description:
        'Candidate indices ordered by relevance to the query, most relevant '
        + 'first. Include every index exactly once.',
      items: { type: 'integer' }
    }
  },
  required: ['ranking']
});

/**
 * @param {Object} candidate
 * @param {number} [limit=CONTENT_LIMIT]
 * @returns {string}
 */
function truncateForRerank(candidate, limit = CONTENT_LIMIT) {
  const content = (candidate && candidate.content) || '';
  return content.length > limit ? `${content.slice(0, limit)}…` : content;
}

/**
 * Builds the ranking prompt.
 *
 * @param {string} query
 * @param {Object[]} candidates
 * @param {number} [limit]
 * @returns {string}
 */
function buildRerankPrompt(query, candidates, limit = CONTENT_LIMIT) {
  const listed = candidates
    .map((candidate, index) => {
      const meta = candidate.metadata || {};
      const label = meta.draftType || candidate.type || 'item';
      const name = meta.name || candidate.id;
      return `[${index}] (${label}) ${name}\n${truncateForRerank(candidate, limit)}`;
    })
    .join('\n\n');

  return `You are ranking retrieved knowledge for relevance to a user's query.

Query: ${query}

Candidates:

${listed}

Rank ALL ${candidates.length} candidates by how directly they help answer the query.
Judge relevance to the query only — ignore how long a candidate is, and do not
prefer a passage merely because it contains more text.
Return every index from 0 to ${candidates.length - 1} exactly once, most relevant first.`;
}

module.exports = {
  CONTENT_LIMIT,
  RERANK_SCHEMA,
  buildRerankPrompt,
  truncateForRerank
};
