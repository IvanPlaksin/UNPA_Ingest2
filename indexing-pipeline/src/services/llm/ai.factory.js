const OllamaProvider = require('./ollama.provider');
const GeminiProvider = require('./gemini.provider');

class AIFactory {
    static createProvider(providerType, modelName) {
        switch (providerType) {
            case 'local':
                return new OllamaProvider(modelName);
            case 'cloud':
                return new GeminiProvider(modelName);
            default:
                throw new Error(`Unknown provider type: ${providerType}`);
        }
    }
}

function getAIProvider(providerType, modelName) {
    return AIFactory.createProvider(providerType, modelName);
}

module.exports = {
    AIFactory,
    getAIProvider,
    createProvider: AIFactory.createProvider
};
