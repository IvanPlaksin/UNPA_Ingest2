'use strict';

/**
 * Methodology Registry — Strategy Pattern
 *
 * Central registry for all extraction methodologies (M1–M6).
 * Each methodology is an extractor class implementing:
 *   - extract(docId, text, existingEntities?) → Promise<ExtractionResult>
 *   - methodology: string (M1 / M2 / M3 / M4 / M5 / M6)
 *
 * Integration points:
 *   - Variant A: POST /api/extraction/run   (direct endpoint for comparison)
 *   - Variant C: unified-queue mode=METHODOLOGY  (BullMQ production pipeline)
 */

const { M1BaselineExtractor }          = require('./extractors/m1-baseline');
const { M2GlinerHybridExtractor }       = require('./extractors/m2-gliner-hybrid');
const { M2GlinerCCodeHybridExtractor }  = require('./extractors/m2-gliner-ccode-hybrid');
const { M4MapReduceExtractor }          = require('./extractors/m4-mapreduce/index');

// ── Methodology metadata ─────────────────────────────────────────────────────
const METHODOLOGY_CATALOG = {
  M1: {
    id:          'M1',
    name:        'Baseline LLM (SDK)',
    description: 'Single-pass Claude extraction via Anthropic SDK. Structured output through tool_use — no parse errors, no subprocess overhead. Best for standard documents up to 18K chars.',
    class:       M1BaselineExtractor,
    requiresGLiNER:  false,
    supportsBatch:   false,
    supportsStream:  true,
    maxDocSize:      18000,
    estimatedTimeSec: '30–60',
    estimatedCostUSD: '~$0.10',
    quality:         '⭐⭐⭐⭐',
    available:       true,
  },
  // M2–M6 registered after implementation
  M2: {
    id:          'M2',
    name:        'GLiNER + LLM Hybrid',
    description: 'GLiNER encoder pre-extracts entity candidates (~100ms), confidence routing (≥0.80 auto-accept, <0.40 discard, mid → Haiku verify). Extracts relations via Haiku. 3× cheaper than M1.',
    class:       M2GlinerHybridExtractor,
    requiresGLiNER:  true,
    supportsBatch:   false,
    supportsStream:  true,
    maxDocSize:      18000,
    estimatedTimeSec: '20–40',
    estimatedCostUSD: '~$0.03',
    quality:         '⭐⭐⭐⭐',
    available:       true,
  },
  M2C: {
    id:          'M2C',
    name:        'GLiNER + CCode Hybrid',
    description: 'Same as M2 (GLiNER pre-filter + confidence routing) but Stage 3 verification runs via Claude Code CLI instead of the Anthropic SDK. No direct API cost — uses the Claude Code provider configured in the project.',
    class:       M2GlinerCCodeHybridExtractor,
    requiresGLiNER:  true,
    supportsBatch:   false,
    supportsStream:  true,
    maxDocSize:      18000,
    estimatedTimeSec: '25–50',
    estimatedCostUSD: '$0 (Claude Code subscription)',
    quality:         '⭐⭐⭐⭐',
    available:       true,
  },
  M3: {
    id:          'M3',
    name:        'GLiNER-Relex Joint',
    description: 'Single forward pass NER+RE via GLiNER-Relex encoder. Sub-second latency, minimal LLM cost. Best for high-throughput scenarios.',
    class:       null,
    requiresGLiNER:  true,
    supportsBatch:   false,
    supportsStream:  true,
    maxDocSize:      null,
    estimatedTimeSec: '0.5–2',
    estimatedCostUSD: '~$0.001',
    quality:         '⭐⭐⭐',
    available:       false,
  },
  M4: {
    id:          'M4',
    name:        'MapReduce (Long Documents)',
    description: 'Map/Collapse/Reduce for any-length documents. Parallel Haiku chunk extraction (8K chunks, concurrency=5) + Sonnet reduce for type conflict resolution and cross-chunk relation inference.',
    class:       M4MapReduceExtractor,
    requiresGLiNER:  false,
    supportsBatch:   false,
    supportsStream:  true,
    maxDocSize:      null, // no limit
    estimatedTimeSec: '60–180',
    estimatedCostUSD: '~$0.10–0.20',
    quality:         '⭐⭐⭐⭐⭐',
    available:       true,
  },
  M5: {
    id:          'M5',
    name:        'Two-Tier (Haiku + Sonnet)',
    description: 'Routes simple docs to Haiku and complex ones to Sonnet. GLiNER pre-filter + intelligent complexity scoring. 60% cost savings average.',
    class:       null,
    requiresGLiNER:  true,
    supportsBatch:   false,
    supportsStream:  true,
    maxDocSize:      18000,
    estimatedTimeSec: '20–50',
    estimatedCostUSD: '~$0.04',
    quality:         '⭐⭐⭐⭐',
    available:       false,
  },
  M6: {
    id:          'M6',
    name:        'Batch Processing',
    description: 'Anthropic Batch API — async processing with 50% cost discount. For bulk corpus ingestion. Results in 1–24h.',
    class:       null,
    requiresGLiNER:  false,
    supportsBatch:   true,
    supportsStream:  false,
    maxDocSize:      18000,
    estimatedTimeSec: '3600–86400 (async)',
    estimatedCostUSD: '~$0.05',
    quality:         '⭐⭐⭐⭐',
    available:       false,
  },
};

