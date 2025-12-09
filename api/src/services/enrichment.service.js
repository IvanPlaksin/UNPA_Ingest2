const axios = require('axios');

class EnrichmentService {
    constructor() {
        this.baseUrl = process.env.LLM_API_BASE || 'http://localhost:8000/v1';
        this.model = process.env.LLM_MODEL || 'llama3'; // Default model
    }

    async _callLLM(prompt, systemPrompt = "You are a helpful AI assistant for technical documentation analysis.") {
        try {
            const response = await axios.post(`${this.baseUrl}/chat/completions`, {
                model: this.model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt }
                ],
                temperature: 0.1, // Low temperature for deterministic results
                max_tokens: 2000, // Increased for JSON output
                response_format: { type: "json_object" } // Try to enforce JSON mode if supported by Ollama/Model
            });

            return response.data.choices[0].message.content.trim();
        } catch (error) {
            console.error("LLM Call Failed:", error.message);
            if (error.response) {
                console.error("Data:", error.response.data);
            }
            throw error;
        }
    }

    /**
     * Generates a 1-sentence summary of the text.
     * @param {string} text 
     * @returns {Promise<string>}
     */
    async generateSummary(text) {
        const prompt = `Summarize the following text in 1 sentence focusing on technical intent and key facts:\n\n${text}`;
        try {
            return await this._callLLM(prompt);
        } catch (e) {
            return "Summary generation failed.";
        }
    }

    /**
     * Extracts entities and relations for a graph.
     * @param {string} text 
     * @returns {Promise<{nodes: Array, edges: Array}>}
     */
    async extractGraphEntities(text) {
        const systemPrompt = "You are a Knowledge Engineer. Extract entities and relationships from the text. Nodes: Person, System, Organization, Location, Date, Metric, Concept. Relations: MENTIONS, RESPONSIBLE_FOR, AFFECTS, DEPENDS_ON, HAS_DEADLINE. Return ONLY valid JSON: { \"nodes\": [{ \"id\": \"...\", \"type\": \"...\" }], \"edges\": [{ \"source\": \"...\", \"target\": \"...\", \"label\": \"...\" }] }.";

        const prompt = `
        Analyze the following text and extract structured knowledge (Entities and Relationships).
        
        Text:
        "${text}"
        `;

        try {
            let result = await this._callLLM(prompt, systemPrompt);

            // Robust Parsing: Extract JSON object using Regex
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                result = jsonMatch[0];
            }

            const parsed = JSON.parse(result);

            // Basic validation and sanitization
            if (!parsed.nodes || !Array.isArray(parsed.nodes)) parsed.nodes = [];
            if (!parsed.edges || !Array.isArray(parsed.edges)) parsed.edges = [];

            // Ensure IDs are clean (lowercase, underscores)
            parsed.nodes.forEach(node => {
                if (node.id) node.id = node.id.toLowerCase().replace(/\s+/g, '_');
            });
            parsed.edges.forEach(edge => {
                if (edge.source) edge.source = edge.source.toLowerCase().replace(/\s+/g, '_');
                if (edge.target) edge.target = edge.target.toLowerCase().replace(/\s+/g, '_');
            });

            return parsed;
        } catch (e) {
            console.warn("Graph extraction failed or returned invalid JSON:", e.message);
            return { nodes: [], edges: [] };
        }
    }
}

module.exports = new EnrichmentService();
