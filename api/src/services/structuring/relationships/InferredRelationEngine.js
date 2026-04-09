/**
 * InferredRelationEngine - Движок для вывода связей на основе различных методов анализа
 *
 * Вычисляет и создаёт "выведенные" связи между сущностями на основе:
 * - Семантической близости (эмбеддинги)
 * - Совместного упоминания (co-occurrence)
 * - Паттернов именования
 * - Структурных связей
 * - Временной близости (коммиты)
 */

const { EmbeddingService } = require('../embeddings/EmbeddingService');

/**
 * Методы вывода связей
 */
const InferenceMethod = {
    SEMANTIC_SIMILARITY: 'semantic_similarity',
    CO_OCCURRENCE: 'co_occurrence',
    NAMING_PATTERN: 'naming_pattern',
    STRUCTURAL: 'structural',
    TEMPORAL_PROXIMITY: 'temporal_proximity',
};

/**
 * Типы выведенных связей
 */
const InferredRelationType = {
    SIMILAR_TO: 'SIMILAR_TO',
    RELATED_TO: 'RELATED_TO',
    DEPENDS_ON: 'DEPENDS_ON',
    DERIVED_FROM: 'DERIVED_FROM',
    CO_OCCURS_WITH: 'CO_OCCURS_WITH',
    IMPLEMENTS_PATTERN: 'IMPLEMENTS_PATTERN',
    CHANGED_WITH: 'CHANGED_WITH',
};

/**
 * Паттерны именования для анализа
 */
const NamingPatterns = {
    // Service -> Entity (UserService -> User)
    SERVICE_ENTITY: {
        pattern: /^(.+)Service$/,
        targetPattern: (match) => match[1],
        relationType: InferredRelationType.DEPENDS_ON,
        confidence: 0.85,
    },
    // Interface -> Implementation (IUserService -> UserService)
    INTERFACE_IMPL: {
        pattern: /^I(.+)$/,
        targetPattern: (match) => match[1],
        relationType: InferredRelationType.IMPLEMENTS_PATTERN,
        confidence: 0.9,
    },
    // Repository -> Entity (UserRepository -> User)
    REPOSITORY_ENTITY: {
        pattern: /^(.+)Repository$/,
        targetPattern: (match) => match[1],
        relationType: InferredRelationType.DEPENDS_ON,
        confidence: 0.85,
    },
    // Controller -> Service (UserController -> UserService)
    CONTROLLER_SERVICE: {
        pattern: /^(.+)Controller$/,
        targetPattern: (match) => `${match[1]}Service`,
        relationType: InferredRelationType.DEPENDS_ON,
        confidence: 0.8,
    },
    // Handler -> Command/Event (CreateUserHandler -> CreateUser)
    HANDLER_COMMAND: {
        pattern: /^(.+)Handler$/,
        targetPattern: (match) => match[1],
        relationType: InferredRelationType.DEPENDS_ON,
        confidence: 0.85,
    },
    // Dto -> Entity (UserDto -> User)
    DTO_ENTITY: {
        pattern: /^(.+)Dto$/i,
        targetPattern: (match) => match[1],
        relationType: InferredRelationType.DERIVED_FROM,
        confidence: 0.8,
    },
    // Test -> Tested (UserService.test -> UserService)
    TEST_TESTED: {
        pattern: /^(.+)\.test$/,
        targetPattern: (match) => match[1],
        relationType: InferredRelationType.RELATED_TO,
        confidence: 0.95,
    },
};

class InferredRelationEngine {
    /**
     * @param {Object} graphClient - Клиент Memgraph
     * @param {EmbeddingService} embeddingService - Сервис эмбеддингов
     * @param {Object} options - Настройки
     */
    constructor(graphClient, embeddingService = null, options = {}) {
        this.graphClient = graphClient;
        this.embeddingService = embeddingService || new EmbeddingService(options.embeddingOptions);

        this.options = {
            // Семантическая близость
            semanticSimilarityThreshold: options.semanticSimilarityThreshold || 0.75,
            maxSemanticResults: options.maxSemanticResults || 10,

            // Co-occurrence
            coOccurrenceMinCount: options.coOccurrenceMinCount || 2,
            coOccurrenceMaxDistance: options.coOccurrenceMaxDistance || 3,

            // Общие настройки
            minConfidence: options.minConfidence || 0.6,
            batchSize: options.batchSize || 100,

            // Включённые методы
            enabledMethods: options.enabledMethods || Object.values(InferenceMethod),
        };
    }

