/**
 * Relation Extractor Service
 *
 * Extracts relationships between entities from text using LLM.
 * Takes previously extracted entities as context.
 *
 * Separate from entity extraction per iText2KG research
 * to avoid "LLM forgetting effect".
 *
 * @module services/workspace/extraction/relation.extractor
 */

'use strict';

const { getPrompt, fillPrompt } = require('./prompts');
const { chunkText } = require('./entity.extractor');

const LOG_PREFIX = '[RelationExtractor]';

let _llm = null;
function llm() {
  if (!_llm) {
    const { getInstance: getLLMProvider } = require('../../llm/LLMProviderService');
    _llm = getLLMProvider();
  }
  return _llm;
}

const CONFIG = {
  maxChunkSize: 10000,
  chunkOverlap: 400,
  maxTokens: 4000,
  temperature: 0.1,
  minConfidence: 0.5
};

const VALID_TYPES = [
  'HAS', 'BELONGS_TO', 'CONTAINS', 'PART_OF',
  'CREATES', 'MODIFIES', 'DELETES', 'READS',
  'DEPENDS_ON', 'REFERENCES', 'IMPLEMENTS',
  'MANAGES', 'OWNS', 'APPROVES', 'REVIEWS',
  'TRIGGERS', 'CAUSES', 'PRECEDES', 'FOLLOWS',
  'SIMILAR_TO', 'OPPOSITE_OF', 'RELATED_TO'
];

/**
 * Extract relations between entities
 * @param {string} text - Source text
 * @param {Object[]} entities - Previously extracted entities
 * @param {Object} options
 * @returns {Promise<{success, relations[], stats, log[]}>}
 */
async function extractRelations(text, entities, options = {}) {
  const { documentType = 'UNKNOWN', domain = 'GENERAL', onProgress } = options;
  const startTime = Date.now();
  const log = [];

  const addLog = (msg, level = 'info') => {
    log.push({ timestamp: new Date().toISOString(), level, message: msg });
    console.log(`${LOG_PREFIX} ${msg}`);
  };

  try {
    if (!entities || entities.length === 0) {
      addLog('No entities provided — skipping relation extraction');
      return { success: true, relations: [], stats: { durationMs: 0 }, log };
    }

    addLog(`Starting relation extraction. ${entities.length} entities, ${text.length} chars`);

    const entitiesJson = entities.map(e => ({ name: e.name, type: e.type, description: e.description }));
    const chunks = chunkText(text, CONFIG.maxChunkSize, CONFIG.chunkOverlap);
    addLog(`Split into ${chunks.length} chunk(s)`);

    const allRelations = [];

    for (let i = 0; i < chunks.length; i++) {
      addLog(`Processing chunk ${i + 1}/${chunks.length}`);
      if (onProgress) onProgress({ phase: 'extracting_relations', current: i + 1, total: chunks.length });

      const prompt = fillPrompt(getPrompt('relationship'), {
        documentType,
        domain,
        entitiesJson,
        text: chunks[i]
      });

      const response = await llm().chat(
        [{ role: 'user', content: prompt }],
        { maxTokens: CONFIG.maxTokens, temperature: CONFIG.temperature }
      );

      const rawRC = response?.content;
      const responseText = Array.isArray(rawRC)
        ? rawRC.filter(b => b.type === 'text').map(b => b.text).join('')
        : (rawRC || '');
      const parsed = parseRelationsFromResponse(responseText);

      if (parsed.relations.length > 0) {
        addLog(`Chunk ${i + 1}: extracted ${parsed.relations.length} relations`);

        // Validate each relation against known entities
        const validated = parsed.relations
          .map(r => validateRelation(r, entities))
          .filter(r => r !== null);

        allRelations.push(...validated);
      } else {
        addLog(`Chunk ${i + 1}: no relations found`, 'warn');
      }
    }

    addLog(`Total raw relations: ${allRelations.length}`);

    // Deduplicate
    const deduplicated = deduplicateRelations(allRelations);
    addLog(`Deduplicated: ${deduplicated.length}`);

    // Add confidence
    const withConfidence = deduplicated.map(r => ({
      ...r,
      confidence: calculateRelationConfidence(r, text, entities)
    }));

    const filtered = withConfidence.filter(r => r.confidence >= CONFIG.minConfidence);
    filtered.sort((a, b) => b.confidence - a.confidence);

    const duration = Date.now() - startTime;
    addLog(`Done in ${duration}ms. Final: ${filtered.length} relations`);

    return {
      success: true,
      relations: filtered,
      stats: {
        chunksProcessed: chunks.length,
        rawRelations: allRelations.length,
        finalRelations: filtered.length,
        durationMs: duration
      },
      log
    };
  } catch (error) {
    addLog(`Failed: ${error.message}`, 'error');
    return { success: false, relations: [], error: error.message, stats: { durationMs: Date.now() - startTime }, log };
  }
}

