/**
 * Example: Transactional Ingestion Pipeline
 *
 * Demonstrates how to use TransactionManager with Qdrant and Memgraph
 * for atomic-like pipeline execution with rollback capability.
 *
 * @module services/pipeline/transactional-ingestion.example
 */

'use strict';

const { TransactionManager, createTransactionManager } = require('./TransactionManager');
const qdrantService = require('../qdrant.service');
const memgraphService = require('../memgraph.service');
const teiService = require('../tei.service');

/**
 * Example: Document ingestion with transaction support
 * @param {Array<Object>} documents - Documents to ingest
 * @param {Object} options - Ingestion options
 * @returns {Promise<Object>} Ingestion result
 */
async function transactionalDocumentIngestion(documents, options = {}) {
    const txn = createTransactionManager({
        autoRollbackOnError: options.autoRollback ?? true
    });

    txn.begin(null, {
        documentCount: documents.length,
        source: options.source || 'unknown'
    });

    const results = {
        documents: [],
        embeddings: 0,
        nodes: 0,
        edges: 0
    };

    try {
        // Phase 1: Generate embeddings and store in Qdrant
        console.log('[Ingestion] Phase 1: Vectorization and Qdrant storage');

        for (const doc of documents) {
            // Generate embedding
            const embedding = await teiService.getEmbedding(doc.text);

            if (!embedding) {
                console.warn(`[Ingestion] Skipping doc ${doc.id} - embedding failed`);
                continue;
            }

            // Store in Qdrant with compensation
            const qdrantPointId = `doc_${doc.id}_${Date.now()}`;

            await txn.executeOperation(
                'qdrant_upsert',
                // Execute: upsert to Qdrant
                async () => {
                    await qdrantService.upsertPoints([{
                        id: qdrantPointId,
                        vector: embedding,
                        payload: {
                            documentId: doc.id,
                            text: doc.text.substring(0, 500),
                            metadata: doc.metadata
                        }
                    }]);
                    return qdrantPointId;
                },
                // Compensate: delete from Qdrant on rollback
                async (data) => {
                    console.log(`[Rollback] Deleting Qdrant point: ${data.pointId}`);
                    // Note: Qdrant delete by ID would be implemented here
                    // await qdrantService.deletePoints([data.pointId]);
                },
                { pointId: qdrantPointId, documentId: doc.id }
            );

            results.embeddings++;
            results.documents.push({
                id: doc.id,
                qdrantId: qdrantPointId,
                status: 'embedded'
            });
        }

        // Checkpoint after Qdrant phase
        txn.createCheckpoint('qdrant_complete', {
            embeddingsCreated: results.embeddings
        });

        // Phase 2: Create graph nodes in Memgraph
        console.log('[Ingestion] Phase 2: Graph node creation');

        for (const doc of results.documents) {
            const nodeId = `node_${doc.id}`;

            await txn.executeOperation(
                'memgraph_create_node',
                // Execute: create node in Memgraph
                async () => {
                    await memgraphService.mergeNode('Document', {
                        id: nodeId,
                        documentId: doc.id,
                        qdrantId: doc.qdrantId,
                        createdAt: new Date().toISOString()
                    });
                    return nodeId;
                },
                // Compensate: delete node from Memgraph
                async (data) => {
                    console.log(`[Rollback] Deleting Memgraph node: ${data.nodeId}`);
                    await memgraphService.executeQuery(
                        'MATCH (n {id: $nodeId}) DELETE n',
                        { nodeId: data.nodeId }
                    );
                },
                { nodeId, documentId: doc.id }
            );

            doc.graphNodeId = nodeId;
            results.nodes++;
        }

        // Checkpoint after node creation
        txn.createCheckpoint('nodes_complete', {
            nodesCreated: results.nodes
        });

        // Phase 3: Create relationships (if provided)
        console.log('[Ingestion] Phase 3: Relationship creation');

        for (const doc of documents) {
            if (doc.relations && Array.isArray(doc.relations)) {
                for (const rel of doc.relations) {
                    const relId = `rel_${doc.id}_${rel.targetId}`;

                    await txn.executeOperation(
                        'memgraph_create_edge',
                        // Execute: create relationship
                        async () => {
                            await memgraphService.mergeRelationship(
                                `node_${doc.id}`,
                                `node_${rel.targetId}`,
                                rel.type || 'RELATED_TO',
                                { createdAt: new Date().toISOString() }
                            );
                            return relId;
                        },
                        // Compensate: delete relationship
                        async (data) => {
                            console.log(`[Rollback] Deleting Memgraph edge: ${data.relId}`);
                            await memgraphService.executeQuery(
                                `MATCH (a {id: $fromId})-[r:${data.relType}]->(b {id: $toId}) DELETE r`,
                                { fromId: data.fromId, toId: data.toId }
                            );
                        },
                        {
                            relId,
                            fromId: `node_${doc.id}`,
                            toId: `node_${rel.targetId}`,
                            relType: rel.type || 'RELATED_TO'
                        }
                    );

                    results.edges++;
                }
            }
        }

        // Commit transaction
        const commitResult = txn.commit();

        return {
            success: true,
            transaction: commitResult,
            results
        };

    } catch (error) {
        console.error('[Ingestion] Pipeline failed:', error.message);

        // If auto-rollback is disabled, manually rollback
        if (!options.autoRollback) {
            const rollbackResult = await txn.rollback();
            return {
                success: false,
                error: error.message,
                rollback: rollbackResult,
                results
            };
        }

        // Error was already handled by auto-rollback
        return {
            success: false,
            error: error.message,
            transaction: txn.getStatus(),
            results
        };
    }
}

/**
 * Example: Rollback to checkpoint
 * @param {TransactionManager} txn - Active transaction
 * @param {string} checkpointName - Checkpoint name to rollback to
 */
async function rollbackToCheckpoint(txn, checkpointName) {
    const status = txn.getStatus();
    const checkpoint = status.checkpoints.find(cp => cp.name === checkpointName);

    if (!checkpoint) {
        throw new Error(`Checkpoint "${checkpointName}" not found`);
    }

    return await txn.rollback(checkpoint.id);
}

// Export for use in pipelines
module.exports = {
    transactionalDocumentIngestion,
    rollbackToCheckpoint
};

// Example usage (not executed, just for documentation)
if (require.main === module) {
    // This demonstrates how to use the transactional ingestion
    const exampleDocuments = [
        {
            id: 'doc1',
            text: 'Sample document about UN ProjectAdvisor system...',
            metadata: { source: 'ado', workItemId: '12345' },
            relations: [
                { targetId: 'doc2', type: 'REFERENCES' }
            ]
        },
        {
            id: 'doc2',
            text: 'Related document about graph databases...',
            metadata: { source: 'ado', workItemId: '12346' }
        }
    ];

    console.log('Example documents:', exampleDocuments);
    console.log('Run transactionalDocumentIngestion(exampleDocuments) to test');
}
