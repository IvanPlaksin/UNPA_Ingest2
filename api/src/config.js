require('dotenv').config();

const CONFIG = {
    redis: {
        url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
    },
    neo4j: {
        uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
        user: process.env.NEO4J_USER || 'neo4j',
        password: process.env.NEO4J_PASSWORD || 'password'
    },
    chroma: {
        url: process.env.CHROMA_URL || 'http://localhost:8000'
    },
    ollama: {
        baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434'
    },
    gemini: {
        apiKey: process.env.GEMINI_API_KEY
    },
    AVAILABLE_MODELS: [
        { id: 'llama3', name: 'Llama 3 (Local)', provider: 'local', modelName: 'llama3' },
        { id: 'gemini-pro', name: 'Gemini Pro (Cloud)', provider: 'cloud', modelName: 'gemini-pro' }
    ]
};

module.exports = CONFIG;
