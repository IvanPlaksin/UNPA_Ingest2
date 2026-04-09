/**
 * HybridResolver - Entity Resolution между разными источниками
 *
 * Определяет, что одна и та же бизнес-сущность упоминается в коде,
 * WorkItem, документации под разными именами.
 *
 * Стратегии:
 * 1. Exact Match - совпадение ID, qualified names (score: 1.0)
 * 2. Fuzzy Match - похожие названия через Fuse.js (score: 0.6-0.9)
 * 3. Semantic Match - похожий смысл через embeddings (score: 0.7-0.95)
 */

const Fuse = require('fuse.js');

/**
 * Уровни уверенности в разрешении
 */
const ConfidenceLevel = {
    EXACT: 'exact',      // 1.0 - ID match
    HIGH: 'high',        // 0.85+ - очень вероятно та же сущность
    MEDIUM: 'medium',    // 0.7-0.85 - скорее всего, требует проверки
    LOW: 'low',          // 0.5-0.7 - неуверенно, нужна человеческая проверка
    NONE: 'none',        // <0.5 - разные сущности
};

/**
 * Стратегии matching
 */
const MatchStrategy = {
    EXACT_ID: 'exact_id',
    EXACT_NAME: 'exact_name',
    FUZZY_NAME: 'fuzzy_name',
    FUZZY_DESCRIPTION: 'fuzzy_description',
    SEMANTIC: 'semantic',
    COMPOSITE: 'composite',
};

class HybridResolver {
    /**
     * @param {Object} embeddingService - сервис для генерации embeddings (опционально)
     * @param {Object} config - конфигурация
     */
    constructor(embeddingService = null, config = {}) {
        this.embeddingService = embeddingService;
        this.config = {
            // Веса для разных типов matching
            exactMatchWeight: 1.0,
            fuzzyNameWeight: 0.75,
            fuzzyDescriptionWeight: 0.6,
            semanticMatchWeight: 0.85,

            // Пороги
            minConfidenceThreshold: 0.5,
            autoAcceptThreshold: 0.9,      // Авто-merge выше этого
            reviewThreshold: 0.7,          // Требует проверки между 0.7-0.9
            semanticSimilarityMin: 0.8,    // Мин. cosine similarity для semantic match

            // Fuzzy search config
            fuzzyThreshold: 0.4,           // Fuse.js threshold (ниже = строже)

            ...config,
        };
    }

    // ============ Main Resolution Methods ============

    /**
     * Разрешение новой сущности относительно существующих
     * @param {Object} newEntity - сущность для разрешения
     * @param {Array} existingEntities - пул существующих сущностей
     * @param {Object} options - опции разрешения
     * @returns {Promise<ResolutionResult|null>}
     */
    async resolve(newEntity, existingEntities, options = {}) {
        if (!existingEntities || existingEntities.length === 0) {
            return null; // Нет кандидатов, это новая сущность
        }

        const candidates = [];

        // 1. Сначала пробуем exact match (самый быстрый)
        const exactMatch = this._findExactMatch(newEntity, existingEntities);
        if (exactMatch) {
            return {
                resolved: true,
                canonicalEntity: this._mergeEntities(exactMatch.entity, newEntity),
                matchedEntity: exactMatch.entity,
                confidence: 1.0,
                confidenceLevel: ConfidenceLevel.EXACT,
                strategy: exactMatch.strategy,
                candidates: [exactMatch],
            };
        }

        // 2. Fuzzy name matching
        const fuzzyNameMatches = this._findFuzzyNameMatches(newEntity, existingEntities);
        candidates.push(...fuzzyNameMatches);

        // 3. Fuzzy description matching (если сущность имеет описание)
        if (newEntity.properties?.description || newEntity.properties?.definition) {
            const fuzzyDescMatches = this._findFuzzyDescriptionMatches(newEntity, existingEntities);
            candidates.push(...fuzzyDescMatches);
        }

        // 4. Semantic matching (если есть embedding service и нет high-confidence match)
        const bestFuzzyScore = candidates.length > 0
            ? Math.max(...candidates.map(c => c.score))
            : 0;

        if (this.embeddingService && bestFuzzyScore < this.config.autoAcceptThreshold) {
            const semanticMatches = await this._findSemanticMatches(newEntity, existingEntities);
            candidates.push(...semanticMatches);
        }

        // Нет кандидатов
        if (candidates.length === 0) {
            return null;
        }

        // 5. Ранжирование и дедупликация кандидатов
        const rankedCandidates = this._rankCandidates(candidates);
        const bestCandidate = rankedCandidates[0];

        // 6. Проверка порога
        if (bestCandidate.score < this.config.minConfidenceThreshold) {
            return null; // Нет хорошего совпадения, считаем новой сущностью
        }

        // 7. Определение уровня уверенности
        const confidenceLevel = this._getConfidenceLevel(bestCandidate.score);

        return {
            resolved: true,
            canonicalEntity: this._mergeEntities(bestCandidate.entity, newEntity),
            matchedEntity: bestCandidate.entity,
            confidence: bestCandidate.score,
            confidenceLevel,
            strategy: bestCandidate.strategy,
            needsReview: confidenceLevel === ConfidenceLevel.MEDIUM || confidenceLevel === ConfidenceLevel.LOW,
            candidates: rankedCandidates.slice(0, 5), // Top 5 для review
        };
    }

