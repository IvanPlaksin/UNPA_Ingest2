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

        const systemPrompt = "You are a precise Knowledge Graph extractor. You must output STRICT VALID JSON only. No markdown. No explanations.";

        const userPrompt = `
Analyze the following text and extract a Knowledge Graph.

STRICT ONTOLOGY:
Node Types: [Person, System, WorkItem, Document, Commit, Concept, Technology]
Edge Types:
- MENTIONS (General link)
- RESPONSIBLE_FOR (Person -> System/Task)
- DEPENDS_ON (System -> System)
- AFFECTS (Commit -> System)
- DEFINED_IN (Concept -> Document)
- IMPLEMENTS (Code -> WorkItem)

Text: """${text}"""

Return ONLY valid JSON obeying the following interface:
{
  "nodes": [
    { "id": "snake_case_id", "label": "Original Name", "type": "OneOfAllowedTypes" }
  ],
  "edges": [
    { "source": "id_source", "target": "id_target", "label": "OneOfAllowedEdgeTypes" }
  ]
}
`;

        try {
            const response = await ai.generateText(userPrompt, systemPrompt);
            return this._parseResponse(response, parentId);
        } catch (error) {
            console.error("[GraphExtractor] Extraction failed:", error);
            // Return empty graph on failure to prevent pipeline crash
            return { nodes: [], edges: [] };
        }
    }

    _parseResponse(response, parentId) {
        try {
            const jsonStr = this._cleanJson(response);
            const data = JSON.parse(jsonStr);

            const nodes = data.nodes || [];
            const edges = data.edges || [];

            // Validation & Normalization
            const validNodes = [];
            const validEdges = [];

            const allowedNodeTypes = ['Person', 'System', 'WorkItem', 'Document', 'Commit', 'Concept', 'Technology'];
            const allowedEdgeTypes = ['MENTIONS', 'RESPONSIBLE_FOR', 'DEPENDS_ON', 'AFFECTS', 'DEFINED_IN', 'IMPLEMENTS'];

            // 1. Process Nodes
            nodes.forEach(n => {
                if (!n.id || !n.type) return;

                // Enforce Node Type (fallback to Concept if invalid)
                let type = n.type;
                if (!allowedNodeTypes.includes(type)) {
                    type = 'Concept';
                }

                validNodes.push({
                    id: this._normalizeId(n.id),
                    label: n.label || n.id,
                    type: type,
                    data: {
                        source: "ai_extraction",
                        parentId: parentId,
                        status: 'AI_VERIFIED',
                        initiator: 'Gemini-3-Pro'
                    }
                });
            });

            // 2. Process Edges
            edges.forEach(e => {
                if (!e.source || !e.target || !e.label) return;

                if (!allowedEdgeTypes.includes(e.label)) {
                    // Skip invalid edge types or default to MENTIONS?
                    // Strict ontology request suggests skipping or fixing. Let's default to MENTIONS.
                    e.label = 'MENTIONS';
                }

                validEdges.push({
                    source: this._normalizeId(e.source),
                    target: this._normalizeId(e.target),
                    label: e.label,
                    data: { source: "ai_extraction" }
                });
            });

            // 3. Add Link to Parent
            validNodes.forEach(n => {
                validEdges.push({
                    id: `link_${parentId}_${n.id}`,
                    source: parentId,
                    target: n.id,
                    label: "CONTAINS_ENTITY", // System edge, acts like DEFINED_IN but usually structural
                    data: { source: "system_link" }
                });
            });

            return { nodes: validNodes, edges: validEdges };

        } catch (e) {
            console.warn("[GraphExtractor] Failed to parse JSON response:", response.substring(0, 100) + "...", e.message);
            return { nodes: [], edges: [] };
        }
    }

    _cleanJson(text) {
        // Remove markdown blocks
        let clean = text.replace(/```json/g, '').replace(/```/g, '');
        // Trim whitespace
        return clean.trim();
    }

    _normalizeId(id) {
        if (!id) return `unknown_${Math.random().toString(36).substring(7)}`;
        // snake_case: lowercase, replace spaces with _, remove non-alphanumeric
        return id.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    }
}

module.exports = new GraphExtractor();
