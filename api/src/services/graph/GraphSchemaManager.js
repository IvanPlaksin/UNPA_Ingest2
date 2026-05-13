/**
 * GraphSchemaManager - Управление схемой графа Memgraph
 *
 * Отвечает за:
 * - Создание constraints (уникальных ограничений)
 * - Создание indices (индексов для быстрого поиска)
 * - Валидация целостности графа
 */

class GraphSchemaManager {
    constructor(memgraphService) {
        this.db = memgraphService;
    }

    /**
     * Инициализация полной схемы графа
     */
    async initializeSchema() {
        // CREATE INDEX ON :Label(prop) and CREATE CONSTRAINT ON are Memgraph-specific.
        // AGE does not support this syntax — each statement fails after a ~100ms round-trip.
        if (process.env.GRAPH_DB_BACKEND === 'postgres-age') return true;

        console.log('🔧 Initializing graph schema...');

        try {
            await this.createDomainNodeConstraints();
            await this.createDomainNodeIndices();
            await this.createImmutableGraphIndices();
            await this.createAOPEGIndices();
            await this.createNamespaceIndices();
            console.log('✅ Graph schema initialized');
            return true;
        } catch (error) {
            console.error('❌ Schema initialization failed:', error);
            throw error;
        }
    }

    /**
     * Создание уникальных ограничений для узлов
     * Memgraph использует синтаксис: CREATE CONSTRAINT ON (n:Label) ASSERT n.property IS UNIQUE
     */
    async createDomainNodeConstraints() {
        console.log('  📌 Creating node constraints...');

        const constraints = [
            // Core identity - KnowledgeQuantum
            'CREATE CONSTRAINT ON (n:KnowledgeQuantum) ASSERT n.quantumId IS UNIQUE',

            // Code entities
            'CREATE CONSTRAINT ON (n:File) ASSERT n.filePath IS UNIQUE',
            'CREATE CONSTRAINT ON (n:Function) ASSERT n.qualifiedName IS UNIQUE',
            'CREATE CONSTRAINT ON (n:Class) ASSERT n.qualifiedName IS UNIQUE',
            'CREATE CONSTRAINT ON (n:Method) ASSERT n.qualifiedName IS UNIQUE',
            'CREATE CONSTRAINT ON (n:Interface) ASSERT n.qualifiedName IS UNIQUE',
            'CREATE CONSTRAINT ON (n:Module) ASSERT n.modulePath IS UNIQUE',

            // Work tracking
            'CREATE CONSTRAINT ON (n:WorkItem) ASSERT n.workItemId IS UNIQUE',
            'CREATE CONSTRAINT ON (n:Task) ASSERT n.taskId IS UNIQUE',
            'CREATE CONSTRAINT ON (n:Bug) ASSERT n.bugId IS UNIQUE',
            'CREATE CONSTRAINT ON (n:Feature) ASSERT n.featureId IS UNIQUE',

            // Version control
            'CREATE CONSTRAINT ON (n:Commit) ASSERT n.sha IS UNIQUE',
            'CREATE CONSTRAINT ON (n:Changeset) ASSERT n.changesetId IS UNIQUE',
            'CREATE CONSTRAINT ON (n:Branch) ASSERT n.branchName IS UNIQUE',

            // Documents
            'CREATE CONSTRAINT ON (n:Document) ASSERT n.documentId IS UNIQUE',

            // People
            'CREATE CONSTRAINT ON (n:Person) ASSERT n.email IS UNIQUE',
            'CREATE CONSTRAINT ON (n:Team) ASSERT n.teamId IS UNIQUE',

            // Project
            'CREATE CONSTRAINT ON (n:Project) ASSERT n.projectId IS UNIQUE',

            // Immutable Graph Architecture
            'CREATE CONSTRAINT ON (n:NodeVersion) ASSERT n.versionId IS UNIQUE',
            'CREATE CONSTRAINT ON (e:EdgeVersion) ASSERT e.versionId IS UNIQUE',
            'CREATE CONSTRAINT ON (g:GodModeSession) ASSERT g.sessionId IS UNIQUE',
            'CREATE CONSTRAINT ON (t:Tombstone) ASSERT t.tombstoneId IS UNIQUE',
            'CREATE CONSTRAINT ON (m:MergeRecord) ASSERT m.mergeId IS UNIQUE',
            'CREATE CONSTRAINT ON (ns:NamespaceConfig) ASSERT ns.namespaceId IS UNIQUE',

            // AOPEG
            'CREATE CONSTRAINT ON (g:AOPEG_ExecutionGraph) ASSERT g.graphId IS UNIQUE',
            'CREATE CONSTRAINT ON (e:AOPEG_Execution) ASSERT e.executionId IS UNIQUE',
            'CREATE CONSTRAINT ON (p:ExecutionPattern) ASSERT p.patternId IS UNIQUE'
        ];

        for (const constraint of constraints) {
            await this.safeExecute(constraint, 'constraint');
        }

        console.log(`  ✅ Created ${constraints.length} constraints`);
    }