    /**
     * Пакетное разрешение множества сущностей
     * @param {Array} newEntities - сущности для разрешения
     * @param {Array} existingEntities - существующий пул сущностей
     * @returns {Promise<Array<ResolutionResult>>}
     */
    async batchResolve(newEntities, existingEntities) {
        const results = [];

        // Отслеживаем уже resolved чтобы избежать дубликатов
        const resolvedIds = new Set();

        for (const entity of newEntities) {
            const result = await this.resolve(entity, existingEntities);

            if (result) {
                const matchedId = result.matchedEntity.properties?.id ||
                    result.matchedEntity.properties?.qualifiedName;

                // Проверяем, была ли эта существующая сущность уже matched
                if (resolvedIds.has(matchedId)) {
                    // Конфликт - одна существующая сущность matched несколько раз
                    result.conflict = true;
                } else {
                    resolvedIds.add(matchedId);
                }
            }

            results.push({
                original: entity,
                resolution: result,
            });
        }

        return results;
    }

    /**
     * Поиск потенциальных дубликатов в наборе сущностей
     * @param {Array} entities - сущности для проверки
     * @returns {Promise<Array>} - группы потенциальных дубликатов
     */
    async findDuplicates(entities) {
        const duplicateGroups = [];
        const processed = new Set();

        for (let i = 0; i < entities.length; i++) {
            if (processed.has(i)) continue;

            const entity = entities[i];
            const group = [entity];
            processed.add(i);

            // Сравниваем с оставшимися сущностями
            for (let j = i + 1; j < entities.length; j++) {
                if (processed.has(j)) continue;

                const candidate = entities[j];
                const similarity = await this._calculateSimilarity(entity, candidate);

                if (similarity >= this.config.reviewThreshold) {
                    group.push(candidate);
                    processed.add(j);
                }
            }

            if (group.length > 1) {
                duplicateGroups.push({
                    entities: group,
                    suggestedCanonical: this._selectCanonical(group),
                });
            }
        }

        return duplicateGroups;
    }

    // ============ Match Finding Methods ============

    _findExactMatch(entity, existing) {
        const props = entity.properties || {};

        // Пробуем разные уникальные идентификаторы
        const identifiers = [
            { key: 'id', value: props.id },
            { key: 'quantumId', value: props.quantumId },
            { key: 'qualifiedName', value: props.qualifiedName },
            { key: 'workItemId', value: props.workItemId },
            { key: 'filePath', value: props.filePath && props.name ? `${props.filePath}#${props.name}` : null },
        ].filter(id => id.value);

        for (const identifier of identifiers) {
            const match = existing.find(e => {
                const existingValue = e.properties?.[identifier.key];
                return existingValue && existingValue === identifier.value;
            });

            if (match) {
                return {
                    entity: match,
                    score: 1.0,
                    strategy: MatchStrategy.EXACT_ID,
                    matchedOn: identifier.key,
                };
            }
        }

        // Exact name match (case-insensitive)
        if (props.name) {
            const nameLower = props.name.toLowerCase();
            const exactNameMatch = existing.find(e =>
                e.properties?.name && e.properties.name.toLowerCase() === nameLower
            );

            if (exactNameMatch) {
                return {
                    entity: exactNameMatch,
                    score: 0.95, // Чуть меньше чем ID match
                    strategy: MatchStrategy.EXACT_NAME,
                    matchedOn: 'name',
                };
            }
        }

        return null;
    }