// ── PARSING ─────────────────────────────────────────────────

function parseRelationsFromResponse(response) {
  const errors = [];
  let jsonStr = response;

  const codeMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeMatch) jsonStr = codeMatch[1].trim();

  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (arrayMatch) jsonStr = arrayMatch[0];

  try {
    const parsed = JSON.parse(jsonStr);
    const relations = Array.isArray(parsed) ? parsed
      : parsed.relations ? parsed.relations
      : [parsed];
    return { relations, errors };
  } catch (e) {
    errors.push(`JSON parse error: ${e.message}`);
    return { relations: [], errors };
  }
}

// ── VALIDATION ──────────────────────────────────────────────

function validateRelation(relation, entities) {
  if (!relation.sourceEntity || !relation.targetEntity || !relation.relationshipType) {
    return null;
  }

  // Normalize type
  const type = relation.relationshipType.toUpperCase().replace(/\s+/g, '_');
  if (!VALID_TYPES.includes(type)) {
    // Try mapping
    const mapped = type.replace(/-/g, '_');
    if (!VALID_TYPES.includes(mapped)) {
      relation.relationshipType = 'RELATED_TO'; // fallback
    } else {
      relation.relationshipType = mapped;
    }
  } else {
    relation.relationshipType = type;
  }

  // Check entities exist (fuzzy match)
  const entityNames = entities.map(e => e.name.toLowerCase());
  const srcExists = entityNames.some(n =>
    n === relation.sourceEntity.toLowerCase() ||
    n.includes(relation.sourceEntity.toLowerCase()) ||
    relation.sourceEntity.toLowerCase().includes(n)
  );
  const tgtExists = entityNames.some(n =>
    n === relation.targetEntity.toLowerCase() ||
    n.includes(relation.targetEntity.toLowerCase()) ||
    relation.targetEntity.toLowerCase().includes(n)
  );

  if (!srcExists && !tgtExists) return null; // Both unknown — skip

  return relation;
}

// ── DEDUPLICATION ────────────────────────────────────────────

function deduplicateRelations(relations) {
  const seen = new Set();
  return relations.filter(r => {
    const key = `${r.sourceEntity}|${r.relationshipType}|${r.targetEntity}`.toLowerCase();
    const reverseKey = `${r.targetEntity}|${r.relationshipType}|${r.sourceEntity}`.toLowerCase();
    if (seen.has(key) || (r.bidirectional && seen.has(reverseKey))) return false;
    seen.add(key);
    return true;
  });
}

// ── CONFIDENCE ──────────────────────────────────────────────

function calculateRelationConfidence(relation, text, entities) {
  let score = 0.5;

  if (relation.description?.length > 10) score += 0.1;
  if (relation.cardinality) score += 0.05;

  // Check if both entities are mentioned near each other in text
  const textLower = text.toLowerCase();
  const src = relation.sourceEntity.toLowerCase();
  const tgt = relation.targetEntity.toLowerCase();

  const srcIdx = textLower.indexOf(src);
  const tgtIdx = textLower.indexOf(tgt);

  if (srcIdx >= 0 && tgtIdx >= 0) {
    const distance = Math.abs(srcIdx - tgtIdx);
    if (distance < 200) score += 0.2;
    else if (distance < 500) score += 0.1;
    else score += 0.05;
  }

  // Both entities in extracted set
  const entityNames = new Set(entities.map(e => e.name.toLowerCase()));
  if (entityNames.has(src)) score += 0.05;
  if (entityNames.has(tgt)) score += 0.05;

  return Math.min(score, 1.0);
}

module.exports = {
  extractRelations,
  parseRelationsFromResponse,
  validateRelation,
  deduplicateRelations,
  CONFIG
};
