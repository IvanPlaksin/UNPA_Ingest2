'use strict';

/**
 * Shared TEI embedding helper for all LLM providers (CODEX-RULE-073: one
 * embedding backend, not per-provider). Backs LLMProvider.embedding().
 *
 * @module services/ai/llm-provider/embedding
 */

const DEFAULT_TEI_URL = process.env.TEI_URL || 'http://localhost:8081';

/**
 * @param {string} text
 * @param {Object} [opts]
 * @param {string} [opts.teiUrl]
 * @param {Function} [opts.fetchImpl] - test seam
 * @returns {Promise<number[]>}
 */
async function embedViaTei(text, opts = {}) {
  const teiUrl = opts.teiUrl || DEFAULT_TEI_URL;
  const doFetch = opts.fetchImpl || fetch;
  const resp = await doFetch(`${teiUrl}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: [text] }),
  });
  if (!resp.ok) throw new Error(`TEI embed error: ${resp.status}`);
  const vectors = await resp.json();
  return vectors[0];
}

module.exports = { embedViaTei, DEFAULT_TEI_URL };
