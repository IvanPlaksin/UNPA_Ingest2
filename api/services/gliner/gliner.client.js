'use strict';

/**
 * GLiNER service client — calls the FastAPI microservice at GLINER_URL.
 *
 * Used by M2 (GLiNER+LLM hybrid) and M3 (GLiNER-Relex joint) extractors.
 * Falls back gracefully so the caller can decide whether to skip or fail.
 */

const GLINER_URL = process.env.GLINER_URL || 'http://localhost:5100';
const TIMEOUT_MS = parseInt(process.env.GLINER_TIMEOUT_MS || '10000', 10);

async function _post(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${GLINER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GLiNER ${path} HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract named entities from text.
 * @returns {Promise<Array<{text,label,canonical_type,score,start,end}>>}
 */
async function extractEntities(text, { labels = null, threshold = 0.30 } = {}) {
  const result = await _post('/ner', { text, labels, threshold });
  return result.entities || [];
}

/**
 * Extract entities from multiple texts (for M5 batch route).
 * @returns {Promise<Array<Array<{text,label,canonical_type,score,start,end}>>>}
 */
async function extractBatch(texts, { labels = null, threshold = 0.30 } = {}) {
  const result = await _post('/batch', { texts, labels, threshold });
  return (result.results || []).map(r => r.entities || []);
}

/**
 * Check if the GLiNER service is reachable and the model is loaded.
 * @returns {Promise<{available:boolean, modelLoaded:boolean, error?:string}>}
 */
async function ping() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${GLINER_URL}/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { available: false, modelLoaded: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { available: true, modelLoaded: data.model_loaded === true };
  } catch (e) {
    return { available: false, modelLoaded: false, error: e.message };
  }
}

module.exports = { extractEntities, extractBatch, ping };
