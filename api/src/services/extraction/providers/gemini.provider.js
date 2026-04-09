/**
 * Gemini LLM Provider for Entity Extraction
 * @module services/extraction/providers/gemini
 */

'use strict';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT = 60000;

/**
 * Check if Gemini is available
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  const available = !!GEMINI_API_KEY;
  if (available) {
    console.log(`[Gemini] Available with model: ${GEMINI_MODEL}`);
  } else {
    console.log('[Gemini] Not configured (GEMINI_API_KEY missing)');
  }
  return available;
}

/**
 * Extract entities using Gemini
 * @param {string} text - Text to analyze
 * @param {Object} options - Extraction options
 * @param {string} [options.model] - Specific model to use (e.g. 'gemini-3-pro')
 * @returns {Promise<{entities: Array, relationships: Array}>}
 */
async function extractEntities(text, options = {}) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  // Use model from options if provided, otherwise use default
  const model = options.model || GEMINI_MODEL;
  console.log(`[Gemini] Using model: ${model}`);

  const prompt = buildPrompt(text);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

    const res = await fetch(
      `${GEMINI_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
            topP: 0.8,
            topK: 10
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
          ]
        }),
        signal: controller.signal
      }
    );
    clearTimeout(timeoutId);

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(`Gemini returned ${res.status}: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await res.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return parseResponse(responseText);
  } catch (err) {
    console.error(`[Gemini] Extraction failed: ${err.message}`);
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
    // Clean response - Gemini sometimes wraps in markdown code blocks
    let cleanResponse = response
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    // Try to extract JSON from response
    const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[Gemini] No JSON found in response');
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
        console.error('[Gemini] JSON parse failed after fix attempt');
        return { entities: [], relationships: [] };
      }
    }

    // Normalize entities
    const entities = (parsed.entities || []).map(e => ({
      name: e.name || '',
      type: normalizeType(e.type),
      normalizedForm: (e.name || '').toLowerCase().replace(/\s+/g, '_'),
      confidence: Math.min(e.confidence || 0.80, 0.95),
      source: 'llm-gemini'
    })).filter(e => e.name && e.name.length > 1);

    // Normalize relationships
    const relationships = (parsed.relationships || []).map(r => ({
      source: r.source || '',
      target: r.target || '',
      type: r.type || 'RELATED_TO',
      confidence: Math.min(r.confidence || 0.75, 0.90),
      extractionSource: 'llm-gemini'
    })).filter(r => r.source && r.target);

    console.log(`[Gemini] Extracted ${entities.length} entities, ${relationships.length} relationships`);

    return { entities, relationships };
  } catch (err) {
    console.error('[Gemini] Parse error:', err.message);
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
  name: 'gemini'
};