    /**
     * Создание индексов для быстрого поиска
     * Memgraph синтаксис: CREATE INDEX ON :Label(property)
     */
    async createDomainNodeIndices() {
        console.log('  📊 Creating node indices...');

        const indices = [
            // KnowledgeQuantum indices
            'CREATE INDEX ON :KnowledgeQuantum(primaryType)',
            'CREATE INDEX ON :KnowledgeQuantum(projectId)',
            'CREATE INDEX ON :KnowledgeQuantum(createdAt)',
            'CREATE INDEX ON :KnowledgeQuantum(sourceType)',

            // Code entity indices
            'CREATE INDEX ON :File(projectId)',
            'CREATE INDEX ON :File(language)',
            'CREATE INDEX ON :Function(filePath)',
            'CREATE INDEX ON :Function(projectId)',
            'CREATE INDEX ON :Class(filePath)',
            'CREATE INDEX ON :Class(projectId)',
            'CREATE INDEX ON :Method(className)',

            // WorkItem indices
            'CREATE INDEX ON :WorkItem(projectId)',
            'CREATE INDEX ON :WorkItem(type)',
            'CREATE INDEX ON :WorkItem(state)',
            'CREATE INDEX ON :WorkItem(assignedTo)',
            'CREATE INDEX ON :WorkItem(createdDate)',

            // Version control indices
            'CREATE INDEX ON :Commit(projectId)',
            'CREATE INDEX ON :Commit(authorEmail)',
            'CREATE INDEX ON :Commit(committedDate)',
            'CREATE INDEX ON :Changeset(projectId)',

            // Document indices
            'CREATE INDEX ON :Document(projectId)',
            'CREATE INDEX ON :Document(docType)',
            'CREATE INDEX ON :Document(createdAt)',

            // Person indices
            'CREATE INDEX ON :Person(displayName)',
            'CREATE INDEX ON :Person(projectId)'
        ];

        for (const index of indices) {
            await this.safeExecute(index, 'index');
        }

        console.log(`  ✅ Created ${indices.length} indices`);
    }