    _findFuzzyNameMatches(entity, existing) {
        const name = entity.properties?.name;
        if (!name) return [];

        // Строим searchable items
        const searchItems = existing.map((e, index) => ({
            index,
            entity: e,
            name: e.properties?.name || '',
            title: e.properties?.title || '',
            synonyms: (e.properties?.synonyms || []).join(' '),
        }));

        const fuse = new Fuse(searchItems, {
            keys: [
                { name: 'name', weight: 0.5 },
                { name: 'title', weight: 0.3 },
                { name: 'synonyms', weight: 0.2 },
            ],
            threshold: this.config.fuzzyThreshold,
            includeScore: true,
            minMatchCharLength: 2,
        });

        const results = fuse.search(name);

        return results.map(r => ({
            entity: r.item.entity,
            score: (1 - r.score) * this.config.fuzzyNameWeight,
            strategy: MatchStrategy.FUZZY_NAME,
            matchedOn: 'name/title/synonyms',
            fuseScore: r.score,
        }));
    }

    _findFuzzyDescriptionMatches(entity, existing) {
        const description = entity.properties?.description ||
            entity.properties?.definition ||
            '';
        if (!description || description.length < 20) return [];

        const searchItems = existing
            .filter(e => e.properties?.description || e.properties?.definition)
            .map((e, index) => ({
                index,
                entity: e,
                description: e.properties?.description || e.properties?.definition || '',
            }));

        if (searchItems.length === 0) return [];

        const fuse = new Fuse(searchItems, {
            keys: ['description'],
            threshold: 0.5, // Более мягкий порог для описаний
            includeScore: true,
            minMatchCharLength: 10,
        });

        const results = fuse.search(description.substring(0, 200));

        return results.map(r => ({
            entity: r.item.entity,
            score: (1 - r.score) * this.config.fuzzyDescriptionWeight,
            strategy: MatchStrategy.FUZZY_DESCRIPTION,
            matchedOn: 'description',
            fuseScore: r.score,
        }));
    }

    async _findSemanticMatches(entity, existing) {
        if (!this.embeddingService) return [];

        try {
            // Создаём текстовое представление новой сущности
            const entityText = this._entityToText(entity);
            const entityVector = await this.embeddingService.generateEmbedding(entityText);

            const matches = [];

            for (const existingEntity of existing) {
                const existingText = this._entityToText(existingEntity);
                const existingVector = await this.embeddingService.generateEmbedding(existingText);

                const similarity = this._cosineSimilarity(entityVector, existingVector);

                if (similarity >= this.config.semanticSimilarityMin) {
                    matches.push({
                        entity: existingEntity,
                        score: similarity * this.config.semanticMatchWeight,
                        strategy: MatchStrategy.SEMANTIC,
                        matchedOn: 'semantic_similarity',
                        rawSimilarity: similarity,
                    });
                }
            }

            return matches;
        } catch (error) {
            console.error('Semantic matching failed:', error);
            return [];
        }
    }

    // ============ Scoring & Ranking ============

    _rankCandidates(candidates) {
        // Дедупликация по entity ID
        const byEntity = new Map();

        for (const candidate of candidates) {
            const entityId = candidate.entity.properties?.id ||
                candidate.entity.properties?.qualifiedName ||
                candidate.entity.properties?.name;

            const existing = byEntity.get(entityId);
            if (!existing || candidate.score > existing.score) {
                byEntity.set(entityId, candidate);
            }
        }

        // Сортировка по score (убывание)
        return Array.from(byEntity.values())
            .sort((a, b) => b.score - a.score);
    }

    _getConfidenceLevel(score) {
        if (score >= 0.99) return ConfidenceLevel.EXACT;
        if (score >= this.config.autoAcceptThreshold) return ConfidenceLevel.HIGH;
        if (score >= this.config.reviewThreshold) return ConfidenceLevel.MEDIUM;
        if (score >= this.config.minConfidenceThreshold) return ConfidenceLevel.LOW;
        return ConfidenceLevel.NONE;
    }

    async _calculateSimilarity(entity1, entity2) {
        // Комбинируем несколько сигналов
        let totalScore = 0;
        let weights = 0;

        // Name similarity
        if (entity1.properties?.name && entity2.properties?.name) {
            const nameSim = this._stringSimilarity(
                entity1.properties.name.toLowerCase(),
                entity2.properties.name.toLowerCase()
            );
            totalScore += nameSim * 0.4;
            weights += 0.4;
        }

        // Description similarity
        const desc1 = entity1.properties?.description || entity1.properties?.definition;
        const desc2 = entity2.properties?.description || entity2.properties?.definition;
        if (desc1 && desc2) {
            const descSim = this._stringSimilarity(desc1.toLowerCase(), desc2.toLowerCase());
            totalScore += descSim * 0.3;
            weights += 0.3;
        }

        // Semantic similarity (если доступен)
        if (this.embeddingService) {
            try {
                const vec1 = await this.embeddingService.generateEmbedding(this._entityToText(entity1));
                const vec2 = await this.embeddingService.generateEmbedding(this._entityToText(entity2));
                const semanticSim = this._cosineSimilarity(vec1, vec2);
                totalScore += semanticSim * 0.5;
                weights += 0.5;
            } catch (e) {
                // Skip semantic если failed
            }
        }

        return weights > 0 ? totalScore / weights : 0;
    }