// ── Registry class ───────────────────────────────────────────────────────────
class MethodologyRegistry {
  constructor() {
    this._instances = new Map();
  }

  /**
   * Check if a methodology is available (implemented + dependencies met).
   */
  isAvailable(id) {
    const entry = METHODOLOGY_CATALOG[id];
    return !!(entry && entry.available && entry.class);
  }

  /**
   * Get or create an extractor instance for a methodology.
   */
  getExtractor(id, options = {}) {
    const entry = METHODOLOGY_CATALOG[id];
    if (!entry) throw new Error(`Unknown methodology: ${id}`);
    if (!entry.available) throw new Error(`Methodology ${id} is not yet implemented`);
    if (!entry.class) throw new Error(`Methodology ${id} has no extractor class`);

    const cacheKey = `${id}:${JSON.stringify(options)}`;
    if (!this._instances.has(cacheKey)) {
      this._instances.set(cacheKey, new entry.class(options));
    }
    return this._instances.get(cacheKey);
  }

  /**
   * Return catalog metadata for all or specific methodologies.
   * Strips the `class` field so it's safe to send as API response.
   */
  list(ids = null) {
    const entries = ids
      ? ids.map(id => METHODOLOGY_CATALOG[id]).filter(Boolean)
      : Object.values(METHODOLOGY_CATALOG);

    return entries.map(({ class: _, ...rest }) => rest);
  }

  /**
   * Return only available (implemented) methodologies.
   */
  listAvailable() {
    return this.list().filter(m => m.available);
  }

  /**
   * Validate a list of methodology IDs and options for a given document.
   */
  validate(ids, { docSize = 0, glinerAvailable = false } = {}) {
    const issues   = [];
    const warnings = [];

    for (const id of ids) {
      const entry = METHODOLOGY_CATALOG[id];
      if (!entry) { issues.push(`Unknown methodology: ${id}`); continue; }
      if (!entry.available) { issues.push(`${id}: not yet implemented`); continue; }
      if (entry.requiresGLiNER && !glinerAvailable) {
        issues.push(`${id}: requires GLiNER service (not available)`);
      }
      if (entry.maxDocSize && docSize > entry.maxDocSize) {
        warnings.push(`${id}: document (${docSize} chars) exceeds limit (${entry.maxDocSize}) — text will be truncated`);
      }
    }

    return { valid: issues.length === 0, issues, warnings };
  }

  /**
   * Register a new or updated extractor class (for testing / future M2-M6).
   */
  register(id, ExtractorClass, meta = {}) {
    METHODOLOGY_CATALOG[id] = {
      ...(METHODOLOGY_CATALOG[id] || {}),
      ...meta,
      id,
      class:     ExtractorClass,
      available: true,
    };
    this._instances.delete(id); // clear cached instance
  }
}

const registry = new MethodologyRegistry();
module.exports = { registry, MethodologyRegistry, METHODOLOGY_CATALOG };
