const neo4j = require('neo4j-driver');

const MEMGRAPH_URI = process.env.MEMGRAPH_URI || 'bolt://memgraph:7687';
const MEMGRAPH_USER = process.env.MEMGRAPH_USER || '';
const MEMGRAPH_PASSWORD = process.env.MEMGRAPH_PASSWORD || '';

class MemgraphService {
    constructor() {
        if (!MemgraphService.instance) {
            this.driver = neo4j.driver(MEMGRAPH_URI, neo4j.auth.basic(MEMGRAPH_USER, MEMGRAPH_PASSWORD));
            MemgraphService.instance = this;
        }
        return MemgraphService.instance;
    }

    /**
     * Executes a Cypher query.
     * @param {string} cypher - Cypher query string.
     * @param {object} params - Query parameters.
     * @returns {Promise<object>} - Result object.
     */
    async executeQuery(cypher, params = {}) {
        const session = this.driver.session();
        try {
            const result = await session.run(cypher, params);
            return result;
        } catch (error) {
            console.error('Error executing query:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    /**
     * Merges a node into the graph using 'id' as the key.
     * @param {string} label - Node label.
     * @param {object} properties - Node properties. Must contain 'id'.
     */
    async mergeNode(label, properties) {
        if (!properties.id) {
            throw new Error('Properties must contain an "id" field for merging.');
        }

        const session = this.driver.session();
        try {
            // Separate id from other properties for the ON CREATE/ON MATCH clauses if needed
            // For simplicity, we'll just set all properties on the node

            const query = `
        MERGE (n:${label} { id: $id })
        SET n += $properties
        RETURN n
      `;

            await session.run(query, { id: properties.id, properties });
            console.log(`Merged node with label '${label}' and id '${properties.id}'.`);
        } catch (error) {
            console.error('Error merging node:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    /**
     * Merges a relationship between two nodes.
     * @param {string} fromId - ID of the source node.
     * @param {string} toId - ID of the target node.
     * @param {string} type - Relationship type.
     * @param {object} properties - Relationship properties.
     */
    async mergeRelationship(fromId, toId, type, properties = {}) {
        const session = this.driver.session();
        try {
            const query = `
        MATCH (a), (b)
        WHERE a.id = $fromId AND b.id = $toId
        MERGE (a)-[r:${type}]->(b)
        SET r += $properties
        RETURN r
      `;

            await session.run(query, { fromId, toId, properties });
            console.log(`Merged relationship '${type}' from '${fromId}' to '${toId}'.`);
        } catch (error) {
            console.error('Error merging relationship:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    /**
     * Finds a node by its fileHash property.
     * @param {string} hash - The SHA-256 hash of the file.
     * @returns {Promise<object|null>} - The node object or null if not found.
     */
    async findNodeByHash(hash) {
        const session = this.driver.session();
        try {
            const query = `
                MATCH (n:Document {fileHash: $hash})
                RETURN n
                LIMIT 1
            `;
            const result = await session.run(query, { hash });
            if (result.records.length > 0) {
                return result.records[0].get('n').properties;
            }
            return null;
        } catch (error) {
            console.error('Error finding node by hash:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    async close() {
        await this.driver.close();
    }
}

module.exports = new MemgraphService();
