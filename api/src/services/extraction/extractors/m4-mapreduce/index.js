'use strict';

/**
 * M4 MapReduce Extractor
 *
 * Handles documents of any length by splitting into overlapping chunks,
 * mapping each in parallel (Haiku), collapsing in-memory, then reducing
 * with a single Sonnet call for global consolidation.
 *
 * Stages:
 *   CHUNK  → split text into 8K-char chunks with 500-char overlap
 *   MAP    → parallel Haiku extraction (concurrency=5)
 *   COLLAPSE → merge entities/relations in-memory, detect type conflicts
 *   REDUCE → single Sonnet call: resolve conflicts, find cross-chunk rels, summarise
 */

const { isAllowed } = require('../../../llm-access-control.service');
const { BaseExtractor } = require('../base-extractor');
const { chunkText }    = require('./chunker');
const { mapAllChunks } = require('./mapper');
const { collapse }     = require('./collapser');
const { reduce }       = require('./reducer');
const { RELATION_WEIGHTS } = require('../../schemas/canonical');
const { v4: uuidv4 }   = require('uuid');

class M4MapReduceExtractor extends BaseExtractor {
  constructor(options = {}) {
    super(options);
    this.methodology  = 'M4';
    this.textLimit    = null; // no limit — handles any length
    this.mapModel     = options.mapModel     || undefined; // defaults to mapper constant
    this.reduceModel  = options.reduceModel  || undefined; // defaults to reducer constant
  }

  /**
   * @param {string} docId
   * @param {string} text          - full document text (any length)
   * @param {Object[]} [existing]  - known entities for pre-marking context
   */
  async extract(docId, text, existing = []) {
    if (!isAllowed('direct:m4_mapreduce')) {
      throw new Error('[LLMAccessControl] M4 MapReduce Extractor is disabled');
    }

    const startTotal = Date.now();

    // ── CHUNK ────────────────────────────────────────────────────────────────
    const chunks = chunkText(text);

    // ── MAP ──────────────────────────────────────────────────────────────────
    const mapStart = Date.now();
    const chunkResults = await mapAllChunks(chunks, {
      documentType: 'UN document',
    }, this.mapModel);
    const mapTimeMs = Date.now() - mapStart;

    // ── COLLAPSE ─────────────────────────────────────────────────────────────
    const collapseStart = Date.now();
    const collapsed = collapse(chunkResults);
    const collapseTimeMs = Date.now() - collapseStart;

    // ── REDUCE ───────────────────────────────────────────────────────────────
    const reduceStart = Date.now();
    const reduced = await reduce(collapsed, this.reduceModel);
    const reduceTimeMs = Date.now() - reduceStart;

    // ── Merge results ─────────────────────────────────────────────────────────
    return this._buildResult(docId, collapsed, reduced, {
      chunks: chunks.length,
      mapTimeMs,
      collapseTimeMs,
      reduceTimeMs,
      totalTimeMs: Date.now() - startTotal,
      mapTokens: collapsed.tokenTotals,
      reduceInputTokens:  reduced.inputTokens,
      reduceOutputTokens: reduced.outputTokens,
    });
  }

  // ── Result builder ──────────────────────────────────────────────────────────

  _buildResult(docId, collapsed, reduced, meta) {
    const { entities: rawEntities, relations: rawRelations } = collapsed;
    const { resolvedEntities, crossChunkRelations, summary, keyProvisions } = reduced;

    // Apply type resolutions from Reducer
    const resolutionMap = new Map(
      resolvedEntities.map(r => [r.name.toLowerCase(), r])
    );

    const entities = rawEntities
      .slice(0, this.maxEntities)
      .map(e => {
        const resolution = resolutionMap.get(e.canonical.toLowerCase());
        return {
          id:             uuidv4(),
          name:           e.canonical,
          type:           resolution ? this._normalizeEntityType(resolution.correctType) : this._normalizeEntityType(e.type),
          epistemicLayer: resolution?.epistemicLayer || e.epistemicLayer || null,
          confidence:     Math.max(0, Math.min(1, Number(e.confidence) || 0.5)),
          evidence:       e.evidence || null,
          chunkCount:     e.chunks?.length || 1,
          sourceMethodology: 'M4',
        };
      })
      .filter(e => e.name.length > 1 && e.confidence >= this.confidenceThreshold);

    const nameMap = this._buildNameMap(entities);

    // Merge in-chunk relations + cross-chunk relations from Reducer
    const allRawRelations = [
      ...rawRelations,
      ...crossChunkRelations.map(r => ({ ...r, isCrossChunk: true })),
    ];

    const seenRel = new Set();
    const relations = [];
    for (const r of allRawRelations.slice(0, this.maxRelations * 2)) {
      const srcId = nameMap.get((r.sourceEntity || '').toLowerCase());
      const tgtId = nameMap.get((r.targetEntity || '').toLowerCase());
      if (!srcId || !tgtId || srcId === tgtId) continue;
      const relType = this._normalizeRelationType(r.type);
      const key = `${srcId}::${relType}::${tgtId}`;
      if (seenRel.has(key)) continue;
      seenRel.add(key);
      relations.push({
        id:             uuidv4(),
        sourceEntityId: srcId,
        targetEntityId: tgtId,
        sourceEntity:   r.sourceEntity,
        targetEntity:   r.targetEntity,
        type:           relType,
        confidence:     Math.max(0, Math.min(1, Number(r.confidence) || 0.5)),
        strength:       RELATION_WEIGHTS[relType] || 0.20,
        evidence:       r.evidence || null,
        isCrossChunk:   r.isCrossChunk || false,
        sourceMethodology: 'M4',
      });
      if (relations.length >= this.maxRelations) break;
    }

    const mapCost    = this._calcCostHaiku(meta.mapTokens.inputTokens, meta.mapTokens.outputTokens);
    const reduceCost = this._calcCostSonnet(meta.reduceInputTokens, meta.reduceOutputTokens);

    return {
      docId,
      runId:       uuidv4(),
      methodology: 'M4',
      summary,
      keyProvisions,
      entities,
      relations,
      metrics: {
        totalTimeMs:    meta.totalTimeMs,
        mapTimeMs:      meta.mapTimeMs,
        collapseTimeMs: meta.collapseTimeMs,
        reduceTimeMs:   meta.reduceTimeMs,
        chunks:         meta.chunks,
        llmCalls:       meta.chunks + 1, // N map + 1 reduce
        mapInputTokens:    meta.mapTokens.inputTokens,
        mapOutputTokens:   meta.mapTokens.outputTokens,
        reduceInputTokens: meta.reduceInputTokens,
        reduceOutputTokens: meta.reduceOutputTokens,
        totalInputTokens:  meta.mapTokens.inputTokens + meta.reduceInputTokens,
        totalOutputTokens: meta.mapTokens.outputTokens + meta.reduceOutputTokens,
        mapCost,
        reduceCost,
        cost:               mapCost + reduceCost,
        typeConflicts:      collapsed.conflicts.length,
        crossChunkRelations: crossChunkRelations.length,
        entitiesRaw:     rawEntities.length,
        relationsRaw:    rawRelations.length + crossChunkRelations.length,
        entitiesFiltered: entities.length,
        relationsFiltered: relations.length,
      },
      metadata: {
        modelUsed:     `map:haiku / reduce:sonnet`,
        schemaVersion: '1.0.0',
        extractedAt:   new Date().toISOString(),
        confidenceThreshold: this.confidenceThreshold,
      },
    };
  }
}

module.exports = { M4MapReduceExtractor };
