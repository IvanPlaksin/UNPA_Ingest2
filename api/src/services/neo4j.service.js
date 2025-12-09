const neo4j = require('neo4j-driver');
const CONFIG = require('../config');

class Neo4jService {
    constructor() {
        this.driver = neo4j.driver(
            CONFIG.neo4j.uri,
            neo4j.auth.basic(CONFIG.neo4j.user, CONFIG.neo4j.password)
        );
    }

    getSession() {
        return this.driver.session();
    }

    async close() {
        await this.driver.close();
    }

    /**
     * Checks if a document with the given URL has already been processed.
     * @param {string} url 
     * @returns {Promise<{processed: boolean, node: object|null}>}
     */
    async checkDocumentStatus(url) {
        const session = this.getSession();
        try {
            const result = await session.run(
                `MATCH (d:Document {url: $url}) RETURN d`,
                { url }
            );
            if (result.records.length > 0) {
                return { processed: true, node: result.records[0].get('d').properties };
            }
            return { processed: false, node: null };
        } finally {
            await session.close();
        }
    }

    /**
     * Creates or updates a Document node and links it to a Work Item.
     * @param {object} docData { url, name, size, hash, processedAt }
     * @param {string} workItemId 
     */
    async saveDocument(docData, workItemId) {
        const session = this.getSession();
        try {
            await session.writeTransaction(tx =>
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
        } finally {
            await session.close();
        }
    }

    /**
     * Creates entities extracted from the document and links them.
     * @param {string} docUrl 
     * @param {Array} entities [{ type, name, relation }]
     */
    async saveExtractedEntities(docUrl, entities) {
        const session = this.getSession();
        try {
            for (const entity of entities) {
                await session.writeTransaction(tx =>
                    tx.run(
                        `
                        MATCH (d:Document {url: $docUrl})
                        MERGE (e:Entity {name: $name})
                        SET e.type = $type
                        MERGE (d)-[r:MENTIONS]->(e)
                        SET r.type = $relation
                        `,
                        {
                            docUrl,
                            name: entity.name,
                            type: entity.type,
                            relation: entity.relation || 'MENTIONS'
                        }
                    )
                );
            }
        } finally {
            await session.close();
        }
    }

    /**
     * Retrieves the graph for a specific document.
     * @param {string} docUrl 
     */
    async getDocumentGraph(docUrl) {
        const session = this.getSession();
        try {
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

                nodes.set(doc.identity.toString(), {
                    id: doc.identity.toString(),
                    label: doc.properties.name || 'Document',
                    type: 'Document',
                    properties: doc.properties
                });

                nodes.set(node.identity.toString(), {
                    id: node.identity.toString(),
                    label: node.properties.name || node.labels[0],
                    type: node.labels[0],
                    properties: node.properties
                });

                edges.push({
                    id: rel.identity.toString(),
                    source: rel.start.toString(),
                    target: rel.end.toString(),
                    label: rel.type
                });
            });

            return {
                nodes: Array.from(nodes.values()),
                edges: edges
            };
        } finally {
            await session.close();
        }
    }
}

module.exports = new Neo4jService();
