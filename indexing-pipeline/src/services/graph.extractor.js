const { getAIProvider } = require('./llm/ai.factory');

class GraphExtractor {
    constructor() {
        // Default to local Llama 3, but allow override
        this.ai = getAIProvider('local', 'llama3');
    }

    /**
     * Extracts a graph (nodes and edges) from a text chunk using an LLM.
     * @param {string} text The text chunk to analyze.
     * @param {string} parentId The ID of the parent document/node.
     * @param {object} aiProvider Optional AI provider instance.
     * @returns {Promise<{nodes: Array, edges: Array}>}
     */
    async extractGraphFromChunk(text, parentId, aiProvider = null) {
        const ai = aiProvider || this.ai;

        const systemPrompt = "Ты эксперт по извлечению знаний. Твоя цель — структурировать неструктурированный текст в граф.";

        const userPrompt = `
Analyze the following text from a project document/email.
Extract key entities and relationships.

Target Entity Types: [Person, System, Component, Date, Metric, Risk]
Target Relationship Types: [MENTIONS, RESPONSIBLE_FOR, AFFECTS, DEPENDS_ON, DEADLINE_IS]

Text: """${text}"""

Return ONLY valid JSON in the following format (no markdown, no explanations):
{
  "nodes": [
    { "id": "entity_name_normalized", "label": "Original Name", "type": "EntityType" }
  ],
  "edges": [
    { "source": "entity_name_normalized", "target": "entity_name_normalized", "label": "RELATIONSHIP_TYPE" }
  ]
}
`;

        try {
            const response = await ai.generateText(userPrompt, systemPrompt);
            return this._parseResponse(response, parentId);
        } catch (error) {
            console.error("[GraphExtractor] Extraction failed:", error);
            return { nodes: [], edges: [] };
        }
    }

    _parseResponse(response, parentId) {
        let jsonStr = response;

        // Attempt to extract JSON block if wrapped in markdown or extra text
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonStr = jsonMatch[0];
        }

        try {
            const data = JSON.parse(jsonStr);
            const nodes = data.nodes || [];
            const edges = data.edges || [];

            // Normalize and Enrich
            const enrichedNodes = nodes.map(n => ({
                ...n,
                id: this._normalizeId(n.id),
                data: {
                    source: "ai_extraction",
                    parentId: parentId
                }
            }));

            const enrichedEdges = edges.map(e => ({
                ...e,
                source: this._normalizeId(e.source),
                target: this._normalizeId(e.target),
                data: {
                    source: "ai_extraction"
                }
            }));

            // Add "CONTAINS_ENTITY" edges from Parent -> Entity
            enrichedNodes.forEach(n => {
                enrichedEdges.push({
                    source: parentId,
                    target: n.id,
                    label: "CONTAINS_ENTITY",
                    data: { source: "system_link" }
                });
            });

            return { nodes: enrichedNodes, edges: enrichedEdges };

        } catch (e) {
            console.warn("[GraphExtractor] Failed to parse JSON response:", response.substring(0, 100) + "...");
            return { nodes: [], edges: [] };
        }
    }

    _normalizeId(id) {
        if (!id) return `unknown_${Math.random().toString(36).substring(7)}`;
        return id.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    }
}

module.exports = new GraphExtractor();
