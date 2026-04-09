/**
 * Storage Layer Initialization
 *
 * Инициализирует слой хранения данных:
 * - Graph schema (Memgraph constraints и indices)
 * - Vector collections (Qdrant collections и payload indices)
 *
 * Используется при старте приложения для обеспечения готовности
 * инфраструктуры хранения перед началом работы.
 */

const { GraphSchemaManager } = require('./graph/GraphSchemaManager');
const { CollectionManager } = require('./vector/CollectionManager');
const memgraphService = require('./memgraph.service');

// Singleton instances для доступа из других модулей
let graphManager = null;
let vectorManager = null;

/**
 * Инициализация слоя хранения
 * @param {Object} options - Опции инициализации
 * @param {boolean} options.skipGraph - Пропустить инициализацию графа
 * @param {boolean} options.skipVector - Пропустить инициализацию векторов
 * @returns {Promise<{graphManager, vectorManager}>}
 */
async function initializeStorage(options = {}) {
    console.log('🚀 Initializing storage layer...');

    const startTime = Date.now();
    const results = {
        graph: { success: false, error: null },
        vector: { success: false, error: null }
    };

    // Graph schema initialization
    if (!options.skipGraph) {
        try {
            graphManager = new GraphSchemaManager(memgraphService);
            await graphManager.initializeSchema();
            results.graph.success = true;
        } catch (error) {
            console.error('⚠️ Graph initialization failed:', error.message);
            results.graph.error = error.message;
            // Не прерываем - приложение может работать без графа
        }
    } else {
        console.log('  ⏭️  Graph initialization skipped');
    }

    // Vector collections initialization
    if (!options.skipVector) {
        try {
            const qdrantUrl = process.env.QDRANT_URL || 'http://qdrant:6333';
            vectorManager = new CollectionManager(qdrantUrl);
            await vectorManager.initializeCollections();
            results.vector.success = true;
        } catch (error) {
            console.error('⚠️ Vector initialization failed:', error.message);
            results.vector.error = error.message;
            // Не прерываем - приложение может работать без векторов
        }
    } else {
        console.log('  ⏭️  Vector initialization skipped');
    }

    const duration = Date.now() - startTime;

    if (results.graph.success && results.vector.success) {
        console.log(`✅ Storage layer ready (${duration}ms)`);
    } else {
        console.log(`⚠️ Storage layer partially ready (${duration}ms)`);
        if (results.graph.error) console.log(`   - Graph: ${results.graph.error}`);
        if (results.vector.error) console.log(`   - Vector: ${results.vector.error}`);
    }

    return { graphManager, vectorManager, results };
}

/**
 * Получение GraphSchemaManager instance
 */
function getGraphManager() {
    if (!graphManager) {
        throw new Error('Storage not initialized. Call initializeStorage() first.');
    }
    return graphManager;
}

/**
 * Получение CollectionManager instance
 */
function getVectorManager() {
    if (!vectorManager) {
        throw new Error('Storage not initialized. Call initializeStorage() first.');
    }
    return vectorManager;
}

/**
 * Проверка здоровья слоя хранения
 */
async function checkStorageHealth() {
    const health = {
        graph: { healthy: false, details: null },
        vector: { healthy: false, details: null },
        overall: false
    };

    // Проверка графа
    if (graphManager) {
        try {
            const validation = await graphManager.validateGraphIntegrity();
            health.graph.healthy = validation.valid;
            health.graph.details = validation;
        } catch (error) {
            health.graph.details = { error: error.message };
        }
    }

    // Проверка векторов
    if (vectorManager) {
        try {
            const vectorHealth = await vectorManager.healthCheck();
            health.vector.healthy = vectorHealth.healthy;
            health.vector.details = vectorHealth;
        } catch (error) {
            health.vector.details = { error: error.message };
        }
    }

    health.overall = health.graph.healthy && health.vector.healthy;

    return health;
}

/**
 * Получение статистики хранилища
 */
async function getStorageStats() {
    const stats = {
        graph: null,
        vector: null
    };

    if (graphManager) {
        try {
            const validation = await graphManager.validateGraphIntegrity();
            stats.graph = validation.stats;
        } catch (error) {
            stats.graph = { error: error.message };
        }
    }

    if (vectorManager) {
        try {
            stats.vector = await vectorManager.getStats();
        } catch (error) {
            stats.vector = { error: error.message };
        }
    }

    return stats;
}

module.exports = {
    initializeStorage,
    getGraphManager,
    getVectorManager,
    checkStorageHealth,
    getStorageStats
};
