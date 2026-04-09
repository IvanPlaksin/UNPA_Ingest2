/**
 * Hybrid Retriever
 * Combines multiple retrieval strategies for optimal results
 *
 * Supports:
 * - Reciprocal Rank Fusion (RRF)
 * - Weighted score fusion
 * - Max score fusion
 *
 * @module services/gnn/hybrid-retriever
 */

'use strict';

const { gnnRAGService } = require('./gnn-rag.service');

// Simple logger (uses console)
const logger = {
    debug: (...args) => console.debug('[HybridRetriever]', ...args),
    info: (...args) => console.log('[HybridRetriever]', ...args),
    warn: (...args) => console.warn('[HybridRetriever]', ...args),
    error: (...args) => console.error('[HybridRetriever]', ...args)
};

// ═══════════════════════════════════════════════════════════════════════════════
// HYBRID RETRIEVER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class HybridRetriever {
    constructor(options = {}) {
        this.options = {
            strategies: options.strategies || ['semantic', 'structural', 'gnn'],
            fusionMethod: options.fusionMethod || 'rrf', // 'rrf', 'weighted', 'max'
            rrfK: options.rrfK || 60,
            strategyWeights: options.strategyWeights || {
                semantic: 0.4,
                structural: 0.3,
                gnn: 0.3
            },
            ...options
        };

        this.gnnRAG = options.gnnRAG || gnnRAGService;

        this.stats = {
            totalQueries: 0,
            byStrategy: {},
            byFusionMethod: {},
            avgDuration: 0,
            totalDuration: 0
        };
    }

    /**
     * Retrieve using multiple strategies and fuse results
     */
    async retrieve(query, options = {}) {
        this.stats.totalQueries++;
        const startTime = Date.now();

        const topK = options.topK || 10;
        const fusionMethod = options.fusionMethod || this.options.fusionMethod;
        const results = {};

        // Run each strategy
        for (const strategy of this.options.strategies) {
            try {
                results[strategy] = await this._runStrategy(strategy, query, topK * 2);
                this.stats.byStrategy[strategy] = (this.stats.byStrategy[strategy] || 0) + 1;
            } catch (error) {
                logger.warn(`Strategy ${strategy} failed:`, error.message);
                results[strategy] = [];
            }
        }

        // Fuse results
        const fused = this._fuseResults(results, topK, fusionMethod);

        // Track fusion method usage
        this.stats.byFusionMethod[fusionMethod] = (this.stats.byFusionMethod[fusionMethod] || 0) + 1;

        const duration = Date.now() - startTime;
        this.stats.totalDuration += duration;
        this.stats.avgDuration = this.stats.totalDuration / this.stats.totalQueries;

        return {
            results: fused,
            byStrategy: Object.fromEntries(
                Object.entries(results).map(([k, v]) => [k, v.length])
            ),
            metadata: {
                strategies: this.options.strategies,
                fusionMethod,
                duration,
                query
            }
        };
    }

    /**
     * Run a specific retrieval strategy
     */
    async _runStrategy(strategy, query, topK) {
        switch (strategy) {
            case 'semantic':
                return this._semanticRetrieve(query, topK);

            case 'structural':
                return this._structuralRetrieve(query, topK);

            case 'gnn':
                const result = await this.gnnRAG.retrieve(query, { topK });
                return result.results;

            default:
                logger.warn(`Unknown strategy: ${strategy}`);
                return [];
        }
    }

    /**
     * Semantic retrieval using text similarity
     */
    async _semanticRetrieve(query, topK) {
        // Use GNN-RAG's semantic search
        const queryEmbedding = await this.gnnRAG._getQueryEmbedding(query);
        return this.gnnRAG._semanticSearch(queryEmbedding, topK);
    }

    /**
     * Structural retrieval using graph traversal
     */
    async _structuralRetrieve(query, topK) {
        // Find entry points and expand
        const queryEmbedding = await this.gnnRAG._getQueryEmbedding(query);
        const entryPoints = await this.gnnRAG._semanticSearch(queryEmbedding, 3);

        if (entryPoints.length === 0) return [];

        const expanded = await this.gnnRAG._structuralExpand(
            entryPoints.map(e => e.nodeId),
            2
        );

        return expanded.slice(0, topK);
    }

    /**
     * Fuse results from multiple strategies
     */
    _fuseResults(resultsByStrategy, topK, fusionMethod) {
        switch (fusionMethod) {
            case 'rrf':
                return this._reciprocalRankFusion(resultsByStrategy, topK);

            case 'weighted':
                return this._weightedFusion(resultsByStrategy, topK);

            case 'max':
                return this._maxFusion(resultsByStrategy, topK);

            default:
                return this._reciprocalRankFusion(resultsByStrategy, topK);
        }
    }

    /**
     * Reciprocal Rank Fusion (RRF)
     * Score = sum(1 / (k + rank)) for each ranking
     */
    _reciprocalRankFusion(resultsByStrategy, topK) {
        const scores = new Map();
        const nodeData = new Map();

        for (const [strategy, results] of Object.entries(resultsByStrategy)) {
            for (let rank = 0; rank < results.length; rank++) {
                const result = results[rank];
                const nodeId = result.nodeId;

                // RRF score: 1 / (k + rank + 1)
                const rrfScore = 1 / (this.options.rrfK + rank + 1);

                scores.set(nodeId, (scores.get(nodeId) || 0) + rrfScore);

                if (!nodeData.has(nodeId)) {
                    nodeData.set(nodeId, result);
                }
            }
        }

        // Sort by fused score
        return [...scores.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, topK)
            .map(([nodeId, score]) => ({
                ...nodeData.get(nodeId),
                fusedScore: score,
                fusionMethod: 'rrf'
            }));
    }

    /**
     * Weighted score fusion
     * Score = sum(weight * score) for each strategy
     */
    _weightedFusion(resultsByStrategy, topK) {
        const scores = new Map();
        const nodeData = new Map();

        for (const [strategy, results] of Object.entries(resultsByStrategy)) {
            const weight = this.options.strategyWeights[strategy] || 0.33;

            for (const result of results) {
                const nodeId = result.nodeId;
                const score = (result.score || result.semanticScore || 0) * weight;

                scores.set(nodeId, (scores.get(nodeId) || 0) + score);

                if (!nodeData.has(nodeId)) {
                    nodeData.set(nodeId, result);
                }
            }
        }

        return [...scores.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, topK)
            .map(([nodeId, score]) => ({
                ...nodeData.get(nodeId),
                fusedScore: score,
                fusionMethod: 'weighted'
            }));
    }

    /**
     * Max score fusion
     * Score = max(score) across all strategies
     */
    _maxFusion(resultsByStrategy, topK) {
        const scores = new Map();
        const nodeData = new Map();

        for (const [strategy, results] of Object.entries(resultsByStrategy)) {
            for (const result of results) {
                const nodeId = result.nodeId;
                const score = result.score || result.semanticScore || 0;

                if (!scores.has(nodeId) || scores.get(nodeId) < score) {
                    scores.set(nodeId, score);
                    nodeData.set(nodeId, result);
                }
            }
        }

        return [...scores.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, topK)
            .map(([nodeId, score]) => ({
                ...nodeData.get(nodeId),
                fusedScore: score,
                fusionMethod: 'max'
            }));
    }

    /**
     * Get available strategies
     */
    getAvailableStrategies() {
        return ['semantic', 'structural', 'gnn'];
    }

    /**
     * Get available fusion methods
     */
    getAvailableFusionMethods() {
        return ['rrf', 'weighted', 'max'];
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            gnnRAGStats: this.gnnRAG.getStats()
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalQueries: 0,
            byStrategy: {},
            byFusionMethod: {},
            avgDuration: 0,
            totalDuration: 0
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY & SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Factory function
 */
function createHybridRetriever(options) {
    return new HybridRetriever(options);
}

const hybridRetriever = new HybridRetriever();

module.exports = {
    HybridRetriever,
    createHybridRetriever,
    hybridRetriever
};