    // ============ Merging ============

    _mergeEntities(existing, newEntity) {
        const existingProps = existing.properties || {};
        const newProps = newEntity.properties || {};

        return {
            label: existing.label,
            properties: {
                ...existingProps,
                ...newProps,
                // Сохраняем канонические идентификаторы из existing
                id: existingProps.id,
                quantumId: existingProps.quantumId || existingProps.id,
                qualifiedName: existingProps.qualifiedName,
                // Объединяем массивы
                synonyms: this._mergeArrays(
                    existingProps.synonyms,
                    newProps.synonyms,
                    newProps.name // Добавляем новое имя как синоним
                ),
                sourceFiles: this._mergeArrays(
                    existingProps.sourceFiles,
                    [newProps.sourceFile]
                ),
                // Отслеживаем историю merge
                mergedFrom: [
                    ...(existingProps.mergedFrom || []),
                    {
                        entityId: newProps.id,
                        mergedAt: new Date().toISOString(),
                    }
                ],
                // Обновляем timestamp
                updatedAt: new Date().toISOString(),
            },
        };
    }

    _mergeArrays(...arrays) {
        const merged = new Set();
        for (const arr of arrays) {
            if (Array.isArray(arr)) {
                arr.forEach(item => item && merged.add(item));
            } else if (arr) {
                merged.add(arr);
            }
        }
        return Array.from(merged);
    }

    _selectCanonical(entities) {
        // Предпочитаем сущность с:
        // 1. Более полной информацией
        // 2. Более ранней датой создания
        // 3. Большим количеством relationships
        return entities.reduce((best, current) => {
            const bestScore = this._completenessScore(best);
            const currentScore = this._completenessScore(current);
            return currentScore > bestScore ? current : best;
        });
    }

    _completenessScore(entity) {
        const props = entity.properties || {};
        let score = 0;

        if (props.name) score += 1;
        if (props.description || props.definition) score += 2;
        if (props.documentation) score += 2;
        if (props.synonyms?.length > 0) score += 1;
        if (props.qualifiedName) score += 1;
        if (props.sourceFile) score += 1;

        return score;
    }

    // ============ Utilities ============

    _entityToText(entity) {
        const props = entity.properties || {};
        const parts = [
            props.name,
            props.title,
            props.description,
            props.definition,
            props.documentation,
            ...(props.synonyms || []),
        ].filter(Boolean);

        return parts.join(' ').substring(0, 1000);
    }

    _cosineSimilarity(vec1, vec2) {
        if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;

        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            norm1 += vec1[i] * vec1[i];
            norm2 += vec2[i] * vec2[i];
        }

        const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
        return magnitude === 0 ? 0 : dotProduct / magnitude;
    }

    /**
     * Jaro-Winkler string similarity
     */
    _stringSimilarity(str1, str2) {
        if (str1 === str2) return 1;
        if (!str1 || !str2) return 0;

        const len1 = str1.length;
        const len2 = str2.length;
        const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;

        const matches1 = new Array(len1).fill(false);
        const matches2 = new Array(len2).fill(false);

        let matches = 0;
        let transpositions = 0;

        // Find matches
        for (let i = 0; i < len1; i++) {
            const start = Math.max(0, i - matchDistance);
            const end = Math.min(i + matchDistance + 1, len2);

            for (let j = start; j < end; j++) {
                if (matches2[j] || str1[i] !== str2[j]) continue;
                matches1[i] = true;
                matches2[j] = true;
                matches++;
                break;
            }
        }

        if (matches === 0) return 0;

        // Count transpositions
        let k = 0;
        for (let i = 0; i < len1; i++) {
            if (!matches1[i]) continue;
            while (!matches2[k]) k++;
            if (str1[i] !== str2[k]) transpositions++;
            k++;
        }

        const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

        // Winkler modification
        let prefix = 0;
        for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
            if (str1[i] === str2[i]) prefix++;
            else break;
        }

        return jaro + prefix * 0.1 * (1 - jaro);
    }
}

module.exports = {
    HybridResolver,
    ConfidenceLevel,
    MatchStrategy
};
