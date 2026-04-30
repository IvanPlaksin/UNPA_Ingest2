require('dotenv').config();

const CONFIG = {
    redis: {
        url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
    },
    neo4j: {
        uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
        user: process.env.NEO4J_USERNAME || process.env.NEO4J_USER || 'memgraph',
        password: process.env.NEO4J_PASSWORD || process.env.MEMGRAPH_PASSWORD || 'secret_password_123'
    },
    ollama: {
        baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434'
    },
    tei: {
        url: process.env.TEI_URL || 'http://tei:80',
        batchSize: parseInt(process.env.TEI_BATCH_SIZE) || 50,
        maxRetries: parseInt(process.env.TEI_MAX_RETRIES) || 3,
        retryDelayMs: parseInt(process.env.TEI_RETRY_DELAY_MS) || 1000,
        batchDelayMs: parseInt(process.env.TEI_BATCH_DELAY_MS) || 100,
        timeout: parseInt(process.env.TEI_TIMEOUT_MS) || 30000
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