    /**
     * Основной API - вычислить выведенные связи для сущности
     * @param {Object} entity - Сущность для анализа
     * @param {Object} options - Дополнительные опции
     * @returns {Promise<Array>} Массив выведенных связей
     */
    async computeInferredRelations(entity, options = {}) {
        const methods = options.methods || this.options.enabledMethods;
        const allRelations = [];

        for (const method of methods) {
            try {
                let relations = [];

                switch (method) {
                    case InferenceMethod.SEMANTIC_SIMILARITY:
                        relations = await this.computeSemanticSimilarity(entity, options);
                        break;
                    case InferenceMethod.CO_OCCURRENCE:
                        relations = await this.computeCoOccurrence(entity, options);
                        break;
                    case InferenceMethod.NAMING_PATTERN:
                        relations = await this.computeNamingPatterns(entity, options);
                        break;
                    case InferenceMethod.STRUCTURAL:
                        relations = await this.computeStructuralRelations(entity, options);
                        break;
                    case InferenceMethod.TEMPORAL_PROXIMITY:
                        relations = await this.computeTemporalProximity(entity, options);
                        break;
                }

                allRelations.push(...relations);
            } catch (error) {
                console.warn(`Warning: Method ${method} failed for entity ${entity.properties?.name}:`, error.message);
            }
        }

        // Фильтруем по минимальной уверенности и убираем дубликаты
        const filtered = this._filterAndDeduplicateRelations(allRelations);

        return filtered;
    }

    /**
     * Вычислить семантически похожие сущности через эмбеддинги
     */
    async computeSemanticSimilarity(entity, options = {}) {
        const relations = [];

        if (!this.embeddingService) {
            return relations;
        }

        try {
            // Генерируем эмбеддинг для сущности
            const embedding = await this.embeddingService.generateEntityEmbedding(entity);

            if (!embedding) {
                return relations;
            }

            // Определяем коллекцию для поиска
            const collection = this._getCollectionForEntity(entity);

            // Ищем похожие
            const similarEntities = await this.embeddingService.searchSimilar(
                collection,
                embedding,
                {
                    limit: options.maxResults || this.options.maxSemanticResults,
                    scoreThreshold: options.threshold || this.options.semanticSimilarityThreshold,
                    excludeIds: [entity.properties?.id, entity.properties?.qualifiedName].filter(Boolean),
                }
            );

            for (const similar of similarEntities) {
                relations.push({
                    sourceId: entity.properties?.id || entity.properties?.qualifiedName,
                    targetId: similar.id,
                    type: InferredRelationType.SIMILAR_TO,
                    properties: {
                        confidence: similar.score,
                        method: InferenceMethod.SEMANTIC_SIMILARITY,
                        inferredAt: new Date().toISOString(),
                        similarityScore: similar.score,
                    },
                });
            }
        } catch (error) {
            console.warn('Semantic similarity computation failed:', error.message);
        }

        return relations;
    }

    /**
     * Вычислить связи на основе совместного упоминания в графе
     */
    async computeCoOccurrence(entity, options = {}) {
        const relations = [];

        if (!this.graphClient) {
            return relations;
        }

        const entityId = entity.properties?.id || entity.properties?.qualifiedName;
        if (!entityId) {
            return relations;
        }

        try {
            // Запрос: найти сущности, которые часто связаны с теми же сущностями
            const query = `
                MATCH (source {id: $entityId})-[r1]-(common)-[r2]-(target)
                WHERE source <> target
                  AND NOT (source)-[]-(target)
                WITH target, COUNT(DISTINCT common) as coOccurrences, COLLECT(DISTINCT common.name) as commonNodes
                WHERE coOccurrences >= $minCount
                RETURN target.id as targetId,
                       target.name as targetName,
                       target.label as targetLabel,
                       coOccurrences,
                       commonNodes
                ORDER BY coOccurrences DESC
                LIMIT $limit
            `;

            const result = await this.graphClient.query(query, {
                entityId,
                minCount: options.minCount || this.options.coOccurrenceMinCount,
                limit: options.limit || 20,
            });

            for (const record of result) {
                const confidence = Math.min(0.9, 0.5 + (record.coOccurrences * 0.1));

                relations.push({
                    sourceId: entityId,
                    targetId: record.targetId,
                    type: InferredRelationType.CO_OCCURS_WITH,
                    properties: {
                        confidence,
                        method: InferenceMethod.CO_OCCURRENCE,
                        inferredAt: new Date().toISOString(),
                        coOccurrenceCount: record.coOccurrences,
                        commonNodes: record.commonNodes?.slice(0, 5) || [],
                    },
                });
            }
        } catch (error) {
            console.warn('Co-occurrence computation failed:', error.message);
        }

        return relations;
    }

