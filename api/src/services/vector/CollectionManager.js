/**
 * CollectionManager - Управление коллекциями Qdrant
 *
 * Отвечает за:
 * - Создание и настройка коллекций
 * - Настройка payload indices
 * - Управление жизненным циклом коллекций
 */

const { QdrantClient } = require('@qdrant/js-client-rest');

const QDRANT_URL = process.env.QDRANT_URL || 'http://qdrant:6333';

/**
 * Конфигурация коллекций для различных типов данных
 */
const COLLECTIONS = [
    {
        name: 'embeddings_code',
        description: 'Embeddings для кода: функции, классы, методы',
        vectorSize: 1024,  // TEI default dimension (multilingual-e5-large)
        distance: 'Cosine',
        payloadIndices: [
            { field: 'quantum_id', type: 'keyword' },
            { field: 'file_path', type: 'keyword' },
            { field: 'language', type: 'keyword' },
            { field: 'entity_type', type: 'keyword' },  // function, class, method
            { field: 'project_id', type: 'keyword' },
            { field: 'qualified_name', type: 'keyword' }
        ]
    },
    {
        name: 'embeddings_docs',
        description: 'Embeddings для документов: Word, PDF, Confluence',
        vectorSize: 1024,
        distance: 'Cosine',
        payloadIndices: [
            { field: 'quantum_id', type: 'keyword' },
            { field: 'doc_type', type: 'keyword' },  // pdf, docx, confluence
            { field: 'source_system', type: 'keyword' },
            { field: 'project_id', type: 'keyword' },
            { field: 'title', type: 'text' },
            { field: 'author', type: 'keyword' }
        ]
    },
    {
        name: 'embeddings_workitems',
        description: 'Embeddings для WorkItems из ADO',
        vectorSize: 1024,
        distance: 'Cosine',
        payloadIndices: [
            { field: 'quantum_id', type: 'keyword' },
            { field: 'work_item_id', type: 'integer' },
            { field: 'work_item_type', type: 'keyword' },  // Bug, Task, Feature, etc.
            { field: 'project_id', type: 'keyword' },
            { field: 'state', type: 'keyword' },
            { field: 'assigned_to', type: 'keyword' },
            { field: 'area_path', type: 'keyword' }
        ]
    },
    {
        name: 'embeddings_unified',
        description: 'Унифицированная коллекция для cross-domain поиска',
        vectorSize: 1024,
        distance: 'Cosine',
        payloadIndices: [
            { field: 'quantum_id', type: 'keyword' },
            { field: 'source_type', type: 'keyword' },  // code, doc, workitem, commit
            { field: 'primary_type', type: 'keyword' },
            { field: 'project_id', type: 'keyword' },
            { field: 'created_at', type: 'datetime' },
            { field: 'relevance_score', type: 'float' }
        ]
    }
];

class CollectionManager {
    constructor(qdrantUrl = QDRANT_URL) {
        this.client = new QdrantClient({ url: qdrantUrl });
        this.collections = COLLECTIONS;
    }

    /**
     * Инициализация всех коллекций
     */
    async initializeCollections() {
        console.log('🔧 Initializing Qdrant collections...');

        for (const config of this.collections) {
            await this.ensureCollection(config);
        }

        console.log('✅ Qdrant collections initialized');
        return true;
    }

    /**
     * Создание коллекции если не существует
     */
    async ensureCollection(config) {
        const exists = await this.collectionExists(config.name);

        if (!exists) {
            // Создаем коллекцию
            await this.client.createCollection(config.name, {
                vectors: {
                    size: config.vectorSize,
                    distance: config.distance,
                },
                // Оптимизация для частых обновлений
                optimizers_config: {
                    default_segment_number: 2,
                    indexing_threshold: 20000
                },
                // Настройки репликации (для продакшена)
                replication_factor: 1,
                write_consistency_factor: 1
            });

            // Создаем payload индексы
            await this.createPayloadIndices(config.name, config.payloadIndices);

            console.log(`  ✅ Collection "${config.name}" created (${config.description})`);
        } else {
            // Проверяем и добавляем недостающие индексы
            await this.ensurePayloadIndices(config.name, config.payloadIndices);
            console.log(`  ⏭️  Collection "${config.name}" already exists`);
        }
    }

