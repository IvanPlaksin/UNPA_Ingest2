/**
 * GNN-RAG Service
 * Combines Graph Neural Network embeddings with RAG for improved retrieval
 *
 * Features:
 * - Node embeddings from GNN
 * - Hybrid scoring (semantic + structural)
 * - Multi-hop retrieval
 * - Graph-aware context building
 *
 * @module services/gnn/gnn-rag.service
 */

'use strict';

// Simple logger (uses console)
const logger = {
    debug: (...args) => console.debug('[GNN-RAG]', ...args),
    info: (...args) => console.log('[GNN-RAG]', ...args),
    warn: (...args) => console.warn('[GNN-RAG]', ...args),
    error: (...args) => console.error('[GNN-RAG]', ...args)
};

// ═══════════════════════════════════════════════════════════════════════════════
// GNN-RAG SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class GNNRAGService {
    constructor(options = {}) {
        this.options = {
            // GNN settings
            gnnServiceUrl: options.gnnServiceUrl || process.env.GNN_SERVICE_URL || 'http://localhost:5001',
            embeddingDim: options.embeddingDim || 256,

            // Hybrid scoring weights
            semanticWeight: options.semanticWeight || 0.6,
            structuralWeight: options.structuralWeight || 0.4,

            // Retrieval settings
            topK: options.topK || 10,
            maxHops: options.maxHops || 2,
            minSimilarity: options.minSimilarity || 0.5,

            // Cache
            cacheEmbeddings: options.cacheEmbeddings !== false,
            cacheTTL: options.cacheTTL || 3600000, // 1 hour

            ...options
        };

        // Embeddings cache: nodeId -> { embedding, timestamp }
        this.embeddingsCache = new Map();

        // Graph structure cache
        this.graphCache = {
            nodes: new Map(),
            edges: new Map(),
            adjacency: new Map(),
            lastUpdated: null
        };

        this.stats = {
            totalQueries: 0,
            cacheHits: 0,
            gnnCalls: 0,
            avgRetrievalTime: 0,
            totalRetrievalTime: 0
        };

        this.initialized = false;
    }

    /**
     * Initialize service with graph data
     */
    async initialize(graphData = null) {
        if (graphData) {
            this._buildGraphCache(graphData);
        }
        this.initialized = true;
        logger.info('GNN-RAG Service initialized');
    }

    /**
     * Main retrieval method - combines semantic and structural search
     */
    async retrieve(query, options = {}) {
        this.stats.totalQueries++;
        const startTime = Date.now();

        const topK = options.topK || this.options.topK;
        const maxHops = options.maxHops || this.options.maxHops;

        try {
            // Step 1: Get query embedding
            const queryEmbedding = await this._getQueryEmbedding(query);

            // Step 2: Semantic search - find similar nodes by text
            const semanticResults = await this._semanticSearch(queryEmbedding, topK * 2);

            // Step 3: Structural search - expand via graph traversal
            const structuralResults = await this._structuralExpand(
                semanticResults.map(r => r.nodeId),
                maxHops
            );

            // Step 4: Get GNN embeddings for all candidate nodes
            const allCandidates = this._mergeCandidates(semanticResults, structuralResults);
            const gnnEmbeddings = await this._getGNNEmbeddings(allCandidates.map(c => c.nodeId));

            // Step 5: Hybrid scoring
            const scoredResults = this._hybridScore(
                allCandidates,
                queryEmbedding,
                gnnEmbeddings
            );

            // Step 6: Select top-K
            const topResults = scoredResults
                .sort((a, b) => b.score - a.score)
                .slice(0, topK);

            // Step 7: Build context from results
            const context = this._buildContext(topResults, options);

            const duration = Date.now() - startTime;
            this.stats.totalRetrievalTime += duration;
            this.stats.avgRetrievalTime = this.stats.totalRetrievalTime / this.stats.totalQueries;

            return {
                results: topResults,
                context,
                metadata: {
                    query,
                    totalCandidates: allCandidates.length,
                    semanticMatches: semanticResults.length,
                    structuralExpansions: structuralResults.length,
                    duration,
                    method: 'gnn-rag'
                }
            };

        } catch (error) {
            logger.error('GNN-RAG retrieval failed:', error);
            return {
                results: [],
                context: '',
                metadata: { error: error.message }
            };
        }
    }

    /**
     * Multi-hop query - follows relations to answer complex queries
     */
    async multiHopQuery(query, options = {}) {
        const maxHops = options.maxHops || this.options.maxHops;
        const hops = [];

        // Step 1: Initial retrieval
        let currentResults = await this.retrieve(query, { topK: 5, maxHops: 1 });
        hops.push({
            hop: 0,
            query,
            results: currentResults.results
        });

        // Step 2: Iterative expansion
        for (let hop = 1; hop < maxHops; hop++) {
            if (currentResults.results.length === 0) break;

            // Get neighbors of current results
            const seedNodes = currentResults.results.map(r => r.nodeId);
            const neighbors = this._getNeighbors(seedNodes, 1);

            if (neighbors.length === 0) break;

            // Score neighbors by relevance to original query
            const queryEmbedding = await this._getQueryEmbedding(query);
            const neighborEmbeddings = await this._getGNNEmbeddings(neighbors);

            const scoredNeighbors = neighbors.map((nodeId) => ({
                nodeId,
                score: this._cosineSimilarity(queryEmbedding, neighborEmbeddings[nodeId] || []),
                hop
            }));

            scoredNeighbors.sort((a, b) => b.score - a.score);
            const topNeighbors = scoredNeighbors.slice(0, 5);

            hops.push({
                hop,
                seedNodes,
                results: topNeighbors
            });

            currentResults = { results: topNeighbors };
        }

        // Collect all results across hops
        const allResults = hops.flatMap(h => h.results);
        const uniqueResults = this._deduplicateResults(allResults);

        return {
            hops,
            results: uniqueResults,
            context: this._buildContext(uniqueResults, options),
            metadata: {
                totalHops: hops.length,
                totalResults: uniqueResults.length
            }
        };
    }

    /**
     * Update graph structure
     */
    updateGraph(graphData) {
        this._buildGraphCache(graphData);
        this._invalidateEmbeddingsCache();
        logger.info('Graph cache updated');
    }

    /**
     * Add nodes to graph
     */
    addNodes(nodes) {
        for (const node of nodes) {
            this.graphCache.nodes.set(node.id, node);
        }
        this.graphCache.lastUpdated = Date.now();
    }

    /**
     * Add edges to graph
     */
    addEdges(edges) {
        for (const edge of edges) {
            const source = edge.source || edge.from;
            const target = edge.target || edge.to;
            const key = `${source}-${target}`;
            this.graphCache.edges.set(key, edge);

            // Update adjacency
            if (!this.graphCache.adjacency.has(source)) {
                this.graphCache.adjacency.set(source, new Set());
            }
            this.graphCache.adjacency.get(source).add(target);

            // Add reverse for undirected traversal
            if (!this.graphCache.adjacency.has(target)) {
                this.graphCache.adjacency.set(target, new Set());
            }
            this.graphCache.adjacency.get(target).add(source);
        }
        this.graphCache.lastUpdated = Date.now();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    _buildGraphCache(graphData) {
        this.graphCache.nodes.clear();
        this.graphCache.edges.clear();
        this.graphCache.adjacency.clear();

        // Add nodes
        for (const node of graphData.nodes || []) {
            this.graphCache.nodes.set(node.id, node);
        }

        // Add edges and build adjacency
        for (const edge of graphData.edges || []) {
            const source = edge.source || edge.from;
            const target = edge.target || edge.to;
            const key = `${source}-${target}`;

            this.graphCache.edges.set(key, edge);

            if (!this.graphCache.adjacency.has(source)) {
                this.graphCache.adjacency.set(source, new Set());
            }
            this.graphCache.adjacency.get(source).add(target);

            if (!this.graphCache.adjacency.has(target)) {
                this.graphCache.adjacency.set(target, new Set());
            }
            this.graphCache.adjacency.get(target).add(source);
        }

        this.graphCache.lastUpdated = Date.now();
        logger.debug(`Graph cache built: ${this.graphCache.nodes.size} nodes, ${this.graphCache.edges.size} edges`);
    }

    async _getQueryEmbedding(query) {
        // Try to get from GNN service (routes are under /api/v1/gnn/)
        try {
            const response = await this._callGNNService('/api/v1/gnn/embed/text', { text: query });
            return response.embedding;
        } catch (error) {
            // Fallback to simple BOW embedding
            return this._simpleBOWEmbedding(query);
        }
    }

    async _semanticSearch(queryEmbedding, topK) {
        const results = [];

        for (const [nodeId, node] of this.graphCache.nodes) {
            // Get node text for comparison
            const nodeText = node.name || node.label || node.text || '';
            const nodeEmbedding = this._simpleBOWEmbedding(nodeText);

            const similarity = this._cosineSimilarity(queryEmbedding, nodeEmbedding);

            if (similarity >= this.options.minSimilarity) {
                results.push({
                    nodeId,
                    node,
                    semanticScore: similarity,
                    source: 'semantic'
                });
            }
        }

        return results
            .sort((a, b) => b.semanticScore - a.semanticScore)
            .slice(0, topK);
    }

    async _structuralExpand(seedNodeIds, maxHops) {
        const expanded = new Set(seedNodeIds);
        const results = [];

        let currentLayer = new Set(seedNodeIds);

        for (let hop = 1; hop <= maxHops; hop++) {
            const nextLayer = new Set();

            for (const nodeId of currentLayer) {
                const neighbors = this.graphCache.adjacency.get(nodeId) || new Set();

                for (const neighbor of neighbors) {
                    if (!expanded.has(neighbor)) {
                        expanded.add(neighbor);
                        nextLayer.add(neighbor);

                        const node = this.graphCache.nodes.get(neighbor);
                        if (node) {
                            results.push({
                                nodeId: neighbor,
                                node,
                                hop,
                                source: 'structural'
                            });
                        }
                    }
                }
            }

            if (nextLayer.size === 0) break;
            currentLayer = nextLayer;
        }

        return results;
    }

    _getNeighbors(nodeIds, hops = 1) {
        const neighbors = new Set();
        const visited = new Set(nodeIds);
        let current = new Set(nodeIds);

        for (let h = 0; h < hops; h++) {
            const next = new Set();

            for (const nodeId of current) {
                const adjacent = this.graphCache.adjacency.get(nodeId) || new Set();
                for (const neighbor of adjacent) {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        next.add(neighbor);
                        neighbors.add(neighbor);
                    }
                }
            }

            current = next;
            if (current.size === 0) break;
        }

        return [...neighbors];
    }

    async _getGNNEmbeddings(nodeIds) {
        const embeddings = {};
        const uncached = [];

        // Check cache
        for (const nodeId of nodeIds) {
            const cached = this.embeddingsCache.get(nodeId);
            if (cached && Date.now() - cached.timestamp < this.options.cacheTTL) {
                embeddings[nodeId] = cached.embedding;
                this.stats.cacheHits++;
            } else {
                uncached.push(nodeId);
            }
        }

        // Fetch uncached from GNN service
        if (uncached.length > 0) {
            try {
                this.stats.gnnCalls++;
                const response = await this._callGNNService('/api/v1/gnn/embed/nodes', { nodeIds: uncached });

                for (const [nodeId, embedding] of Object.entries(response.embeddings || {})) {
                    embeddings[nodeId] = embedding;

                    if (this.options.cacheEmbeddings) {
                        this.embeddingsCache.set(nodeId, {
                            embedding,
                            timestamp: Date.now()
                        });
                    }
                }
            } catch (error) {
                logger.warn('Failed to get GNN embeddings:', error.message);
                // Use fallback embeddings
                for (const nodeId of uncached) {
                    const node = this.graphCache.nodes.get(nodeId);
                    embeddings[nodeId] = this._simpleBOWEmbedding(node?.name || nodeId);
                }
            }
        }

        return embeddings;
    }

    _mergeCandidates(semanticResults, structuralResults) {
        const merged = new Map();

        for (const result of semanticResults) {
            merged.set(result.nodeId, {
                ...result,
                structuralScore: 0
            });
        }

        for (const result of structuralResults) {
            if (merged.has(result.nodeId)) {
                merged.get(result.nodeId).structuralScore = 1 / (result.hop + 1);
                merged.get(result.nodeId).source = 'both';
            } else {
                merged.set(result.nodeId, {
                    ...result,
                    semanticScore: 0,
                    structuralScore: 1 / (result.hop + 1)
                });
            }
        }

        return [...merged.values()];
    }

    _hybridScore(candidates, queryEmbedding, gnnEmbeddings) {
        return candidates.map(candidate => {
            const gnnEmbedding = gnnEmbeddings[candidate.nodeId] || [];

            // GNN similarity
            const gnnSimilarity = this._cosineSimilarity(queryEmbedding, gnnEmbedding);

            // Combine scores
            const semanticScore = candidate.semanticScore || 0;
            const structuralScore = candidate.structuralScore || 0;

            const hybridScore =
                this.options.semanticWeight * (semanticScore + gnnSimilarity) / 2 +
                this.options.structuralWeight * structuralScore;

            return {
                ...candidate,
                gnnSimilarity,
                score: hybridScore
            };
        });
    }

    _buildContext(results, options = {}) {
        const maxLength = options.maxContextLength || 2000;
        const parts = [];

        for (const result of results) {
            const node = result.node || this.graphCache.nodes.get(result.nodeId);
            if (!node) continue;

            const nodeText = this._nodeToText(node);
            parts.push(nodeText);

            // Add connected edges as context
            const edges = this._getNodeEdges(result.nodeId);
            for (const edge of edges.slice(0, 3)) {
                parts.push(`  - ${edge.type}: ${edge.target}`);
            }
        }

        let context = parts.join('\n');
        if (context.length > maxLength) {
            context = context.slice(0, maxLength) + '...';
        }

        return context;
    }

    _nodeToText(node) {
        const name = node.name || node.label || node.id;
        const type = node.type || 'Entity';
        const attrs = node.attributes || {};

        let text = `[${type}] ${name}`;

        if (Object.keys(attrs).length > 0) {
            const attrStr = Object.entries(attrs)
                .slice(0, 3)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ');
            text += ` (${attrStr})`;
        }

        return text;
    }

    _getNodeEdges(nodeId) {
        const edges = [];

        for (const [key, edge] of this.graphCache.edges) {
            const source = edge.source || edge.from;
            if (source === nodeId) {
                edges.push({
                    type: edge.type || edge.relation || 'RELATED_TO',
                    target: edge.target || edge.to
                });
            }
        }

        return edges;
    }

    _deduplicateResults(results) {
        const seen = new Map();

        for (const result of results) {
            const existing = seen.get(result.nodeId);
            if (!existing || (existing.score || 0) < (result.score || 0)) {
                seen.set(result.nodeId, result);
            }
        }

        return [...seen.values()];
    }

    _simpleBOWEmbedding(text) {
        // Simple bag-of-words embedding as fallback
        const words = (text || '').toLowerCase().split(/\W+/).filter(w => w.length > 2);
        const vocab = new Map();

        for (const word of words) {
            vocab.set(word, (vocab.get(word) || 0) + 1);
        }

        // Create fixed-size embedding
        const embedding = new Array(this.options.embeddingDim).fill(0);

        for (const [word, count] of vocab) {
            const hash = this._hashString(word) % this.options.embeddingDim;
            embedding[hash] += count;
        }

        // Normalize
        const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0)) || 1;
        return embedding.map(x => x / norm);
    }

    _hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    _cosineSimilarity(a, b) {
        if (!a || !b || a.length === 0 || b.length === 0) return 0;

        const minLen = Math.min(a.length, b.length);
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < minLen; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        return denominator > 0 ? dotProduct / denominator : 0;
    }

    async _callGNNService(endpoint, data) {
        try {
            const response = await fetch(`${this.options.gnnServiceUrl}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`GNN service error: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            logger.debug('GNN service call failed:', error.message);
            throw error;
        }
    }

    _invalidateEmbeddingsCache() {
        this.embeddingsCache.clear();
        logger.debug('Embeddings cache invalidated');
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            graphSize: {
                nodes: this.graphCache.nodes.size,
                edges: this.graphCache.edges.size
            },
            cacheSize: this.embeddingsCache.size,
            cacheHitRate: this.stats.totalQueries > 0
                ? ((this.stats.cacheHits / this.stats.totalQueries) * 100).toFixed(1) + '%'
                : 'N/A'
        };
    }

    /**
     * Clear caches
     */
    clearCache() {
        this.embeddingsCache.clear();
        this.stats.cacheHits = 0;
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalQueries: 0,
            cacheHits: 0,
            gnnCalls: 0,
            avgRetrievalTime: 0,
            totalRetrievalTime: 0
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY & SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Factory function
 */
function createGNNRAGService(options) {
    return new GNNRAGService(options);
}

const gnnRAGService = new GNNRAGService();

module.exports = {
    GNNRAGService,
    createGNNRAGService,
    gnnRAGService
};
