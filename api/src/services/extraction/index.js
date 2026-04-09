/**
 * Extraction Module
 *
 * Provides unified extraction capabilities:
 * - Pattern-based extraction
 * - LLM-based extraction
 * - Hybrid extraction (pattern + LLM)
 * - DSPy-optimized extraction
 * - GNN-enhanced extraction with graph integration
 *
 * @module services/extraction
 */

'use strict';

// Pattern-Enhanced Extractor
const {
    PatternEnhancedExtractor,
    createPatternEnhancedExtractor,
    patternEnhancedExtractor
} = require('./pattern-enhanced-extractor');

// Unified Extractor
const {
    UnifiedExtractor,
    createUnifiedExtractor,
    unifiedExtractor
} = require('./unified-extractor');

// GNN-Enhanced Extractor
const {
    GNNEnhancedExtractor,
    createGNNEnhancedExtractor,
    gnnEnhancedExtractor
} = require('./gnn-enhanced-extractor');

// Re-export existing extractors for backwards compatibility
let entityExtractor = null;
let relationshipExtractor = null;
let workItemExtractor = null;

try {
    entityExtractor = require('./entity-extractor');
} catch (e) { /* not available */ }

try {
    relationshipExtractor = require('./relationship-extractor');
} catch (e) { /* not available */ }

try {
    workItemExtractor = require('./work-item-extractor');
} catch (e) { /* not available */ }

module.exports = {
    // Pattern-Enhanced Extractor
    PatternEnhancedExtractor,
    createPatternEnhancedExtractor,
    patternEnhancedExtractor,

    // Unified Extractor
    UnifiedExtractor,
    createUnifiedExtractor,
    unifiedExtractor,

    // GNN-Enhanced Extractor (full pipeline with graph integration)
    GNNEnhancedExtractor,
    createGNNEnhancedExtractor,
    gnnEnhancedExtractor,

    // Legacy extractors (for backwards compatibility)
    ...(entityExtractor ? { entityExtractor } : {}),
    ...(relationshipExtractor ? { relationshipExtractor } : {}),
    ...(workItemExtractor ? { workItemExtractor } : {})
};