    /**
     * Создание payload индексов для коллекции
     */
    async createPayloadIndices(collectionName, indices) {
        for (const indexConfig of indices) {
            try {
                await this.client.createPayloadIndex(collectionName, {
                    field_name: indexConfig.field,
                    field_schema: this.mapFieldType(indexConfig.type)
                });
            } catch (error) {
                // Индекс может уже существовать
                if (!error.message?.includes('already exists')) {
                    console.warn(`  ⚠️ Index warning for ${indexConfig.field}: ${error.message}`);
                }
            }
        }
    }

    /**
     * Проверка и добавление недостающих индексов
     */
    async ensurePayloadIndices(collectionName, indices) {
        try {
            const collectionInfo = await this.client.getCollection(collectionName);
            const existingIndices = Object.keys(collectionInfo.payload_schema || {});

            for (const indexConfig of indices) {
                if (!existingIndices.includes(indexConfig.field)) {
                    try {
                        await this.client.createPayloadIndex(collectionName, {
                            field_name: indexConfig.field,
                            field_schema: this.mapFieldType(indexConfig.type)
                        });
                        console.log(`    ➕ Added missing index: ${indexConfig.field}`);
                    } catch (error) {
                        // Игнорируем ошибки - индекс может создаваться параллельно
                    }
                }
            }
        } catch (error) {
            console.warn(`  ⚠️ Could not verify indices for ${collectionName}: ${error.message}`);
        }
    }

    /**
     * Маппинг типов полей в Qdrant schema types
     */
    mapFieldType(type) {
        const typeMap = {
            'keyword': 'keyword',
            'text': 'text',
            'integer': 'integer',
            'float': 'float',
            'bool': 'bool',
            'datetime': 'datetime',
            'geo': 'geo'
        };
        return typeMap[type] || 'keyword';
    }

    /**
     * Проверка существования коллекции
     */
    async collectionExists(name) {
        try {
            await this.client.getCollection(name);
            return true;
        } catch (error) {
            if (error.status === 404 || error.message?.includes('not found')) {
                return false;
            }
            throw error;
        }
    }

    /**
     * Получение информации о коллекции
     */
    async getCollectionInfo(name) {
        try {
            const info = await this.client.getCollection(name);
            return {
                name: name,
                vectorsCount: info.vectors_count,
                pointsCount: info.points_count,
                segmentsCount: info.segments_count,
                status: info.status,
                vectorSize: info.config?.params?.vectors?.size,
                distance: info.config?.params?.vectors?.distance,
                payloadSchema: info.payload_schema
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Получение информации о всех управляемых коллекциях
     */
    async getAllCollectionsInfo() {
        const result = [];
        for (const config of this.collections) {
            const info = await this.getCollectionInfo(config.name);
            result.push({
                config: config,
                info: info,
                exists: info !== null
            });
        }
        return result;
    }

    /**
     * Удаление коллекции
     */
    async deleteCollection(name) {
        try {
            await this.client.deleteCollection(name);
            console.log(`🗑️ Collection "${name}" deleted`);
            return true;
        } catch (error) {
            if (error.status === 404) {
                return false;
            }
            throw error;
        }
    }

    /**
     * Пересоздание коллекции (удаление + создание)
     */
    async recreateCollection(name) {
        const config = this.collections.find(c => c.name === name);
        if (!config) {
            throw new Error(`Collection config not found for: ${name}`);
        }

        await this.deleteCollection(name);
        await this.ensureCollection(config);
        return true;
    }

    /**
     * Получение статистики по всем коллекциям
     */
    async getStats() {
        const stats = {
            collections: [],
            totalPoints: 0,
            totalVectors: 0
        };

        for (const config of this.collections) {
            const info = await this.getCollectionInfo(config.name);
            if (info) {
                stats.collections.push(info);
                stats.totalPoints += info.pointsCount || 0;
                stats.totalVectors += info.vectorsCount || 0;
            }
        }

        return stats;
    }

    /**
     * Проверка здоровья всех коллекций
     */
    async healthCheck() {
        const health = {
            healthy: true,
            collections: []
        };

        for (const config of this.collections) {
            const info = await this.getCollectionInfo(config.name);
            const collectionHealth = {
                name: config.name,
                exists: info !== null,
                status: info?.status || 'not_found',
                healthy: info?.status === 'green'
            };
            health.collections.push(collectionHealth);

            if (!collectionHealth.exists || !collectionHealth.healthy) {
                health.healthy = false;
            }
        }

        return health;
    }
}

module.exports = { CollectionManager, COLLECTIONS };
