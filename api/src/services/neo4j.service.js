/**
 * Neo4j Service (Legacy wrapper)
 *
 * IMPORTANT: Uses shared memgraph.service driver to avoid connection pool exhaustion.
 * Do NOT create separate neo4j.driver() instances!
 *
 * This service wraps the shared memgraph driver for backwards compatibility
 * with code that expects a Neo4jService interface.
 */

const { withSession, withWriteTransaction } = require('../core/aopeg/utils/cypher.utils');

// Use shared memgraph service (singleton) to avoid multiple driver instances
const memgraphService = require('./memgraph.service');

/**
 * Safely convert Neo4j Integer to string without creating many Integer objects.
 * Uses toNumber() which is more memory-efficient than toString() for identities.
 * @param {*} value - Neo4j Integer or regular number
 * @returns {string} String representation
 */
function safeIdToString(value) {
    if (value === null || value === undefined) return '';
    // Check if it's a Neo4j Integer (has low/high properties)
    if (typeof value === 'object' && 'low' in value && 'high' in value) {
        // Use toNumber for small values, toString only when necessary
        if (value.high === 0 || value.high === -1) {
            return String(value.toNumber());
        }
        return value.toString();
    }
    return String(value);
}

class Neo4jService {
    constructor() {
        // Use shared driver from memgraph.service singleton
        this.driver = memgraphService.driver;

        if (!this.driver) {
            console.error('[Neo4jService] Memgraph driver not available from shared service');
        } else {
            console.log('[Neo4jService] Using shared Memgraph driver');
        }
    }

    getSession() {
        if (!this.driver) {
            throw new Error('Memgraph driver not initialized');
        }
        return this.driver.session();
    }

    // Note: Don't close the driver here - it's shared with memgraph.service
    async close() {
        // No-op: driver is managed by memgraph.service singleton
        console.log('[Neo4jService] close() called - driver is shared, not closing');
    }

    /**
     * Checks if a document with the given URL has already been processed.
     * @param {string} url
     * @returns {Promise<{processed: boolean, node: object|null}>}
     */
    async checkDocumentStatus(url) {
        return withSession(this.driver, async (session) => {
            const result = await session.run(
                `MATCH (d:Document {url: $url}) RETURN d`,
                { url }
            );
            if (result.records.length > 0) {
                return { processed: true, node: result.records[0].get('d').properties };
            }
            return { processed: false, node: null };
        });
    }

    /**
     * Creates or updates a Document node and links it to a Work Item.
     * @param {object} docData { url, name, size, hash, processedAt }
     * @param {string} workItemId
     */
    async saveDocument(docData, workItemId) {
        return withWriteTransaction(this.driver, tx =>
            tx.run(
                `
                MERGE (w:WorkItem {id: $workItemId})
                MERGE (d:Document {url: $url})
                SET d += $props
                MERGE (w)-[:HAS_ATTACHMENT]->(d)
                RETURN d
                `,
                {
                    workItemId: String(workItemId),
                    url: docData.url,
                    props: docData
                }
            )
        );
    }

    /**
     * Creates entities extracted from the document and links them.
     * Uses UNWIND for batch processing instead of per-entity transactions.
     * @param {string} docUrl
     * @param {Array} entities [{ type, name, relation }]
     */
    async saveExtractedEntities(docUrl, entities) {
        if (!entities || entities.length === 0) return;

        // Normalize entities for UNWIND
        const normalizedEntities = entities.map(e => ({
            name: e.name,
            type: e.type,
            relation: e.relation || 'MENTIONS'
        }));

        return withWriteTransaction(this.driver, tx =>
            tx.run(
                `
                MATCH (d:Document {url: $docUrl})
                UNWIND $entities AS entity
                MERGE (e:Entity {name: entity.name})
                SET e.type = entity.type
                MERGE (d)-[r:MENTIONS]->(e)
                SET r.type = entity.relation
                `,
                {
                    docUrl,
                    entities: normalizedEntities
                }
            )
        );
    }

    /**
     * Retrieves the graph for a specific document.
     * @param {string} docUrl
     */
    async getDocumentGraph(docUrl) {
        return withSession(this.driver, async (session) => {
            const result = await session.run(
                `
                MATCH (d:Document {url: $docUrl})-[r]-(n)
                RETURN d, r, n
                LIMIT 100
                `,
                { docUrl }
            );

            const nodes = new Map();
            const edges = [];

            result.records.forEach(record => {
                const doc = record.get('d');
                const rel = record.get('r');
                const node = record.get('n');

                const docId = safeIdToString(doc.identity);
                nodes.set(docId, {
                    id: docId,
                    label: doc.properties.name || 'Document',
                    type: 'Document',
                    properties: doc.properties
                });

                const nodeId = safeIdToString(node.identity);
                nodes.set(nodeId, {
                    id: nodeId,
                    label: node.properties.name || node.labels[0],
                    type: node.labels[0],
                    properties: node.properties
                });

                edges.push({
                    id: safeIdToString(rel.identity),
                    source: safeIdToString(rel.start),
                    target: safeIdToString(rel.end),
                    label: rel.type
                });
            });

            return {
                nodes: Array.from(nodes.values()),
                edges: edges
            };
        });
    }
}

module.exports = new Neo4jService();
