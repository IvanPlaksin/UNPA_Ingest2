'use strict';

/**
 * M2 GLiNER + LLM Hybrid Extractor
 *
 * Three-stage pipeline:
 *   Stage 1 — GLiNER: fast zero-shot NER → entity candidates with scores
 *   Stage 2 — Confidence routing:
 *     score ≥ HIGH_CONFIDENCE (0.80)  → auto-accept
 *     score <  LOW_CONFIDENCE (0.40)  → discard
 *     middle zone                     → send to LLM for verification
 *   Stage 3 — Haiku (cheap): verify mid-confidence candidates + find new entities + extract relations
 *
 * Advantages over M1:
 *   - Much lower LLM token usage (only mid-confidence entities sent to Haiku)
 *   - GLiNER runs on GPU → fast, no API cost
 *   - Dual-signal confidence (GLiNER score × LLM confirmation)
 */

const Anthropic = require('@anthropic-ai/sdk');
const { isAllowed } = require('../../llm-access-control.service');
const { BaseExtractor } = require('./base-extractor');
const glinerClient = require('../../../../services/gliner/gliner.client');
const { EXTRACTION_SYSTEM_PROMPT, RELATION_TYPES, ENTITY_TYPES, EPISTEMIC_LAYERS } = require('../schemas/canonical');

const DEFAULT_MODEL    = process.env.EXTRACTION_M2_MODEL || 'claude-haiku-4-5-20251001';
const DEFAULT_MAX_TOKENS = 6144;
const HIGH_CONFIDENCE  = parseFloat(process.env.M2_HIGH_CONFIDENCE || '0.80');
const LOW_CONFIDENCE   = parseFloat(process.env.M2_LOW_CONFIDENCE  || '0.40');

// Lazy-init Anthropic client
let _client = null;
function client() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// ── verify_and_extract tool schema ───────────────────────────────────────────

const VERIFY_TOOL = {
  name: 'verify_and_extract',
  description: 'Verify GLiNER entity candidates, reject false positives, discover new entities, and extract all relations.',
  input_schema: {
    type: 'object',
    properties: {
      verified_entities: {
        type: 'array',
        description: 'GLiNER candidates confirmed as valid entities',
        items: {
          type: 'object',
          properties: {
            name:           { type: 'string' },
            type:           { type: 'string', enum: ENTITY_TYPES },
            epistemicLayer: { type: 'string', enum: EPISTEMIC_LAYERS },
            confidence:     { type: 'number' },
            evidence:       { type: 'string' },
          },
          required: ['name', 'type', 'confidence'],
        },
      },
      rejected_entity_names: {
        type: 'array',
        description: 'Names of GLiNER candidates that are false positives',
        items: { type: 'string' },
      },
      new_entities: {
        type: 'array',
        description: 'Entities found by LLM that GLiNER missed entirely',
        items: {
          type: 'object',
          properties: {
            name:           { type: 'string' },
            type:           { type: 'string', enum: ENTITY_TYPES },
            epistemicLayer: { type: 'string', enum: EPISTEMIC_LAYERS },
            confidence:     { type: 'number' },
            evidence:       { type: 'string' },
          },
          required: ['name', 'type', 'confidence'],
        },
      },
      relations: {
        type: 'array',
        description: 'All relations between entities (GLiNER does not extract relations)',
        items: {
          type: 'object',
          properties: {
            sourceEntity: { type: 'string' },
            targetEntity: { type: 'string' },
            type:         { type: 'string', enum: RELATION_TYPES },
            confidence:   { type: 'number' },
            evidence:     { type: 'string' },
          },
          required: ['sourceEntity', 'targetEntity', 'type', 'confidence'],
        },
      },
    },
    required: ['verified_entities', 'rejected_entity_names', 'new_entities', 'relations'],
  },
};

// ── M2 Extractor ─────────────────────────────────────────────────────────────

