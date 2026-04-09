/**
 * GNN-Enhanced Extractor
 * Full pipeline: Retrieve → Extract → Update → Learn
 *
 * Uses GNN-RAG for context retrieval, then extracts with context awareness,
 * updates the graph with new knowledge, and learns patterns.
 *
 * @module services/extraction/gnn-enhanced-extractor
 */

'use strict';

const { gnnRAGService } = require('../gnn');
const { patternEnhancedExtractor } = require('./pattern-enhanced-extractor');
const { patternLibrary } = require('../patterns');

// Simple logger (uses console)
const logger = {
    debug: (...args) => console.debug('[GNNEnhancedExtractor]', ...args),
    info: (...args) => console.log('[GNNEnhancedExtractor]', ...args),
    warn: (...args) => console.warn('[GNNEnhancedExtractor]', ...args),
    error: (...args) => console.error('[GNNEnhancedExtractor]', ...args)
};

// ═══════════════════════════════════════════════════════════════════════════════
// GNN-ENHANCED EXTRACTOR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class GNNEnhancedExtractor {
    constructor(options = {}) {
        this.options = {
            // Retrieval settings
            enableRetrieval: options.enableRetrieval !== false,
            retrievalTopK: options.retrievalTopK || 5,
            retrievalMaxHops: options.retrievalMaxHops || 2,

            // Extraction settings
            extractionMode: options.extractionMode || 'hybrid',
            useRetrievedContext: options.useRetrievedContext !== false,

            // Graph update settings
            enableGraphUpdate: options.enableGraphUpdate !== false,
            updateBatchSize: options.updateBatchSize || 10,

            // Learning settings
            enableLearning: options.enableLearning !== false,

            ...options
        };

        this.gnnRAG = options.gnnRAG || gnnRAGService;
        this.extractor = options.extractor || patternEnhancedExtractor;
        this.patternLib = options.patternLibrary || patternLibrary;

        // Pending graph updates
        this.pendingUpdates = {
            nodes: [],
            edges: []
        };

        this.stats = {
            totalExtractions: 0,
            withRetrieval: 0,
            graphUpdates: 0,
            nodesAdded: 0,
            edgesAdded: 0,
            patternsLearned: 0
        };
    }

    /**
     * Main extraction with full pipeline
     */
    async extract(text, options = {}) {
        this.stats.totalExtractions++;
        const startTime = Date.now();

        const context = {
            domain: options.domain || 'general',
            ...options
        };

        let retrievedContext = null;
        let retrievalMetadata = null;

        // Step 1: Retrieve related context from graph
        if (this.options.enableRetrieval && this.gnnRAG.graphCache.nodes.size > 0) {
            try {
                const retrieval = await this._retrieveContext(text, context);
                retrievedContext = retrieval.context;
                retrievalMetadata = retrieval.metadata;
                this.stats.withRetrieval++;
            } catch (error) {
                logger.warn('Retrieval failed, continuing without context:', error.message);
            }
        }

        // Step 2: Extract with retrieved context
        const enrichedText = this.options.useRetrievedContext && retrievedContext
            ? this._enrichTextWithContext(text, retrievedContext)
            : text;

        const extraction = await this.extractor.extract(enrichedText, {
            ...context,
            mode: this.options.extractionMode,
            retrievedContext: retrievedContext
        });

        // Step 3: Link extracted entities to existing graph
        const linkedExtraction = this._linkToExistingGraph(extraction);

        // Step 4: Queue graph updates
        if (this.options.enableGraphUpdate) {
            this._queueGraphUpdates(linkedExtraction, text);
        }

        // Step 5: Learn patterns
        if (this.options.enableLearning) {
            const learned = this.patternLib.learnFromExtraction(text, linkedExtraction);
            if (learned.learned) {
                this.stats.patternsLearned += learned.entities + learned.relations;
            }
        }

        // Step 6: Flush updates if batch is full
        if (this.pendingUpdates.nodes.length >= this.options.updateBatchSize) {
            await this._flushGraphUpdates();
        }

        return {
            entities: linkedExtraction.entities,
            relations: linkedExtraction.relations,
            metadata: {
                ...extraction.metadata,
                duration: Date.now() - startTime,
                retrieval: retrievalMetadata,
                linkedEntities: linkedExtraction.linkedCount || 0,
                pendingUpdates: {
                    nodes: this.pendingUpdates.nodes.length,
                    edges: this.pendingUpdates.edges.length
                }
            }
        };
    }

    /**
     * Extract with explicit query for retrieval
     */
    async extractWithQuery(text, query, options = {}) {
        // Use query for retrieval, text for extraction
        const retrieval = await this._retrieveContext(query, options);

        return this.extract(text, {
            ...options,
            retrievedContext: retrieval.context,
            query
        });
    }

    /**
     * Batch extraction with graph building
     */
    async extractBatch(texts, options = {}) {
        const results = [];
        const onProgress = options.onProgress;

        for (let i = 0; i < texts.length; i++) {
            const result = await this.extract(texts[i], options);
            results.push(result);

            if (onProgress) {
                onProgress(i + 1, texts.length);
            }
        }

        // Flush remaining updates
        await this._flushGraphUpdates();

        return {
            results,
            summary: {
                total: results.length,
                totalEntities: results.reduce((sum, r) => sum + r.entities.length, 0),
                totalRelations: results.reduce((sum, r) => sum + r.relations.length, 0),
                graphUpdates: this.stats.graphUpdates
            }
        };
    }

    /**
     * Incremental extraction - adds to existing graph
     */
    async incrementalExtract(text, options = {}) {
        const result = await this.extract(text, {
            ...options,
            enableGraphUpdate: true
        });

        // Immediately flush updates
        await this._flushGraphUpdates();

        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    async _retrieveContext(text, context) {
        const retrieval = await this.gnnRAG.retrieve(text, {
            topK: this.options.retrievalTopK,
            maxHops: this.options.retrievalMaxHops
        });

        return {
            context: retrieval.context,
            results: retrieval.results,
            metadata: {
                resultsCount: retrieval.results.length,
                ...retrieval.metadata
            }
        };
    }

    _enrichTextWithContext(text, retrievedContext) {
        if (!retrievedContext) return text;

        return `CONTEXT FROM KNOWLEDGE GRAPH:
${retrievedContext}

TEXT TO EXTRACT FROM:
${text}`;
    }

    _linkToExistingGraph(extraction) {
        const linkedEntities = [];
        let linkedCount = 0;

        for (const entity of extraction.entities) {
            const linked = this._findMatchingNode(entity);

            if (linked) {
                linkedCount++;
                linkedEntities.push({
                    ...entity,
                    linkedTo: linked.id,
                    linkedConfidence: linked.confidence
                });
            } else {
                linkedEntities.push(entity);
            }
        }

        // Update relations to use linked entity names
        const entityNameMap = new Map();
        for (const entity of linkedEntities) {
            if (entity.linkedTo) {
                const linkedNode = this.gnnRAG.graphCache.nodes.get(entity.linkedTo);
                if (linkedNode) {
                    entityNameMap.set(entity.name.toLowerCase(), linkedNode.name || linkedNode.id);
                }
            }
        }

        const linkedRelations = extraction.relations.map(relation => {
            const linkedSubject = entityNameMap.get(relation.subject.toLowerCase()) || relation.subject;
            const linkedObject = entityNameMap.get(relation.object.toLowerCase()) || relation.object;

            return {
                ...relation,
                subject: linkedSubject,
                object: linkedObject,
                originalSubject: relation.subject,
                originalObject: relation.object
            };
        });

        return {
            entities: linkedEntities,
            relations: linkedRelations,
            linkedCount
        };
    }

    _findMatchingNode(entity) {
        const entityName = entity.name.toLowerCase();

        // Exact match
        for (const [nodeId, node] of this.gnnRAG.graphCache.nodes) {
            const nodeName = (node.name || node.label || nodeId).toLowerCase();

            if (nodeName === entityName) {
                return { id: nodeId, confidence: 1.0, match: 'exact' };
            }
        }

        // Fuzzy match (contains)
        for (const [nodeId, node] of this.gnnRAG.graphCache.nodes) {
            const nodeName = (node.name || node.label || nodeId).toLowerCase();

            if (nodeName.includes(entityName) || entityName.includes(nodeName)) {
                const similarity = Math.min(entityName.length, nodeName.length) /
                    Math.max(entityName.length, nodeName.length);
                if (similarity > 0.4) {
                    return { id: nodeId, confidence: similarity, match: 'fuzzy' };
                }
            }
        }

        return null;
    }

    _queueGraphUpdates(extraction, sourceText) {
        const timestamp = new Date().toISOString();

        // Queue new nodes (entities not linked to existing)
        for (const entity of extraction.entities) {
            if (!entity.linkedTo) {
                const nodeId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

                this.pendingUpdates.nodes.push({
                    id: nodeId,
                    name: entity.name,
                    type: entity.type,
                    attributes: entity.attributes || {},
                    confidence: entity.confidence,
                    source: 'extraction',
                    sourceText: sourceText.slice(0, 200),
                    createdAt: timestamp
                });
            }
        }

        // Queue edges (relations)
        for (const relation of extraction.relations) {
            this.pendingUpdates.edges.push({
                source: relation.subject,
                target: relation.object,
                type: relation.predicate,
                confidence: relation.confidence,
                createdAt: timestamp
            });
        }
    }

    async _flushGraphUpdates() {
        if (this.pendingUpdates.nodes.length === 0 && this.pendingUpdates.edges.length === 0) {
            return;
        }

        const nodesToAdd = [...this.pendingUpdates.nodes];
        const edgesToAdd = [...this.pendingUpdates.edges];

        // Clear pending
        this.pendingUpdates.nodes = [];
        this.pendingUpdates.edges = [];

        // Update graph
        if (nodesToAdd.length > 0) {
            this.gnnRAG.addNodes(nodesToAdd);
            this.stats.nodesAdded += nodesToAdd.length;
        }

        if (edgesToAdd.length > 0) {
            // Resolve edge endpoints to node IDs
            const resolvedEdges = this._resolveEdgeEndpoints(edgesToAdd);
            this.gnnRAG.addEdges(resolvedEdges);
            this.stats.edgesAdded += resolvedEdges.length;
        }

        this.stats.graphUpdates++;
        logger.debug(`Graph updated: +${nodesToAdd.length} nodes, +${edgesToAdd.length} edges`);
    }

    _resolveEdgeEndpoints(edges) {
        const nodeNameToId = new Map();

        // Build name -> id map
        for (const [nodeId, node] of this.gnnRAG.graphCache.nodes) {
            const name = (node.name || node.label || nodeId).toLowerCase();
            nodeNameToId.set(name, nodeId);
        }

        return edges.map(edge => {
            const sourceId = nodeNameToId.get(edge.source.toLowerCase()) || edge.source;
            const targetId = nodeNameToId.get(edge.target.toLowerCase()) || edge.target;

            return {
                ...edge,
                source: sourceId,
                target: targetId
            };
        }).filter(edge => edge.source && edge.target);
    }

    /**
     * Get current graph state
     */
    getGraphState() {
        return {
            nodes: this.gnnRAG.graphCache.nodes.size,
            edges: this.gnnRAG.graphCache.edges.size,
            pendingUpdates: {
                nodes: this.pendingUpdates.nodes.length,
                edges: this.pendingUpdates.edges.length
            },
            lastUpdated: this.gnnRAG.graphCache.lastUpdated
        };
    }

    /**
     * Initialize with existing graph
     */
    async initializeGraph(graphData) {
        await this.gnnRAG.initialize(graphData);
        logger.info('Graph initialized for GNN-enhanced extraction');
    }

    /**
     * Export current graph
     */
    exportGraph() {
        return {
            nodes: [...this.gnnRAG.graphCache.nodes.values()],
            edges: [...this.gnnRAG.graphCache.edges.values()],
            exportedAt: new Date().toISOString()
        };
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            extractorStats: this.extractor.getStats(),
            gnnRAGStats: this.gnnRAG.getStats(),
            patternLibraryStats: this.patternLib.getStats(),
            graphState: this.getGraphState()
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalExtractions: 0,
            withRetrieval: 0,
            graphUpdates: 0,
            nodesAdded: 0,
            edgesAdded: 0,
            patternsLearned: 0
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY & SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Factory function
 */
function createGNNEnhancedExtractor(options) {
    return new GNNEnhancedExtractor(options);
}

const gnnEnhancedExtractor = new GNNEnhancedExtractor();

module.exports = {
    GNNEnhancedExtractor,
    createGNNEnhancedExtractor,
    gnnEnhancedExtractor
};
