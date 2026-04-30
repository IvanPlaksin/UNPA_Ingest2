/**
 * Claude (Anthropic) LLM Provider for Entity Extraction
 * @module services/extraction/providers/claude
 */

'use strict';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
const TIMEOUT = 60000;
const { getInstance: getLLMProvider } = require('../../llm/LLMProviderService');

/**
 * Check if Claude is available
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  const available = !!ANTHROPIC_API_KEY;
  if (available) {
    console.log(`[Claude] Available with model: ${CLAUDE_MODEL}`);
  } else {
    console.log('[Claude] Not configured (ANTHROPIC_API_KEY missing)');
  }
  return available;
}

/**
 * Extract entities using Claude
 * @param {string} text - Text to analyze
 * @param {Object} options - Extraction options
 * @param {string} [options.model] - Specific model to use (e.g. 'claude-haiku-4-5-20251001')
 * @returns {Promise<{entities: Array, relationships: Array}>}
 */
async function extractEntities(text, options = {}) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // Use model from options if provided, otherwise use default
  const model = options.model || CLAUDE_MODEL;
  console.log(`[Claude] Using model: ${model}`);

  const prompt = buildPrompt(text);

  try {
    const resp = await Promise.race([
      getLLMProvider().chat([{ role: 'user', content: prompt }], {
        model,
        maxTokens: 2048,
        temperature: 0.1,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Claude request timeout')), TIMEOUT))
    ]);

    const responseText = resp.content?.[0]?.text || resp.content || '';
    return parseResponse(responseText);
  } catch (err) {
    console.error(`[Claude] Extraction failed: ${err.message}`);
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

  // Remove any text before first { and after last }
  const firstBrace = fixed.indexOf('{');
  const lastBrace = fixed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    fixed = fixed.substring(firstBrace, lastBrace + 1);
  }

  // Remove trailing commas before ] or }
  fixed = fixed.replace(/,(\s*[\]}])/g, '$1');

  // Remove control characters and normalize whitespace
  fixed = fixed.replace(/[\x00-\x1F\x7F]/g, ' ');
  fixed = fixed.replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/\t/g, ' ');

  // Fix unquoted keys (simple cases)
  fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');

  // Fix single quotes to double quotes (but not within strings)
  fixed = fixed.replace(/:\s*'([^']*)'/g, ': "$1"');

  // Remove comments (// and /* */)
  fixed = fixed.replace(/\/\/[^\n]*/g, '');
  fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, '');

  // Fix multiple consecutive commas
  fixed = fixed.replace(/,\s*,+/g, ',');

  // Remove extra spaces
  fixed = fixed.replace(/\s+/g, ' ');

  return fixed;
}

/**
 * Parse LLM response to extract JSON
 * @param {string} response - Raw LLM response
 * @returns {{entities: Array, relationships: Array}}
 */
function parseResponse(response) {
  try {
    // Clean response - Claude sometimes wraps in markdown code blocks
    let cleanResponse = response
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    // Try to extract JSON from response
    const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[Claude] No JSON found in response');
      return { entities: [], relationships: [] };
    }

    let jsonStr = jsonMatch[0];
    let parsed;

    // Try parsing as-is first
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      // Try to fix common JSON issues
      console.warn('[Claude] Initial parse failed, attempting fixes...');
      jsonStr = attemptJsonFix(jsonStr);

      try {
        parsed = JSON.parse(jsonStr);
        console.log('[Claude] JSON fixed successfully');
      } catch (fixErr) {
        // Last resort: try to extract entities array separately
        console.warn('[Claude] Fix failed, attempting partial extraction...');

        const entitiesMatch = jsonStr.match(/"entities"\s*:\s*\[([\s\S]*?)\]/);
        const relsMatch = jsonStr.match(/"relationships"\s*:\s*\[([\s\S]*?)\]/);

        const entities = [];
        const relationships = [];

        if (entitiesMatch) {
          // Extract individual entity objects
          const entityRegex = /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"type"\s*:\s*"([^"]+)"(?:\s*,\s*"confidence"\s*:\s*([\d.]+))?\s*\}/g;
          let match;
          while ((match = entityRegex.exec(entitiesMatch[1])) !== null) {
            entities.push({
              name: match[1],
              type: normalizeType(match[2]),
              normalizedForm: match[1].toLowerCase().replace(/\s+/g, '_'),
              confidence: Math.min(parseFloat(match[3]) || 0.85, 0.98),
              source: 'llm-claude'
            });
          }
        }

        if (relsMatch) {
          const relRegex = /\{\s*"source"\s*:\s*"([^"]+)"\s*,\s*"target"\s*:\s*"([^"]+)"\s*,\s*"type"\s*:\s*"([^"]+)"(?:\s*,\s*"confidence"\s*:\s*([\d.]+))?\s*\}/g;
          let match;
          while ((match = relRegex.exec(relsMatch[1])) !== null) {
            relationships.push({
              source: match[1],
              target: match[2],
              type: match[3] || 'RELATED_TO',
              confidence: Math.min(parseFloat(match[4]) || 0.80, 0.95),
              extractionSource: 'llm-claude'
            });
          }
        }

        if (entities.length > 0 || relationships.length > 0) {
          console.log(`[Claude] Partial extraction: ${entities.length} entities, ${relationships.length} relationships`);
          return { entities, relationships };
        }

        console.error('[Claude] Complete parse failure');
        return { entities: [], relationships: [] };
      }
    }

    // Normalize entities
    const entities = (parsed.entities || []).map(e => ({
      name: e.name || '',
      type: normalizeType(e.type),
      normalizedForm: (e.name || '').toLowerCase().replace(/\s+/g, '_'),
      confidence: Math.min(e.confidence || 0.85, 0.98),
      source: 'llm-claude'
    })).filter(e => e.name && e.name.length > 1);

    // Normalize relationships
    const relationships = (parsed.relationships || []).map(r => ({
      source: r.source || '',
      target: r.target || '',
      type: r.type || 'RELATED_TO',
      confidence: Math.min(r.confidence || 0.80, 0.95),
      extractionSource: 'llm-claude'
    })).filter(r => r.source && r.target);

    console.log(`[Claude] Extracted ${entities.length} entities, ${relationships.length} relationships`);

    return { entities, relationships };
  } catch (err) {
    console.error('[Claude] Parse error:', err.message);
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
  name: 'claude'
};