class M2GlinerHybridExtractor extends BaseExtractor {
  constructor(options = {}) {
    super(options);
    this.model        = options.model     || DEFAULT_MODEL;
    this.maxTokens    = options.maxTokens || DEFAULT_MAX_TOKENS;
    this.highConf     = options.highConfidence || HIGH_CONFIDENCE;
    this.lowConf      = options.lowConfidence  || LOW_CONFIDENCE;
    this.methodology  = 'M2';
  }

  /**
   * Extract entities and relations using GLiNER → confidence routing → Haiku verify.
   *
   * @param {string} docId        - Document UUID
   * @param {string} text         - Full document text
   * @param {Object[]} [existing] - Known entities from Memgraph (for pre-marking)
   * @returns {Promise<ExtractionResult>}
   */
  async extract(docId, text, existing = []) {
    if (!isAllowed('direct:m2_gliner_hybrid')) {
      throw new Error('[LLMAccessControl] M2 GLiNER Hybrid Extractor is disabled');
    }

    const startTotal = Date.now();

    // ── Stage 1: GLiNER NER ─────────────────────────────────────────────────
    const glinerStart = Date.now();
    let glinerCandidates = [];
    let glinerAvailable = false;
    try {
      glinerCandidates = await glinerClient.extractEntities(text, { threshold: this.lowConf });
      glinerAvailable = true;
    } catch (err) {
      // GLiNER unavailable → fall through with empty candidates (all goes to LLM)
    }
    const glinerTimeMs = Date.now() - glinerStart;

    // ── Stage 2: Confidence routing ─────────────────────────────────────────
    const autoAccepted = [];
    const midZone = [];

    for (const c of glinerCandidates) {
      const score = c.score || 0;
      if (score >= this.highConf) {
        autoAccepted.push(c);
      } else {
        // LOW_CONFIDENCE threshold already applied by glinerClient (threshold param)
        midZone.push(c);
      }
    }

    // Pre-mark existing entities in the text
    const inputText = text.slice(0, this.textLimit);
    const { processedText, markCount } = this._premark(inputText, existing);

    // ── Stage 3: LLM verification (Haiku) ───────────────────────────────────
    const llmStart = Date.now();

    const midDesc = midZone.length > 0
      ? midZone.map(c => `- "${c.text}" [${c.canonical_type || c.label}] score=${c.score.toFixed(2)}`).join('\n')
      : '(none — all candidates above threshold were auto-accepted)';

    const autoAcceptedDesc = autoAccepted.length > 0
      ? autoAccepted.map(c => `- "${c.text}" [${c.canonical_type || c.label}] score=${c.score.toFixed(2)}`).join('\n')
      : '(none)';

    const userPrompt =
      `Analyze this UN document and do THREE things:\n` +
      `1. Verify the mid-confidence GLiNER candidates (accept or reject each)\n` +
      `2. Find any important entities that GLiNER missed\n` +
      `3. Extract all meaningful relations between entities\n\n` +
      `## Auto-accepted (high confidence, no review needed):\n${autoAcceptedDesc}\n\n` +
      `## Mid-confidence candidates needing verification:\n${midDesc}\n\n` +
      `## Document text:\n${processedText}`;

    const response = await client().messages.create({
      model:      this.model,
      max_tokens: this.maxTokens,
      system:     EXTRACTION_SYSTEM_PROMPT,
      tools:      [VERIFY_TOOL],
      tool_choice: { type: 'tool', name: 'verify_and_extract' },
      messages: [{ role: 'user', content: userPrompt }],
    });

    const llmTimeMs = Date.now() - llmStart;

    const inputTokens  = response.usage?.input_tokens  || 0;
    const outputTokens = response.usage?.output_tokens || 0;

    const toolBlock = response.content.find(b => b.type === 'tool_use');
    if (!toolBlock) {
      throw new Error('M2: Claude did not call the verify_and_extract tool');
    }

    const raw = toolBlock.input;

    // ── Merge: auto-accepted (GLiNER) + LLM-verified + LLM-new ─────────────
    return this._buildResult(docId, {
      autoAccepted,
      verifiedEntities:   raw.verified_entities   || [],
      rejectedEntityNames: raw.rejected_entity_names || [],
      newEntities:        raw.new_entities        || [],
      relations:          raw.relations           || [],
    }, {
      glinerTimeMs, llmTimeMs,
      inputTokens, outputTokens,
      truncated: text.length > this.textLimit,
      markCount,
      glinerAvailable,
      glinerCandidates: glinerCandidates.length,
    });
  }

