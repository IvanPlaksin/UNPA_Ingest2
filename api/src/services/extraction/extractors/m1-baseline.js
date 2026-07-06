'use strict';

const { isAllowed } = require('../../llm-access-control.service');

/**
 * M1 Baseline Extractor
 *
 * Single-pass extraction using Anthropic SDK with tool_use (structured output).
 * Replaces the two-subprocess pipeline (Phase 1 entities + Phase 2 relations)
 * with one direct SDK call — 0% parse errors, no spawn overhead.
 *
 * Supports two modes:
 *   mode: 'SDK'        — direct Anthropic API (production)
 *   mode: 'SUBPROCESS' — claude.exe CLI fallback (dev/cost-saving)
 */

const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');
const {
  EXTRACTION_TOOL,
  EXTRACTION_SYSTEM_PROMPT,
  RELATION_WEIGHTS,
  ENTITY_TYPES,
  RELATION_TYPES,
} = require('../schemas/canonical');

const DEFAULT_MODEL   = process.env.EXTRACTION_M1_MODEL   || 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_TEXT_LIMIT = 18000;
const MAX_ENTITIES    = 80;
const MAX_RELATIONS   = 80;
const CONFIDENCE_THRESHOLD = 0.25;

// Lazy-init Anthropic client
let _client = null;
function client() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// ── Type normalisation maps ───────────────────────────────────────────────────
const ENTITY_TYPE_SET  = new Set(ENTITY_TYPES);
const RELATION_TYPE_SET = new Set(RELATION_TYPES);

function normalizeEntityType(raw) {
  const up = (raw || '').toUpperCase().trim();
  if (ENTITY_TYPE_SET.has(up)) return up;
  // Common aliases
  const aliases = {
    'ORG': 'ORGANIZATION', 'BODY': 'ORGANIZATION',
    'DOC': 'DOCUMENT', 'DOCREF': 'DOCUMENTREF',
    'TECH': 'TECHNOLOGY', 'PROC': 'PROCESS',
  };
  return aliases[up] || 'CONCEPT';
}

function normalizeRelationType(raw) {
  const up = (raw || '').toUpperCase().replace(/[\s-]+/g, '_').trim();
  if (RELATION_TYPE_SET.has(up)) return up;
  return 'RELATED_TO';
}

// ── M1 Extractor ─────────────────────────────────────────────────────────────

class M1BaselineExtractor {
  constructor(options = {}) {
    this.model        = options.model        || DEFAULT_MODEL;
    this.maxTokens    = options.maxTokens    || DEFAULT_MAX_TOKENS;
    this.textLimit    = options.textLimit    || DEFAULT_TEXT_LIMIT;
    this.maxEntities  = options.maxEntities  || MAX_ENTITIES;
    this.maxRelations = options.maxRelations || MAX_RELATIONS;
    this.confidenceThreshold = options.confidenceThreshold || CONFIDENCE_THRESHOLD;
    this.methodology  = 'M1';
  }

