const { GoogleGenerativeAI } = require('@google/generative-ai');
const CONFIG = require('../../config');

class GeminiProvider {
    constructor(modelName) {
        this.modelName = modelName;
        this.genAI = new GoogleGenerativeAI(CONFIG.gemini.apiKey);
        this.model = this.genAI.getGenerativeModel({ model: modelName });
    }

    async ensureModelExists() {
        // Cloud models are assumed to exist if the API key is valid
        return true;
    }

    async generateText(prompt) {
        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error(`[Gemini] Generate error: ${error.message}`);
            throw error;
        }
    }

    async embedText(text) {
        try {
            const embeddingModel = this.genAI.getGenerativeModel({ model: 'embedding-001' });
            const result = await embeddingModel.embedContent(text);
            return result.embedding.values;
        } catch (error) {
            console.error(`[Gemini] Embed error: ${error.message}`);
            throw error;
        }
    }
}

module.exports = GeminiProvider;
