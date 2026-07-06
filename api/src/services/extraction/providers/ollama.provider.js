/**
 * Ollama LLM Provider for Entity Extraction
 * @module services/extraction/providers/ollama
 */

'use strict';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';
const TIMEOUT = 300000; // 5 minutes — llama3 8B can be slow on CPU
const { isAllowed } = require('../../llm-access-control.service');

/**
 * Check if Ollama is available
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  if (!isAllowed('extraction:ollama')) {
    console.log('[Ollama] Disabled by LLM Access Control');
    return false;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) return false;

    const data = await res.json();
    const available = data.models?.some(m => m.name.includes(OLLAMA_MODEL));

    if (available) {
      console.log(`[Ollama] Available with model: ${OLLAMA_MODEL}`);
    }

    return available;
  } catch (err) {
    console.warn(`[Ollama] Not available: ${err.message}`);
    return false;
  }
}

/**
 * Extract entities using Ollama
 * @param {string} text - Text to analyze
 * @param {Object} options - Extraction options
 * @param {string} [options.model] - Specific model to use (e.g. 'llama4', 'phi4')
 * @returns {Promise<{entities: Array, relationships: Array}>}
 */
async function extractEntities(text, options = {}) {
  // Use model from options if provided, otherwise use default
  const model = options.model || OLLAMA_MODEL;
  console.log(`[Ollama] Using model: ${model}`);

  const prompt = buildPrompt(text);

  try {
    const controller = new AbortController();
    // Activity-based timeout: resets on each chunk received
    let timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
    const resetTimeout = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
    };

    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt,
        stream: true,
        options: {
          temperature: 0.1,
          num_predict: 2048
        }
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      clearTimeout(timeoutId);
      throw new Error(`Ollama returned ${res.status}`);
    }

    // Accumulate streaming NDJSON response
    let fullResponse = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      resetTimeout(); // Keep alive while tokens are flowing

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.response) fullResponse += obj.response;
        } catch (_) { /* skip malformed lines */ }
      }
    }

    clearTimeout(timeoutId);
    return parseResponse(fullResponse);
  } catch (err) {
    console.error(`[Ollama] Extraction failed: ${err.message}`);
    throw err;
  }
}

/**
 * Build extraction prompt
 * @param {string} text - Text to analyze
 * @returns {string} Formatted prompt
 */
function buildPrompt(text) {
  return `Extract entities and relationships from text. Output ONLY raw JSON, no markdown.

Entity types: SYSTEM, DATABASE, TECHNOLOGY, ORGANIZATION, DOCUMENT, PERSON, PROCESS, CONCEPT
Relationship types: USES, PART_OF, INTEGRATES_WITH, DEPENDS_ON, RELATED_TO

Text: "${text.substring(0, 3000)}"

Output format (strict JSON, no comments):
{"entities":[{"name":"Example","type":"SYSTEM","confidence":0.9}],"relationships":[{"source":"A","target":"B","type":"USES","confidence":0.8}]}

JSON:`;
}

/**
 * Attempt to fix common JSON errors
 * @param {string} jsonStr - Potentially broken JSON
 * @returns {string} Fixed JSON
 */
function attemptJsonFix(jsonStr) {
  let fixed = jsonStr;
  // Remove trailing commas before ] or }
  fixed = fixed.replace(/,(\s*[\]}])/g, '$1');
  // Remove control characters
  fixed = fixed.replace(/[\x00-\x1F\x7F]/g, ' ');
  return fixed;
}

/**
 * Parse LLM response to extract JSON
 * @param {string} response - Raw LLM response
 * @returns {{entities: Array, relationships: Array}}
 */
function parseResponse(response) {
  try {
    // Clean markdown if present
    let cleanResponse = response
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    // Try to extract JSON from response
    const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[Ollama] No JSON found in response');
      return { entities: [], relationships: [] };
    }

    let jsonStr = jsonMatch[0];
    let parsed;

    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      // Try to fix common JSON issues
      jsonStr = attemptJsonFix(jsonStr);
      try {
        parsed = JSON.parse(jsonStr);
      } catch (fixErr) {
        console.error('[Ollama] JSON parse failed after fix attempt');
        return { entities: [], relationships: [] };
      }
    }

    // Normalize entities
    const entities = (parsed.entities || []).map(e => ({
      name: e.name || '',
      type: normalizeType(e.type),
      normalizedForm: (e.name || '').toLowerCase().replace(/\s+/g, '_'),
      confidence: Math.min(e.confidence || 0.75, 0.95),
      source: 'llm-ollama'
    })).filter(e => e.name && e.name.length > 1);

    // Normalize relationships
    const relationships = (parsed.relationships || []).map(r => ({
      source: r.source || '',
      target: r.target || '',
      type: r.type || 'RELATED_TO',
      confidence: Math.min(r.confidence || 0.70, 0.90),
      extractionSource: 'llm-ollama'
    })).filter(r => r.source && r.target);

    console.log(`[Ollama] Extracted ${entities.length} entities, ${relationships.length} relationships`);

    return { entities, relationships };
  } catch (err) {
    console.error('[Ollama] Parse error:', err.message);
    return { entities: [], relationships: [] };
  }
}

/**
 * Normalize entity type
 * @param {string} type - Raw type from LLM
 * @returns {string} Normalized type
 */
function normalizeType(type) {
  if (!type) return 'UNKNOWN';

  const normalized = type.toUpperCase().replace(/[^A-Z_]/g, '');

  const validTypes = [
    'SYSTEM', 'DATABASE', 'TECHNOLOGY', 'ORGANIZATION',
    'DOCUMENT', 'PERSON', 'PROCESS', 'CONCEPT',
    'MODULE', 'API', 'TEAM', 'PROJECT'
  ];

  if (validTypes.includes(normalized)) {
    return normalized;
  }

  // Type mapping for common variants
  const typeMap = {
    'SERVICE': 'SYSTEM',
    'PLATFORM': 'SYSTEM',
    'APPLICATION': 'SYSTEM',
    'FRAMEWORK': 'TECHNOLOGY',
    'LIBRARY': 'TECHNOLOGY',
    'TOOL': 'TECHNOLOGY',
    'DEPARTMENT': 'ORGANIZATION',
    'UNIT': 'ORGANIZATION',
    'AGENCY': 'ORGANIZATION'
  };

  return typeMap[normalized] || 'UNKNOWN';
}

module.exports = {
  isAvailable,
  extractEntities,
  name: 'ollama'
};
