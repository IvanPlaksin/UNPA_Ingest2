/**
 * Entity Extractor Service
 *
 * Extracts business entities from text using LLM.
 * Implements chunking for long documents, validation, and deduplication.
 *
 * Based on iText2KG research: entities extracted separately from relations
 * to avoid "LLM forgetting effect".
 *
 * @module services/workspace/extraction/entity.extractor
 */

'use strict';

const { getPrompt, fillPrompt } = require('./prompts');

const LOG_PREFIX = '[EntityExtractor]';

let _llm = null;
function llm() {
  if (!_llm) {
    const { getInstance: getLLMProvider } = require('../../llm/LLMProviderService');
    _llm = getLLMProvider();
  }
  return _llm;
}

const CONFIG = {
  maxChunkSize: 12000,
  chunkOverlap: 500,
  maxTokens: 4000,
  temperature: 0.1,
  minConfidence: 0.5,
  similarityThreshold: 0.85
};

/**
 * Extract entities from text
 * @param {string} text - Source text
 * @param {Object} options
 * @param {string} [options.documentType]
 * @param {string} [options.domain]
 * @param {Function} [options.onProgress]
 * @returns {Promise<{success, entities[], stats, log[]}>}
 */
async function extractEntities(text, options = {}) {
  const { documentType = 'UNKNOWN', domain = 'GENERAL', onProgress } = options;
  const startTime = Date.now();
  const log = [];

  const addLog = (message, level = 'info') => {
    log.push({ timestamp: new Date().toISOString(), level, message });
    if (level === 'error') console.error(`${LOG_PREFIX} ${message}`);
    else console.log(`${LOG_PREFIX} ${message}`);
  };

  try {
    addLog(`Starting entity extraction. Text: ${text.length} chars`);

    // Chunk text
    const chunks = chunkText(text, CONFIG.maxChunkSize, CONFIG.chunkOverlap);
    addLog(`Split into ${chunks.length} chunk(s)`);
    if (onProgress) onProgress({ phase: 'chunking', total: chunks.length });

    // Extract from each chunk
    const allEntities = [];

    for (let i = 0; i < chunks.length; i++) {
      addLog(`Processing chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`);
      if (onProgress) onProgress({ phase: 'extracting', current: i + 1, total: chunks.length });

      const prompt = fillPrompt(getPrompt('entity'), {
        documentType,
        domain,
        text: chunks[i]
      });

      // Call LLM via chat interface
      const response = await llm().chat(
        [{ role: 'user', content: prompt }],
        { maxTokens: CONFIG.maxTokens, temperature: CONFIG.temperature, caller: 'workspace_agent' }
      );

      const rawRC = response?.content;
      const responseText = Array.isArray(rawRC)
        ? rawRC.filter(b => b.type === 'text').map(b => b.text).join('')
        : (rawRC || response?.text || '');
      const parsed = parseEntitiesFromResponse(responseText);

      if (parsed.entities.length > 0) {
        addLog(`Chunk ${i + 1}: extracted ${parsed.entities.length} entities`);
        const enriched = parsed.entities.map(e => ({
          ...e,
          _sourceChunk: i,
          _confidence: calculateConfidence(e, chunks[i])
        }));
        allEntities.push(...enriched);
      } else {
        addLog(`Chunk ${i + 1}: no entities found`, 'warn');
      }

      if (parsed.errors.length > 0) {
        parsed.errors.forEach(err => addLog(`Parse: ${err}`, 'warn'));
      }
    }

    addLog(`Total raw entities: ${allEntities.length}`);

    // Validate
    const validated = allEntities.filter(entity => {
      const v = validateEntity(entity);
      if (!v.valid) addLog(`Invalid "${entity.name}": ${v.errors.join(', ')}`, 'warn');
      return v.valid;
    });
    addLog(`Validated: ${validated.length}`);

    // Deduplicate
    const deduplicated = deduplicateEntities(validated);
    addLog(`Deduplicated: ${deduplicated.length}`);

    // Filter by confidence
    const filtered = deduplicated.filter(e => e._confidence >= CONFIG.minConfidence);
    filtered.sort((a, b) => b._confidence - a._confidence);

    // Clean output
    const entities = filtered.map(({ _sourceChunk, _confidence, ...rest }) => ({
      ...rest,
      confidence: _confidence
    }));

    const duration = Date.now() - startTime;
    addLog(`Done in ${duration}ms. Final: ${entities.length} entities`);
    if (onProgress) onProgress({ phase: 'complete', count: entities.length });

    return {
      success: true,
      entities,
      stats: {
        chunksProcessed: chunks.length,
        rawEntities: allEntities.length,
        validatedEntities: validated.length,
        deduplicatedEntities: deduplicated.length,
        finalEntities: entities.length,
        durationMs: duration
      },
      log
    };
  } catch (error) {
    addLog(`Failed: ${error.message}`, 'error');
    return {
      success: false,
      entities: [],
      error: error.message,
      stats: { durationMs: Date.now() - startTime },
      log
    };
  }
}

// ── CHUNKING ────────────────────────────────────────────────

function chunkText(text, maxSize, overlap) {
  if (text.length <= maxSize) return [text];

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxSize;

    if (end < text.length) {
      const paraBreak = text.lastIndexOf('\n\n', end);
      if (paraBreak > start + maxSize * 0.5) {
        end = paraBreak;
      } else {
        const sentBreak = text.lastIndexOf('. ', end);
        if (sentBreak > start + maxSize * 0.5) end = sentBreak + 1;
      }
    }

    chunks.push(text.slice(start, Math.min(end, text.length)).trim());
    start = end - overlap;
    if (start >= text.length - overlap) break;
  }

  return chunks;
}

