'use strict';

/**
 * BaseExtractor — shared logic for all extraction methodologies (M1–M6).
 *
 * Subclasses must implement:
 *   async extract(docId, text, existingEntities) → ExtractionResult
 *
 * Provided helpers:
 *   _premark(text, existing)                  → {processedText, markCount}
 *   _normalizeEntityType(raw)                 → canonical type string
 *   _normalizeRelationType(raw)               → canonical type string
 *   _buildEntities(rawEntities)               → Entity[]
 *   _buildRelations(rawRelations, nameMap)    → Relation[]
 *   _calcCostSonnet(inputTok, outputTok)      → USD number
 *   _calcCostHaiku(inputTok, outputTok)       → USD number
 *   _makeRunId()                              → UUID string
 */

const { v4: uuidv4 } = require('uuid');
const {
  ENTITY_TYPES,
  RELATION_TYPES,
  RELATION_WEIGHTS,
} = require('../schemas/canonical');

const ENTITY_TYPE_SET   = new Set(ENTITY_TYPES);
const RELATION_TYPE_SET = new Set(RELATION_TYPES);

const ENTITY_ALIASES = {
  'ORG': 'ORGANIZATION', 'BODY': 'ORGANIZATION', 'COMMITTEE': 'ORGANIZATION',
  'DOC': 'DOCUMENT', 'DOCREF': 'DOCUMENTREF', 'DOCUMENT REFERENCE': 'DOCUMENTREF',
  'TECH': 'TECHNOLOGY', 'PROC': 'PROCESS', 'WORK ITEM': 'WORK_ITEM',
};

const RELATION_ALIASES = {
  'ESTABLISHED BY': 'ESTABLISHED_BY', 'AUTHORED BY': 'AUTHORED_BY',
  'CHAIRED BY': 'CHAIRED_BY', 'FUNDED BY': 'FUNDED_BY',
  'REPORTS TO': 'REPORTS_TO', 'PART OF': 'PART_OF',
  'COOPERATES WITH': 'COOPERATES_WITH', 'RELATED TO': 'RELATED_TO',
};

class BaseExtractor {
  constructor(options = {}) {
    this.confidenceThreshold = options.confidenceThreshold ?? 0.25;
    this.maxEntities  = options.maxEntities  ?? 80;
    this.maxRelations = options.maxRelations ?? 80;
    this.textLimit    = options.textLimit    ?? 18000;
    this.methodology  = 'BASE'; // overridden by subclass
  }

  // ── Type normalisation ────────────────────────────────────────────────────

  _normalizeEntityType(raw) {
    const up = (raw || '').toUpperCase().trim();
    if (ENTITY_TYPE_SET.has(up)) return up;
    return ENTITY_ALIASES[up] || 'CONCEPT';
  }

  _normalizeRelationType(raw) {
    const up = (raw || '').toUpperCase().replace(/[\s-]+/g, '_').trim();
    if (RELATION_TYPE_SET.has(up)) return up;
    const spacedUp = (raw || '').toUpperCase().trim();
    return RELATION_ALIASES[spacedUp] || 'RELATED_TO';
  }

  // ── Pre-marking ───────────────────────────────────────────────────────────

  /**
   * Insert [[ENT:id:type:name]] markers so the model reuses known entity IDs.
   * Skips entities with name < 3 chars to avoid false-positive replacements.
   */
  _premark(text, existing = []) {
    if (!existing || !existing.length) return { processedText: text, markCount: 0 };
    let processedText = text;
    let markCount = 0;
    // Sort longest names first to avoid partial substitution of shorter names
    const sorted = [...existing].sort((a, b) => (b.name?.length || 0) - (a.name?.length || 0));
    for (const e of sorted) {
      if (!e.name || e.name.length < 3) continue;
      const escaped = e.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'gi');
      if (re.test(processedText)) {
        processedText = processedText.replace(re,
          `[[ENT:${e.id || ''}:${e.type || 'CONCEPT'}:${e.name}]]`);
        markCount++;
      }
    }
    return { processedText, markCount };
  }

  // ── Entity/relation builders ──────────────────────────────────────────────

  /**
   * Transform raw LLM entity objects into canonical Entity records.
   * Assigns UUIDs, normalises types, filters by confidence threshold.
   */
  _buildEntities(rawEntities = []) {
    return rawEntities
      .slice(0, this.maxEntities)
      .map(e => ({
        id:             uuidv4(),
        name:           String(e.name || '').trim(),
        type:           this._normalizeEntityType(e.type),
        epistemicLayer: e.epistemicLayer || null,
        confidence:     Math.max(0, Math.min(1, Number(e.confidence) || 0.5)),
        evidence:       e.evidence || null,
        sourceMethodology: this.methodology,
      }))
      .filter(e => e.name.length > 1 && e.confidence >= this.confidenceThreshold);
  }

  /**
   * Build canonical Relation records from raw LLM relations.
   * Resolves entity names → UUIDs via nameMap (lowercase name → id).
   * Deduplicates by (srcId::type::tgtId).
   */
  _buildRelations(rawRelations = [], nameMap) {
    const seen = new Set();
    return rawRelations
      .slice(0, this.maxRelations)
      .filter(r => (Number(r.confidence) || 0) >= this.confidenceThreshold)
      .map(r => {
        const srcId = nameMap.get(String(r.sourceEntity || '').toLowerCase());
        const tgtId = nameMap.get(String(r.targetEntity || '').toLowerCase());
        if (!srcId || !tgtId || srcId === tgtId) return null;
        const relType = this._normalizeRelationType(r.type);
        const key = `${srcId}::${relType}::${tgtId}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return {
          id:             uuidv4(),
          sourceEntityId: srcId,
          targetEntityId: tgtId,
          sourceEntity:   String(r.sourceEntity || ''),
          targetEntity:   String(r.targetEntity || ''),
          type:           relType,
          confidence:     Math.max(0, Math.min(1, Number(r.confidence) || 0.5)),
          strength:       RELATION_WEIGHTS[relType] || 0.20,
          evidence:       r.evidence || null,
          sourceMethodology: this.methodology,
        };
      })
      .filter(Boolean);
  }

  /** Build name → id lookup from an entity array. */
  _buildNameMap(entities) {
    return new Map(entities.map(e => [e.name.toLowerCase(), e.id]));
  }

  // ── Cost calculators ──────────────────────────────────────────────────────

  /** claude-sonnet-4-6: $3/MTok input, $15/MTok output */
  _calcCostSonnet(inputTokens, outputTokens) {
    return (inputTokens * 3 + outputTokens * 15) / 1_000_000;
  }

  /** claude-haiku-4-5: $0.25/MTok input, $1.25/MTok output */
  _calcCostHaiku(inputTokens, outputTokens) {
    return (inputTokens * 0.25 + outputTokens * 1.25) / 1_000_000;
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  _makeRunId() { return uuidv4(); }

  _now() { return new Date().toISOString(); }
}

module.exports = { BaseExtractor };
