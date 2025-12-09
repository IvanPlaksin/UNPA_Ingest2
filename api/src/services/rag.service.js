const teiService = require('./tei.service');
const qdrantService = require('./qdrant.service');
const memgraphService = require('./memgraph.service');

class RagService {

    /**
     * Retrieves context for a given query using GraphRAG (Vector + Graph).
     * @param {string} query - The user's query.
     * @returns {Promise<{context: string, sources: Array}>}
     */
    async retrieveContext(query) {
        try {
            console.log(`[RagService] Retrieving context for: "${query}"`);

            // 1. Embed Query
            const [vector] = await teiService.getEmbeddings([query]);

            // 2. Vector Search (Qdrant)
            // Find top 10 relevant atoms
            const searchResults = await qdrantService.searchSimilar(vector, 10, {
                score_threshold: 0.75
            });

            if (!searchResults || searchResults.length === 0) {
                console.log("[RagService] No relevant context found in Qdrant.");
                return { context: "", sources: [] };
            }

            console.log(`[RagService] Found ${searchResults.length} relevant atoms.`);

            const sources = [];
            let contextParts = [];
            contextParts.push("=== CONTEXT START ===");

            // 3. Graph Expansion (Memgraph) & Context Construction
            for (let i = 0; i < searchResults.length; i++) {
                const result = searchResults[i];
                const sourceIndex = i + 1; // [1], [2], etc.

                const atomId = result.id; // UUID from Qdrant
                const payload = result.payload;
                const score = result.score;

                // Graph Expansion: Find related entities
                // We assume the atom ID in Qdrant matches the Atom ID in Memgraph
                // Or we use the original_id from payload if Qdrant ID is a random UUID
                const graphId = payload.original_id || atomId;

                // Fetch graph context (1st level connections)
                const relatedEntities = await this.getRelatedEntities(graphId);
                const graphText = this.formatGraphToText(relatedEntities);

                // Construct Text Block
                let sourceBlock = `SOURCE [${sourceIndex}] (Title: "${payload.title || 'Unknown'}", Type: ${payload.type || 'Document'})\n`;
                sourceBlock += `CONTENT: ${payload.text}\n`;

                if (graphText) {
                    sourceBlock += `KNOWLEDGE GRAPH: ${graphText}\n`;
                }

                contextParts.push(sourceBlock);

                sources.push({
                    index: sourceIndex,
                    id: graphId,
                    title: payload.title,
                    score: score,
                    path: payload.path,
                    type: payload.type
                });
            }

            contextParts.push("=== CONTEXT END ===");

            return {
                context: contextParts.join('\n\n'),
                sources: sources
            };

        } catch (error) {
            console.error("[RagService] Error retrieving context:", error);
            // Fail gracefully, return empty context
            return { context: "", sources: [] };
        }
    }

    /**
     * Converts graph entities to natural language sentences.
     * @param {Array<{name: string, type: string, relation: string}>} entities 
     * @returns {string}
     */
    formatGraphToText(entities) {
        if (!entities || entities.length === 0) return "";

        const sentences = entities.map(e => {
            // e.g. "MENTIONS 'Login API' (System)"
            // e.g. "DEPENDS_ON 'Auth Service' (Service)"
            const relation = e.relation.replace(/_/g, ' ').toLowerCase();
            return `This document ${relation} '${e.name}' (${e.type}).`;
        });

        return sentences.join(' ');
    }

    /**
     * Returns the system prompt optimized for the context.
     * @param {string} contextText 
     * @returns {string}
     */
    getSystemPrompt(contextText) {
        return `You are an AI assistant for ProjectAdvisor.
Answer ONLY based on the provided Context below.
If the answer is not in the context, say "I don't have enough information".
ALWAYS cite sources using the format [1], [2] at the end of sentences when referring to information from that source.

${contextText}`;
    }

    /**
     * Helper to find related entities in Memgraph.
     * @param {string} atomId 
     * @returns {Promise<Array<{name: string, type: string, relation: string}>>}
     */
    async getRelatedEntities(atomId) {
        try {
            const query = `
                MATCH (a:Atom {id: $atomId})-[r:MENTIONS|CONTAINS]-(related)
                RETURN related.name as name, related.type as type, type(r) as relation
                LIMIT 5
            `;

            const result = await memgraphService.executeQuery(query, { atomId });

            return result.records.map(record => ({
                name: record.get('name'),
                type: record.get('type') || 'Entity',
                relation: record.get('relation')
            }));

        } catch (e) {
            console.warn(`[RagService] Failed to expand graph for atom ${atomId}:`, e.message);
            return [];
        }
    }
}

module.exports = new RagService();