  // ── Result builder ──────────────────────────────────────────────────────────

  _buildResult(docId, merged, meta) {
    const { autoAccepted, verifiedEntities, newEntities, relations, rejectedEntityNames } = merged;
    const rejectedSet = new Set((rejectedEntityNames || []).map(n => n.toLowerCase()));

    // Convert GLiNER auto-accepted to canonical entities
    const fromGliner = autoAccepted.map(c => ({
      name:           String(c.text || '').trim(),
      type:           this._normalizeEntityType(c.canonical_type || c.label),
      epistemicLayer: null,
      confidence:     c.score || this.highConf,
      evidence:       null,
      sourceMethodology: 'M2:gliner',
    })).filter(e => e.name.length > 1 && !rejectedSet.has(e.name.toLowerCase()));

    // LLM-verified mid-zone entities
    const fromVerified = verifiedEntities.map(e => ({
      name:           String(e.name || '').trim(),
      type:           this._normalizeEntityType(e.type),
      epistemicLayer: e.epistemicLayer || null,
      confidence:     Math.max(0, Math.min(1, Number(e.confidence) || 0.60)),
      evidence:       e.evidence || null,
      sourceMethodology: 'M2:verified',
    })).filter(e => e.name.length > 1);

    // LLM-discovered new entities
    const fromNew = newEntities.map(e => ({
      name:           String(e.name || '').trim(),
      type:           this._normalizeEntityType(e.type),
      epistemicLayer: e.epistemicLayer || null,
      confidence:     Math.max(0, Math.min(1, Number(e.confidence) || 0.50)),
      evidence:       e.evidence || null,
      sourceMethodology: 'M2:new',
    })).filter(e => e.name.length > 1 && e.confidence >= this.confidenceThreshold);

    // Deduplicate by normalized name across all sources
    const { v4: uuidv4 } = require('uuid');
    const seenNames = new Set();
    const entities = [];
    for (const raw of [...fromGliner, ...fromVerified, ...fromNew]) {
      const key = raw.name.toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      entities.push({ id: uuidv4(), ...raw });
    }

    const nameMap = this._buildNameMap(entities);
    const uniqueRelations = this._buildRelations(relations, nameMap);

    const totalTimeMs = meta.glinerTimeMs + meta.llmTimeMs;

    return {
      docId,
      runId:      uuidv4(),
      methodology: 'M2',
      summary:    null,
      keyProvisions: [],
      entities,
      relations:  uniqueRelations,
      metrics: {
        totalTimeMs,
        glinerTimeMs:    meta.glinerTimeMs,
        llmTimeMs:       meta.llmTimeMs,
        llmCalls:        1,
        inputTokens:     meta.inputTokens,
        outputTokens:    meta.outputTokens,
        cost:            this._calcCostHaiku(meta.inputTokens, meta.outputTokens),
        glinerEntities:  meta.glinerCandidates,
        autoAccepted:    fromGliner.length + (merged.rejectedEntityNames?.length || 0),
        verifiedEntities: fromVerified.length,
        rejectedEntities: merged.rejectedEntityNames?.length || 0,
        newEntities:     fromNew.length,
        entitiesFiltered: entities.length,
        relationsFiltered: uniqueRelations.length,
        textLength:      Math.min(meta.truncated ? this.textLimit : 99999, 99999),
        truncated:       meta.truncated,
        premarked:       meta.markCount,
        glinerAvailable: meta.glinerAvailable,
      },
      metadata: {
        modelUsed:     this.model,
        schemaVersion: '1.0.0',
        extractedAt:   new Date().toISOString(),
        confidenceThreshold: this.confidenceThreshold,
        highConfThreshold: this.highConf,
        lowConfThreshold:  this.lowConf,
      },
    };
  }
}

module.exports = { M2GlinerHybridExtractor };