    /**
     * Вычислить связи на основе паттернов именования
     */
    async computeNamingPatterns(entity, options = {}) {
        const relations = [];
        const entityName = entity.properties?.name;

        if (!entityName) {
            return relations;
        }

        const existingEntities = options.existingEntities || [];

        for (const [patternName, config] of Object.entries(NamingPatterns)) {
            const match = entityName.match(config.pattern);

            if (match) {
                const targetName = config.targetPattern(match);

                // Ищем целевую сущность
                let targetEntity = existingEntities.find(e =>
                    e.properties?.name === targetName ||
                    e.properties?.name?.toLowerCase() === targetName.toLowerCase()
                );

                // Если есть graphClient, ищем в графе
                if (!targetEntity && this.graphClient) {
                    try {
                        const result = await this.graphClient.query(
                            `MATCH (n) WHERE n.name = $name OR toLower(n.name) = toLower($name) RETURN n LIMIT 1`,
                            { name: targetName }
                        );
                        if (result.length > 0) {
                            targetEntity = result[0].n;
                        }
                    } catch (error) {
                        // Игнорируем ошибки поиска в графе
                    }
                }

                if (targetEntity) {
                    relations.push({
                        sourceId: entity.properties?.id || entity.properties?.qualifiedName || entityName,
                        targetId: targetEntity.properties?.id || targetEntity.properties?.qualifiedName || targetName,
                        type: config.relationType,
                        properties: {
                            confidence: config.confidence,
                            method: InferenceMethod.NAMING_PATTERN,
                            inferredAt: new Date().toISOString(),
                            patternName,
                            matchedPattern: config.pattern.toString(),
                        },
                    });
                } else {
                    // Создаём потенциальную связь с ожидаемым именем
                    relations.push({
                        sourceId: entity.properties?.id || entity.properties?.qualifiedName || entityName,
                        targetId: targetName,
                        targetName: targetName,
                        type: config.relationType,
                        properties: {
                            confidence: config.confidence * 0.7, // Снижаем уверенность для ненайденных
                            method: InferenceMethod.NAMING_PATTERN,
                            inferredAt: new Date().toISOString(),
                            patternName,
                            matchedPattern: config.pattern.toString(),
                            isPotential: true, // Маркер потенциальной связи
                        },
                    });
                }
            }
        }

        return relations;
    }

    /**
     * Вычислить структурные связи (транзитивные зависимости)
     */
    async computeStructuralRelations(entity, options = {}) {
        const relations = [];

        if (!this.graphClient) {
            return relations;
        }

        const entityId = entity.properties?.id || entity.properties?.qualifiedName;
        if (!entityId) {
            return relations;
        }

        try {
            // Найти транзитивные зависимости (A depends on B, B depends on C => A transitively depends on C)
            const query = `
                MATCH path = (source {id: $entityId})-[:DEPENDS_ON|IMPORTS|CALLS*2..3]->(target)
                WHERE source <> target
                  AND NOT (source)-[:DEPENDS_ON]->(target)
                WITH target,
                     MIN(length(path)) as distance,
                     COUNT(DISTINCT path) as pathCount
                RETURN target.id as targetId,
                       target.name as targetName,
                       distance,
                       pathCount
                ORDER BY distance ASC, pathCount DESC
                LIMIT $limit
            `;

            const result = await this.graphClient.query(query, {
                entityId,
                limit: options.limit || 15,
            });

            for (const record of result) {
                // Уверенность снижается с расстоянием
                const confidence = Math.max(0.5, 0.9 - (record.distance * 0.15));

                relations.push({
                    sourceId: entityId,
                    targetId: record.targetId,
                    type: InferredRelationType.DEPENDS_ON,
                    properties: {
                        confidence,
                        method: InferenceMethod.STRUCTURAL,
                        inferredAt: new Date().toISOString(),
                        transitiveDistance: record.distance,
                        pathCount: record.pathCount,
                        isTransitive: true,
                    },
                });
            }
        } catch (error) {
            console.warn('Structural relations computation failed:', error.message);
        }

        return relations;
    }

    /**
     * Вычислить связи на основе временной близости (совместные изменения в коммитах)
     */
    async computeTemporalProximity(entity, options = {}) {
        const relations = [];

        if (!this.graphClient) {
            return relations;
        }

        const entityId = entity.properties?.id || entity.properties?.qualifiedName;
        if (!entityId) {
            return relations;
        }

        try {
            // Найти сущности, которые изменялись в тех же коммитах
            const query = `
                MATCH (source {id: $entityId})<-[:MODIFIES]-(commit:Commit)-[:MODIFIES]->(target)
                WHERE source <> target
                WITH target,
                     COUNT(DISTINCT commit) as sharedCommits,
                     COLLECT(DISTINCT commit.hash)[0..5] as commitHashes
                WHERE sharedCommits >= $minSharedCommits
                RETURN target.id as targetId,
                       target.name as targetName,
                       sharedCommits,
                       commitHashes
                ORDER BY sharedCommits DESC
                LIMIT $limit
            `;

            const result = await this.graphClient.query(query, {
                entityId,
                minSharedCommits: options.minSharedCommits || 2,
                limit: options.limit || 20,
            });

            for (const record of result) {
                // Уверенность растёт с количеством общих коммитов
                const confidence = Math.min(0.95, 0.5 + (record.sharedCommits * 0.1));

                relations.push({
                    sourceId: entityId,
                    targetId: record.targetId,
                    type: InferredRelationType.CHANGED_WITH,
                    properties: {
                        confidence,
                        method: InferenceMethod.TEMPORAL_PROXIMITY,
                        inferredAt: new Date().toISOString(),
                        sharedCommits: record.sharedCommits,
                        commitSamples: record.commitHashes || [],
                    },
                });
            }
        } catch (error) {
            console.warn('Temporal proximity computation failed:', error.message);
        }

        return relations;
    }