    /**
     * Безопасное выполнение запроса - игнорирует ошибки "уже существует"
     * и добавляет retry для конфликтов транзакций
     */
    async safeExecute(query, type, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await this.db.executeQuery(query);
                return;
            } catch (error) {
                const errorMsg = error.message?.toLowerCase() || '';

                // Memgraph возвращает разные сообщения для уже существующих объектов
                if (errorMsg.includes('already exists') ||
                    errorMsg.includes('constraint already') ||
                    errorMsg.includes('index already')) {
                    // Это нормально - объект уже существует
                    return;
                }

                // Retry for transaction conflicts
                if ((errorMsg.includes('cannot get unique access') ||
                     errorMsg.includes('conflicting transaction') ||
                     error.retriable) && attempt < maxRetries) {
                    console.log(`  ⏳ ${type} retry ${attempt}/${maxRetries} after conflict...`);
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    continue;
                }

                console.warn(`  ⚠️ ${type} warning: ${error.message}`);
                return; // Don't throw, just warn - schema init should continue
            }
        }
    }

    /**
     * Валидация целостности графа
     * Проверяет:
     * 1. Orphan nodes (узлы без связей)
     * 2. Broken relationships
     * 3. Missing required properties
     */
    async validateGraphIntegrity() {
        console.log('🔍 Validating graph integrity...');

        const issues = [];

        // 1. Проверка orphan nodes (узлы KnowledgeQuantum без связей)
        const orphanQuery = `
            MATCH (n:KnowledgeQuantum)
            WHERE NOT (n)--()
            RETURN count(n) as orphanCount
        `;
        const orphanResult = await this.db.executeQuery(orphanQuery);
        const orphanCount = orphanResult.records[0]?.get('orphanCount')?.toNumber() || 0;
        if (orphanCount > 0) {
            issues.push({
                type: 'orphan_nodes',
                severity: 'warning',
                message: `Found ${orphanCount} KnowledgeQuantum nodes without relationships`,
                count: orphanCount
            });
        }

        // 2. Проверка узлов без обязательного quantumId
        const missingIdQuery = `
            MATCH (n:KnowledgeQuantum)
            WHERE n.quantumId IS NULL
            RETURN count(n) as missingCount
        `;
        const missingIdResult = await this.db.executeQuery(missingIdQuery);
        const missingCount = missingIdResult.records[0]?.get('missingCount')?.toNumber() || 0;
        if (missingCount > 0) {
            issues.push({
                type: 'missing_required_property',
                severity: 'error',
                message: `Found ${missingCount} KnowledgeQuantum nodes without quantumId`,
                count: missingCount
            });
        }

        // 3. Проверка WorkItems без projectId
        const workItemsQuery = `
            MATCH (n:WorkItem)
            WHERE n.projectId IS NULL
            RETURN count(n) as count
        `;
        const workItemsResult = await this.db.executeQuery(workItemsQuery);
        const workItemsMissing = workItemsResult.records[0]?.get('count')?.toNumber() || 0;
        if (workItemsMissing > 0) {
            issues.push({
                type: 'missing_project_reference',
                severity: 'warning',
                message: `Found ${workItemsMissing} WorkItem nodes without projectId`,
                count: workItemsMissing
            });
        }

        // 4. Статистика графа
        const statsQuery = `
            MATCH (n)
            RETURN labels(n)[0] as label, count(n) as count
            ORDER BY count DESC
            LIMIT 20
        `;
        const statsResult = await this.db.executeQuery(statsQuery);
        const stats = statsResult.records.map(r => ({
            label: r.get('label'),
            count: r.get('count')?.toNumber() || 0
        }));

        const relationshipStatsQuery = `
            MATCH ()-[r]->()
            RETURN type(r) as type, count(r) as count
            ORDER BY count DESC
            LIMIT 20
        `;
        const relStatsResult = await this.db.executeQuery(relationshipStatsQuery);
        const relationshipStats = relStatsResult.records.map(r => ({
            type: r.get('type'),
            count: r.get('count')?.toNumber() || 0
        }));

        const validationResult = {
            valid: issues.filter(i => i.severity === 'error').length === 0,
            issues,
            stats: {
                nodes: stats,
                relationships: relationshipStats
            },
            checkedAt: new Date().toISOString()
        };

        if (validationResult.valid) {
            console.log('✅ Graph integrity validation passed');
        } else {
            console.log('⚠️ Graph integrity validation found issues');
        }

        return validationResult;
    }

    /**
     * Создание индексов для Immutable Graph (NodeVersion, EdgeVersion, etc.)
     * Критически важно для bi-temporal queries
     */
    async createImmutableGraphIndices() {
        console.log('  📊 Creating immutable graph indices...');

        const indices = [
            // NodeVersion - основные индексы для bi-temporal запросов
            'CREATE INDEX ON :NodeVersion(entityId)',
            'CREATE INDEX ON :NodeVersion(status)',
            'CREATE INDEX ON :NodeVersion(namespace)',
            'CREATE INDEX ON :NodeVersion(sequenceNumber)',
            'CREATE INDEX ON :NodeVersion(versionName)',
            'CREATE INDEX ON :NodeVersion(nodeType)',
            'CREATE INDEX ON :NodeVersion(ttStart)',
            'CREATE INDEX ON :NodeVersion(vtStart)',
            'CREATE INDEX ON :NodeVersion(changedBy)',
            'CREATE INDEX ON :NodeVersion(contentHash)',

            // EdgeVersion
            'CREATE INDEX ON :EdgeVersion(edgeId)',
            'CREATE INDEX ON :EdgeVersion(status)',
            'CREATE INDEX ON :EdgeVersion(sourceEntityId)',
            'CREATE INDEX ON :EdgeVersion(targetEntityId)',
            'CREATE INDEX ON :EdgeVersion(edgeType)',
            'CREATE INDEX ON :EdgeVersion(namespace)',
            'CREATE INDEX ON :EdgeVersion(sequenceNumber)',

            // GodMode
            'CREATE INDEX ON :GodModeSession(userId)',
            'CREATE INDEX ON :GodModeSession(isActive)',
            'CREATE INDEX ON :GodModeSession(activatedAt)',

            // Tombstone and Recovery
            'CREATE INDEX ON :Tombstone(originalId)',
            'CREATE INDEX ON :Tombstone(recoverableUntil)',
            'CREATE INDEX ON :PendingDeletion(entityId)',
            'CREATE INDEX ON :PendingDeletion(confirmDeadline)',

            // MergeRecord
            'CREATE INDEX ON :MergeRecord(resultEntityId)',
            'CREATE INDEX ON :MergeRecord(needsReview)'
        ];

        for (const index of indices) {
            await this.safeExecute(index, 'immutable-graph-index');
        }

        console.log(`  ✅ Created ${indices.length} immutable graph indices`);
    }

    /**
     * Создание индексов для AOPEG pipeline execution
     */
    async createAOPEGIndices() {
        console.log('  📊 Creating AOPEG indices...');

        const indices = [
            // AOPEG Execution Graph
            'CREATE INDEX ON :AOPEG_ExecutionGraph(graphId)',
            'CREATE INDEX ON :AOPEG_ExecutionGraph(status)',
            'CREATE INDEX ON :AOPEG_ExecutionGraph(createdAt)',

            // AOPEG Graph Node
            'CREATE INDEX ON :AOPEG_GraphNode(nodeId)',
            'CREATE INDEX ON :AOPEG_GraphNode(nodeType)',
            'CREATE INDEX ON :AOPEG_GraphNode(status)',

            // AOPEG Execution
            'CREATE INDEX ON :AOPEG_Execution(executionId)',
            'CREATE INDEX ON :AOPEG_Execution(status)',
            'CREATE INDEX ON :AOPEG_Execution(startedAt)',

            // ExecutionPattern for PatternLibrary
            'CREATE INDEX ON :ExecutionPattern(patternId)',
            'CREATE INDEX ON :ExecutionPattern(category)',
            'CREATE INDEX ON :ExecutionPattern(successRate)',
            'CREATE INDEX ON :ExecutionPattern(lastUsed)'
        ];

        for (const index of indices) {
            await this.safeExecute(index, 'aopeg-index');
        }

        console.log(`  ✅ Created ${indices.length} AOPEG indices`);
    }

    /**
     * Создание индексов для namespace isolation
     */
    async createNamespaceIndices() {
        console.log('  📊 Creating namespace indices...');

        const indices = [
            // KnowledgeQuantum namespace support
            'CREATE INDEX ON :KnowledgeQuantum(namespace)',
            'CREATE INDEX ON :KnowledgeQuantum(fullNamespace)',
            'CREATE INDEX ON :KnowledgeQuantum(quantumId)',

            // Entity indexes for normalized form lookups
            'CREATE INDEX ON :Entity(normalizedForm)',
            'CREATE INDEX ON :Entity(name)',
            'CREATE INDEX ON :Entity(namespace)',

            // Document indexes for deduplication
            'CREATE INDEX ON :Document(sourceHash)',
            'CREATE INDEX ON :Document(fileHash)',
            'CREATE INDEX ON :Document(url)',
            'CREATE INDEX ON :Document(sourceId)'
        ];

        for (const index of indices) {
            await this.safeExecute(index, 'namespace-index');
        }

        console.log(`  ✅ Created ${indices.length} namespace indices`);
    }

    /**
     * Список всех существующих индексов
     * @returns {Promise<Array>} - Массив индексов
     */
    async listIndexes() {
        try {
            const result = await this.db.executeQuery('SHOW INDEX INFO');
            return result.records.map(r => {
                const obj = r.toObject();
                return {
                    label: obj.label,
                    property: obj.property,
                    type: obj.type || 'index',
                    count: obj.count?.toNumber ? obj.count.toNumber() : obj.count
                };
            });
        } catch (error) {
            console.warn('Could not fetch index info:', error.message);
            return [];
        }
    }

    /**
     * Benchmark query to measure index effectiveness
     * @param {string} cypher - Query to benchmark
     * @param {Object} params - Query parameters
     * @returns {Promise<Object>} - Benchmark result
     */
    async benchmarkQuery(cypher, params = {}) {
        const start = Date.now();
        const result = await this.db.executeQuery(cypher, params);
        const duration = Date.now() - start;

        return {
            duration,
            recordCount: result.records?.length || 0,
            query: cypher.substring(0, 100)
        };
    }

    /**
     * Получение информации о схеме
     */
    async getSchemaInfo() {
        const constraintsQuery = 'SHOW CONSTRAINT INFO';
        const indicesQuery = 'SHOW INDEX INFO';

        let constraints = [];
        let indices = [];

        try {
            const constraintsResult = await this.db.executeQuery(constraintsQuery);
            constraints = constraintsResult.records.map(r => r.toObject());
        } catch (error) {
            console.warn('Could not fetch constraints info:', error.message);
        }

        try {
            const indicesResult = await this.db.executeQuery(indicesQuery);
            indices = indicesResult.records.map(r => r.toObject());
        } catch (error) {
            console.warn('Could not fetch indices info:', error.message);
        }

        return { constraints, indices };
    }

    /**
     * Удаление всей схемы (для пересоздания)
     * ВНИМАНИЕ: Опасная операция!
     */
    async dropSchema() {
        console.log('⚠️ Dropping all schema objects...');

        // Получаем все constraints и удаляем их
        try {
            const dropConstraintsQuery = `
                CALL schema.assert({}, {}, true) YIELD label, key
                RETURN label, key
            `;
            await this.db.executeQuery(dropConstraintsQuery);
        } catch (error) {
            // Memgraph может не поддерживать schema.assert
            console.warn('Schema drop via assert not supported, skipping');
        }

        console.log('✅ Schema dropped');
    }
}

module.exports = { GraphSchemaManager };