  /**
   * Extract entities and relations from a document.
   *
   * @param {string} docId        - Document UUID
   * @param {string} text         - Full document text
   * @param {Object[]} [existing] - Pre-marked entities from Memgraph [{name, type, id}]
   * @returns {Promise<ExtractionResult>}
   */
  async extract(docId, text, existing = []) {
    if (!isAllowed('direct:m1_baseline')) {
      throw new Error('[LLMAccessControl] M1 Baseline Extractor (direct SDK) is disabled');
    }

    const startTime = Date.now();

    // Pre-mark existing entities in text
    const { processedText, markCount } = this._premark(text, existing);
    const truncated = processedText.length > this.textLimit;
    const inputText = truncated ? processedText.slice(0, this.textLimit) : processedText;

    // Single SDK call with forced tool_use
    const response = await client().messages.create({
      model:      this.model,
      max_tokens: this.maxTokens,
      system:     EXTRACTION_SYSTEM_PROMPT,
      tools:      [EXTRACTION_TOOL],
      tool_choice: { type: 'tool', name: 'extract_knowledge' },
      messages: [{
        role:    'user',
        content: `Extract all entities and relations from this UN document:\n\n${inputText}`,
      }],
    });

    const totalTimeMs    = Date.now() - startTime;
    const inputTokens    = response.usage?.input_tokens  || 0;
    const outputTokens   = response.usage?.output_tokens || 0;

    // Extract tool_use result block (always present when tool_choice is forced)
    const toolBlock = response.content.find(b => b.type === 'tool_use');
    if (!toolBlock) {
      throw new Error('M1: Claude did not call the extraction tool');
    }

    const raw = toolBlock.input;
    return this._buildResult(docId, raw, {
      totalTimeMs, inputTokens, outputTokens,
      inputText, truncated, markCount,
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Insert [[ENT:id:type:name]] markers into text so the model reuses known entities.
   */
  _premark(text, existing) {
    if (!existing.length) return { processedText: text, markCount: 0 };
    let processedText = text;
    let markCount = 0;
    for (const e of existing) {
      if (!e.name || e.name.length < 3) continue;
      const escaped = e.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'gi');
      if (re.test(processedText)) {
        processedText = processedText.replace(re, `[[ENT:${e.id || ''}:${e.type}:${e.name}]]`);
        markCount++;
      }
    }
    return { processedText, markCount };
  }

  /**
   * Transform raw tool output into canonical ExtractionResult.
   */
  _buildResult(docId, raw, meta) {
    const rawEntities  = (raw.entities  || []).slice(0, this.maxEntities);
    const rawRelations = (raw.relations || []).slice(0, this.maxRelations);

    // Build entities with UUIDs
    const entities = rawEntities.map(e => ({
      id:             uuidv4(),
      name:           String(e.name || '').trim(),
      type:           normalizeEntityType(e.type),
      epistemicLayer: e.epistemicLayer || null,
      confidence:     Math.max(0, Math.min(1, Number(e.confidence) || 0.5)),
      evidence:       e.evidence || null,
      sourceMethodology: 'M1',
    })).filter(e => e.name.length > 1 && e.confidence >= this.confidenceThreshold);

    // Build name → id lookup
    const nameMap = new Map(entities.map(e => [e.name.toLowerCase(), e.id]));

    // Build relations (filter low-confidence + resolve entity IDs)
    const relations = rawRelations
      .filter(r => (Number(r.confidence) || 0) >= this.confidenceThreshold)
      .map(r => {
        const srcId = nameMap.get(String(r.sourceEntity || '').toLowerCase());
        const tgtId = nameMap.get(String(r.targetEntity || '').toLowerCase());
        if (!srcId || !tgtId || srcId === tgtId) return null;
        const relType = normalizeRelationType(r.type);
        return {
          id:             uuidv4(),
          sourceEntityId: srcId,
          targetEntityId: tgtId,
          sourceEntity:   r.sourceEntity,
          targetEntity:   r.targetEntity,
          type:           relType,
          confidence:     Math.max(0, Math.min(1, Number(r.confidence) || 0.5)),
          strength:       RELATION_WEIGHTS[relType] || 0.20,
          evidence:       r.evidence || null,
          sourceMethodology: 'M1',
        };
      })
      .filter(Boolean);

    // Deduplicate relations by (src::type::tgt) key
    const seen = new Set();
    const uniqueRelations = relations.filter(r => {
      const key = `${r.sourceEntityId}::${r.type}::${r.targetEntityId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      docId,
      runId:      uuidv4(),
      methodology: 'M1',
      summary:    raw.summary       || null,
      keyProvisions: raw.keyProvisions || [],
      entities,
      relations:  uniqueRelations,
      metrics: {
        totalTimeMs:     meta.totalTimeMs,
        llmCalls:        1,
        inputTokens:     meta.inputTokens,
        outputTokens:    meta.outputTokens,
        cost:            this._calcCost(meta.inputTokens, meta.outputTokens),
        entitiesRaw:     rawEntities.length,
        relationsRaw:    rawRelations.length,
        entitiesFiltered: entities.length,
        relationsFiltered: uniqueRelations.length,
        textLength:      meta.inputText.length,
        truncated:       meta.truncated,
        premarked:       meta.markCount,
      },
      metadata: {
        modelUsed:     this.model,
        schemaVersion: '1.0.0',
        extractedAt:   new Date().toISOString(),
        confidenceThreshold: this.confidenceThreshold,
      },
    };
  }

  _calcCost(inputTokens, outputTokens) {
    // claude-sonnet-4-6: $3/MTok input, $15/MTok output
    return (inputTokens * 3 + outputTokens * 15) / 1_000_000;
  }
}

module.exports = { M1BaselineExtractor };
