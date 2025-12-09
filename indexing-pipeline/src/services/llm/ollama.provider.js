const axios = require('axios');
const CONFIG = require('../../config');

class OllamaProvider {
    constructor(modelName) {
        this.modelName = modelName;
        this.baseUrl = CONFIG.ollama.baseUrl;
    }

    async ensureModelExists() {
        try {
            // Check if model exists (simplified check, usually you'd list models)
            // For now, we'll try to pull it. In a real scenario, check first.
            console.log(`[Ollama] Ensuring model '${this.modelName}' exists...`);
            await axios.post(`${this.baseUrl}/api/pull`, { name: this.modelName });
            console.log(`[Ollama] Model '${this.modelName}' ready.`);
        } catch (error) {
            console.error(`[Ollama] Error pulling model: ${error.message}`);
        }
    }

    async generateText(prompt) {
        try {
            const response = await axios.post(`${this.baseUrl}/api/generate`, {
                model: this.modelName,
                prompt: prompt,
                stream: false
            });
            return response.data.response;
        } catch (error) {
            console.error(`[Ollama] Generate error: ${error.message}`);
            throw error;
        }
    }

    async generateSummary(text) {
        try {
            const prompt = `Summarize the following text in one sentence, focusing on technical or business intent. Text: ${text}`;
            const response = await axios.post(`${this.baseUrl}/api/generate`, {
                model: this.modelName,
                prompt: prompt,
                stream: false,
                options: {
                    temperature: 0.2
                }
            });
            return response.data.response;
        } catch (error) {
            console.error(`[Ollama] Summary error: ${error.message}`);
            throw error;
        }
    }

    async embedText(text) {
        try {
            // Try new endpoint first
            const response = await axios.post(`${this.baseUrl}/api/embed`, {
                model: this.modelName,
                input: text
            });
            return response.data.embeddings[0];
        } catch (error) {
            // Fallback to old endpoint if 404 (though 404 was the original error, so maybe this IS the fix if the old one is gone)
            // But if the original error was 404 on /api/embeddings, then maybe the user has a NEW ollama that removed it?
            // Or maybe the user has an OLD ollama that doesn't have /api/embed?
            // 404 on /api/embeddings usually means model not found OR endpoint not found.

            // Let's try to log more details if it fails again
            console.error(`[Ollama] Embed error: ${error.message}`);
            if (error.response) {
                console.error(`[Ollama] Status: ${error.response.status}`);
                console.error(`[Ollama] Data:`, error.response.data);
            }
            throw error;
        }
    }
}

module.exports = OllamaProvider;
