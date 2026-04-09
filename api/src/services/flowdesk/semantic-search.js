'use strict';

/**
 * TASK-FLOWDESK-004 Phase 5: Semantic Search Service for AI-1 Intent Classification.
 *
 * Classifies user intent by embedding the query and searching Qdrant for closest service matches.
 *
 * Usage:
 *   const { classifyUserIntent, init } = require('./semantic-search');
 *   await init();
 *   const result = await classifyUserIntent("I need a new laptop");
 */

const TEI_URL = process.env.TEI_URL || 'http://localhost:8081';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'flowdesk_services';

async function init() {
  // Verify TEI and Qdrant are reachable
  const [tei, qdrant] = await Promise.all([
    fetch(`${TEI_URL}/info`).then(r => r.json()),
    fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`).then(r => r.json()),
  ]);
  console.log(`  TEI: ${tei.model_id} (dim: ${tei.max_input_length})`);
  console.log(`  Qdrant: ${COLLECTION_NAME} (${qdrant.result?.points_count} points)`);
}

async function generateEmbedding(text) {
  const resp = await fetch(`${TEI_URL}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: [text] }),
  });
  if (!resp.ok) throw new Error(`TEI error: ${resp.status}`);
  const vectors = await resp.json();
  return vectors[0];
}

async function searchQdrant(vector, limit = 10, filter = null) {
  const body = {
    vector,
    limit,
    with_payload: true,
    score_threshold: 0.3,
  };
  if (filter) body.filter = filter;

  const resp = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  return data.result || [];
}

/**
 * Aggregate search results by service_code, picking the best score per service.
 */
function aggregateByService(results) {
  const byService = {};
  for (const hit of results) {
    const code = hit.payload.service_code;
    if (!byService[code] || hit.score > byService[code].score) {
      byService[code] = {
        service_code: code,
        service_name: hit.payload.service_name,
        domain_code: hit.payload.domain_code,
        category: hit.payload.category,
        score: hit.score,
        matched_utterance: hit.payload.text,
        lang: hit.payload.lang,
      };
    }
  }
  return Object.values(byService).sort((a, b) => b.score - a.score);
}

/**
 * Calculate confidence level based on score and gap to second result.
 */
function calculateConfidence(results) {
  if (results.length === 0) return { level: 'unclassified', score: 0 };

  const top = results[0].score;
  const second = results[1]?.score || 0;
  const gap = top - second;

  if (top >= 0.85 && gap >= 0.15) return { level: 'high', score: top };
  if (top >= 0.70 && gap >= 0.10) return { level: 'medium', score: top };
  if (top >= 0.55) return { level: 'low', score: top };
  return { level: 'unclassified', score: top };
}

/**
 * Classify user intent using semantic search.
 *
 * @param {string} userText - Raw user input text
 * @param {object} [options] - Optional filters
 * @param {string} [options.domain_filter] - Filter by domain code
 * @param {string} [options.lang_filter] - Filter by language
 * @param {number} [options.limit] - Max results (default 10)
 * @returns {object} ClassificationResult
 */
async function classifyUserIntent(userText, options = {}) {
  // 1. Generate embedding for user text
  const embedding = await generateEmbedding(userText);

  // 2. Build Qdrant filter
  let filter = null;
  const conditions = [];
  if (options.domain_filter) {
    conditions.push({ key: 'domain_code', match: { value: options.domain_filter } });
  }
  if (options.lang_filter) {
    conditions.push({ key: 'lang', match: { value: options.lang_filter } });
  }
  if (conditions.length > 0) {
    filter = { must: conditions };
  }

  // 3. Search Qdrant
  const rawResults = await searchQdrant(embedding, options.limit || 10, filter);

  // 4. Aggregate by service
  const aggregated = aggregateByService(rawResults);

  // 5. Calculate confidence
  const confidence = calculateConfidence(aggregated);

  return {
    top_match: aggregated[0] || null,
    alternatives: aggregated.slice(1, 4),
    confidence: confidence.level,
    confidence_score: confidence.score,
    raw_results_count: rawResults.length,
  };
}

module.exports = { init, classifyUserIntent, generateEmbedding };