// ── RESPONSE PARSING ────────────────────────────────────────

function parseEntitiesFromResponse(response) {
  const errors = [];
  let jsonStr = response;

  // Extract from markdown code block
  const codeMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeMatch) jsonStr = codeMatch[1].trim();

  // Find JSON array
  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (arrayMatch) jsonStr = arrayMatch[0];

  try {
    const parsed = JSON.parse(jsonStr);
    let entities = Array.isArray(parsed) ? parsed
      : parsed.entities && Array.isArray(parsed.entities) ? parsed.entities
      : typeof parsed === 'object' ? [parsed] : [];
    return { entities, errors };
  } catch (e) {
    errors.push(`JSON parse error: ${e.message}`);

    // Recovery: extract individual objects
    const recovered = [];
    for (const match of response.matchAll(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g)) {
      try {
        const obj = JSON.parse(match[0]);
        if (obj.name && obj.type) recovered.push(obj);
      } catch { /* skip */ }
    }

    if (recovered.length > 0) {
      errors.push(`Recovered ${recovered.length} entities from malformed response`);
      return { entities: recovered, errors };
    }

    return { entities: [], errors };
  }
}

// ── VALIDATION ──────────────────────────────────────────────

const VALID_TYPES = ['BUSINESS_OBJECT', 'ACTOR', 'SYSTEM', 'DOCUMENT', 'LOCATION', 'EVENT', 'CONCEPT'];
const TYPE_MAP = {
  OBJECT: 'BUSINESS_OBJECT', BUSINESS: 'BUSINESS_OBJECT',
  PERSON: 'ACTOR', ROLE: 'ACTOR', USER: 'ACTOR',
  APPLICATION: 'SYSTEM', SERVICE: 'SYSTEM',
  FILE: 'DOCUMENT', REPORT: 'DOCUMENT',
  PLACE: 'LOCATION', AREA: 'LOCATION',
  ACTION: 'EVENT', PROCESS: 'EVENT',
  TERM: 'CONCEPT', DEFINITION: 'CONCEPT'
};

function validateEntity(entity) {
  const errors = [];
  if (!entity.name || typeof entity.name !== 'string') errors.push('missing name');
  if (!entity.type) {
    errors.push('missing type');
  } else if (!VALID_TYPES.includes(entity.type)) {
    const mapped = TYPE_MAP[entity.type.toUpperCase()];
    if (mapped) entity.type = mapped;
    else errors.push(`invalid type: ${entity.type}`);
  }
  if (!entity.description) errors.push('missing description');
  if (entity.name) entity.name = normalizeName(entity.name);
  return { valid: errors.length === 0, errors };
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, ' ').replace(/^(the|a|an)\s+/i, '');
}

// ── DEDUPLICATION ────────────────────────────────────────────

function deduplicateEntities(entities) {
  const unique = [];
  for (const entity of entities) {
    const existing = unique.find(u =>
      u.name.toLowerCase() === entity.name.toLowerCase() ||
      (u.aliases || []).some(a => a.toLowerCase() === entity.name.toLowerCase()) ||
      similarity(u.name, entity.name) >= CONFIG.similarityThreshold
    );
    if (existing) {
      if (entity._confidence > existing._confidence) {
        existing._confidence = entity._confidence;
        existing.description = entity.description;
      }
      const allAliases = new Set([...(existing.aliases || []), ...(entity.aliases || []), entity.name]);
      allAliases.delete(existing.name);
      existing.aliases = [...allAliases];
      if (entity.attributes?.length > 0) {
        existing.attributes = existing.attributes || [];
        const names = new Set(existing.attributes.map(a => a.name.toLowerCase()));
        for (const attr of entity.attributes) {
          if (!names.has(attr.name.toLowerCase())) {
            existing.attributes.push(attr);
            names.add(attr.name.toLowerCase());
          }
        }
      }
    } else {
      unique.push({ ...entity });
    }
  }
  return unique;
}

function similarity(a, b) {
  const s1 = a.toLowerCase(), s2 = b.toLowerCase();
  if (s1 === s2) return 1;
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (!longer.length) return 1;
  const matrix = [];
  for (let i = 0; i <= shorter.length; i++) { matrix[i] = [i]; }
  for (let j = 0; j <= longer.length; j++) { matrix[0][j] = j; }
  for (let i = 1; i <= shorter.length; i++) {
    for (let j = 1; j <= longer.length; j++) {
      matrix[i][j] = shorter[i - 1] === longer[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return (longer.length - matrix[shorter.length][longer.length]) / longer.length;
}

// ── CONFIDENCE ──────────────────────────────────────────────

function calculateConfidence(entity, sourceText) {
  let score = 0.5;
  if (entity.name) score += 0.1;
  if (entity.type) score += 0.05;
  if (entity.description?.length > 20) score += 0.1;
  if (entity.attributes?.length > 0) score += 0.1;
  if (entity.domain) score += 0.05;

  const nameLower = (entity.name || '').toLowerCase();
  const textLower = sourceText.toLowerCase();
  const escaped = nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const occurrences = (textLower.match(new RegExp(escaped, 'g')) || []).length;
  if (occurrences >= 5) score += 0.15;
  else if (occurrences >= 2) score += 0.1;
  else if (occurrences >= 1) score += 0.05;

  if (entity.name?.includes(' ') && entity.name.length > 10) score += 0.05;
  return Math.min(score, 1.0);
}

module.exports = {
  extractEntities,
  chunkText,
  parseEntitiesFromResponse,
  validateEntity,
  deduplicateEntities,
  calculateConfidence,
  CONFIG
};
