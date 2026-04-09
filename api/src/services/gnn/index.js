/**
 * GNN Module
 *
 * Provides Graph Neural Network integration for retrieval:
 * - GNN-RAG: Combines GNN embeddings with RAG
 * - Hybrid Retriever: Multiple retrieval strategies with fusion
 *
 * @module services/gnn
 */

'use strict';

const { GNNRAGService, createGNNRAGService, gnnRAGService } = require('./gnn-rag.service');
const { HybridRetriever, createHybridRetriever, hybridRetriever } = require('./hybrid-retriever');

module.exports = {
    // GNN-RAG Service
    GNNRAGService,
    createGNNRAGService,
    gnnRAGService,

    // Hybrid Retriever
    HybridRetriever,
    createHybridRetriever,
    hybridRetriever
};