    /**
     * Batch processing - вычислить связи для множества сущностей
     */
    async computeBatchRelations(entities, options = {}) {
        const allRelations = [];
        const batchSize = options.batchSize || this.options.batchSize;

        for (let i = 0; i < entities.length; i += batchSize) {
            const batch = entities.slice(i, i + batchSize);

            const batchPromises = batch.map(entity =>
                this.computeInferredRelations(entity, {
                    ...options,
                    existingEntities: entities, // Передаём все сущности для паттернов именования
                })
            );

            const batchResults = await Promise.all(batchPromises);

            for (const relations of batchResults) {
                allRelations.push(...relations);
            }
        }

        return this._filterAndDeduplicateRelations(allRelations);
    }

    /**
     * Сохранить выведенные связи в граф
     */
    async persistInferredRelations(relations, options = {}) {
        if (!this.graphClient || relations.length === 0) {
            return { persisted: 0, skipped: 0 };
        }

        let persisted = 0;
        let skipped = 0;

        for (const relation of relations) {
            // Пропускаем потенциальные связи без реальной цели
            if (relation.properties?.isPotential && !options.includePotential) {
                skipped++;
                continue;
            }

            try {
                const query = `
                    MATCH (source), (target)
                    WHERE (source.id = $sourceId OR source.qualifiedName = $sourceId)
                      AND (target.id = $targetId OR target.qualifiedName = $targetId OR target.name = $targetId)
                    MERGE (source)-[r:${relation.type} {inferred: true}]->(target)
                    SET r += $properties
                    RETURN r
                `;

                const result = await this.graphClient.query(query, {
                    sourceId: relation.sourceId,
                    targetId: relation.targetId,
                    properties: relation.properties,
                });

                if (result.length > 0) {
                    persisted++;
                } else {
                    skipped++;
                }
            } catch (error) {
                console.warn(`Failed to persist relation ${relation.sourceId} -> ${relation.targetId}:`, error.message);
                skipped++;
            }
        }

        return { persisted, skipped };
    }

    /**
     * Фильтрация и дедупликация связей
     */
    _filterAndDeduplicateRelations(relations) {
        const minConfidence = this.options.minConfidence;

        // Фильтруем по минимальной уверенности
        const filtered = relations.filter(r =>
            (r.properties?.confidence || 0) >= minConfidence
        );

        // Дедупликация: для одинаковых source-target пар оставляем связь с наивысшей уверенностью
        const relationMap = new Map();

        for (const relation of filtered) {
            const key = `${relation.sourceId}|${relation.targetId}|${relation.type}`;
            const existing = relationMap.get(key);

            if (!existing || (relation.properties?.confidence || 0) > (existing.properties?.confidence || 0)) {
                relationMap.set(key, relation);
            }
        }

        return Array.from(relationMap.values());
    }

    /**
     * Определить коллекцию Qdrant для сущности
     */
    _getCollectionForEntity(entity) {
        const label = entity.label?.toLowerCase() || '';

        if (['file', 'function', 'class', 'method', 'interface'].includes(label)) {
            return 'embeddings_code';
        }
        if (['workitem', 'bug', 'userstory', 'task'].includes(label)) {
            return 'embeddings_workitems';
        }
        if (['document', 'requirement', 'specification'].includes(label)) {
            return 'embeddings_docs';
        }

        return 'embeddings_unified';
    }

    /**
     * Получить информацию о движке
     */
    getInfo() {
        return {
            enabledMethods: this.options.enabledMethods,
            semanticSimilarityThreshold: this.options.semanticSimilarityThreshold,
            coOccurrenceMinCount: this.options.coOccurrenceMinCount,
            minConfidence: this.options.minConfidence,
            namingPatterns: Object.keys(NamingPatterns),
            inferredRelationTypes: Object.values(InferredRelationType),
        };
    }
}

module.exports = {
    InferredRelationEngine,
    InferenceMethod,
    InferredRelationType,
    NamingPatterns,
};
