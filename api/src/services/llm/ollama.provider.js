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

            var response = await axios.post(`${this.baseUrl}/api/pull`, { name: this.modelName });
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
            const response = await axios.post(`${this.baseUrl}/api/embeddings`, {
                model: this.modelName,
                prompt: text
            });
            return response.data.embedding;
        } catch (error) {
            console.error(`[Ollama] Embed error: ${error.message}`);
            throw error;
        }
    }
}

module.exports = OllamaProvider;
