/**
 * StructuringWorker - BullMQ worker для оркестрации pipeline структурирования
 *
 * Полный поток обработки данных:
 * Raw Data (code/workitem/doc) → Extract → Resolve → Persist → Relations → Embeddings
 */

const { Worker, Queue } = require('bullmq');
const { ASTExtractor } = require('../../services/structuring/extractors/ASTExtractor');
const { LLMExtractor } = require('../../services/structuring/extractors/LLMExtractor');
const { HybridResolver } = require('../../services/structuring/extractors/HybridResolver');
const { InferredRelationEngine } = require('../../services/structuring/relationships/InferredRelationEngine');
const { EmbeddingService } = require('../../services/structuring/embeddings/EmbeddingService');
const { WorkItemExtractor, createWorkItemExtractor } = require('../../services/extraction/work-item-extractor');
const { CrossSourceResolver, createCrossSourceResolver } = require('../../services/extraction/cross-source-resolver');

/**
 * Типы задач для pipeline структурирования
 */
const JobType = {
    CODE: 'code',
    WORKITEM: 'workitem',
    DOCUMENT: 'document',
    CHANGESET: 'changeset',
    BATCH: 'batch',
};

/**
 * Стадии обработки для отслеживания прогресса
 */
const Stage = {
    INIT: 'init',
    EXTRACTION: 'extraction',
    RESOLUTION: 'resolution',
    GRAPH_PERSIST: 'graph_persist',
    RELATIONSHIPS: 'relationships',
    EMBEDDINGS: 'embeddings',
    COMPLETE: 'complete',
    FAILED: 'failed',
};

class StructuringWorker {
    /**
     * @param {Object} config
     * @param {Object} config.redis - Redis connection config
     * @param {Object} config.graphService - Memgraph service instance
     * @param {Object} config.llmService - LLM service instance
     * @param {Object} config.embeddingService - EmbeddingService instance (optional)
     */
    constructor(config) {
        this.config = {
            queueName: 'structuring',
            concurrency: 3,
            ...config,
        };

        // Services
        this.graph = config.graphService;
        this.llm = config.llmService;

        // Initialize extractors
        this.astExtractor = new ASTExtractor();
        this.llmExtractor = new LLMExtractor(config.llmService);
        this.resolver = new HybridResolver(config.embeddingService);

        // Cross-source entity resolver (three-level resolution)
        this.crossSourceResolver = createCrossSourceResolver({
            vectorThreshold: config.vectorThreshold || 0.85,
            fuzzyThreshold: config.fuzzyThreshold || 0.80,
            useGNN: config.useGNN || false
        });

        // Optional services
        this.embeddings = config.embeddingService || null;
        this.relationEngine = this.embeddings
            ? new InferredRelationEngine(this.graph, this.embeddings)
            : null;

        // BullMQ setup
        this.queue = new Queue(this.config.queueName, {
            connection: this.config.redis,
        });

        this.worker = null;
    }

    // ============ Worker Lifecycle ============

    /**
     * Start the worker
     */
    async start() {
        this.worker = new Worker(
            this.config.queueName,
            async (job) => this._processJob(job),
            {
                connection: this.config.redis,
                concurrency: this.config.concurrency,
            }
        );

        this.worker.on('completed', (job, result) => {
            console.log(`✅ Job ${job.id} completed:`, {
                type: job.data.type,
                entities: result?.entitiesCreated || 0,
                relationships: result?.relationshipsCreated || 0,
            });
        });

        this.worker.on('failed', (job, error) => {
            console.error(`❌ Job ${job.id} failed:`, error.message);
        });

        this.worker.on('progress', (job, progress) => {
            console.log(`📊 Job ${job.id} progress:`, progress);
        });

        console.log(`🚀 StructuringWorker started (concurrency: ${this.config.concurrency})`);
    }

    /**
     * Stop the worker gracefully
     */
    async stop() {
        if (this.worker) {
            await this.worker.close();
            console.log('🛑 StructuringWorker stopped');
        }
    }

    // ============ Job Processing ============

    /**
     * Main job processor
     * @param {Job} job - BullMQ job
     * @returns {Promise<StructuringResult>}
     */
    async _processJob(job) {
        const { type, content, metadata, options = {} } = job.data;
        const startTime = Date.now();

        const result = {
            jobId: job.id,
            type,
            stage: Stage.INIT,
            entitiesCreated: 0,
            entitiesUpdated: 0,
            relationshipsCreated: 0,
            embeddingsStored: 0,
            errors: [],
        };

        try {
            // Update progress
            await job.updateProgress({ stage: Stage.EXTRACTION, progress: 10 });

            // 1. EXTRACTION
            result.stage = Stage.EXTRACTION;
            const extractionResult = await this._extract(type, content, metadata);

            if (!extractionResult.entities || extractionResult.entities.length === 0) {
                result.stage = Stage.COMPLETE;
                result.message = 'No entities extracted';
                return result;
            }

            await job.updateProgress({
                stage: Stage.RESOLUTION,
                progress: 30,
                entitiesExtracted: extractionResult.entities.length,
            });

            // 2. RESOLUTION
            result.stage = Stage.RESOLUTION;
            const { resolved, newEntities } = await this._resolveEntities(
                extractionResult.entities,
                metadata.projectId
            );

            await job.updateProgress({
                stage: Stage.GRAPH_PERSIST,
                progress: 50,
                resolved: resolved.length,
                new: newEntities.length,
            });

            // 3. PERSIST TO GRAPH
            result.stage = Stage.GRAPH_PERSIST;
            const allEntities = [...resolved.map(r => r.canonicalEntity), ...newEntities];

            const persistResult = await this._persistEntities(allEntities, metadata);
            result.entitiesCreated = persistResult.created;
            result.entitiesUpdated = persistResult.updated;

            // 4. EXPLICIT RELATIONSHIPS
            result.stage = Stage.RELATIONSHIPS;
            const relResult = await this._persistRelationships(
                extractionResult.relationships,
                metadata
            );
            result.relationshipsCreated = relResult.created;

            await job.updateProgress({ stage: Stage.RELATIONSHIPS, progress: 70 });

            // 5. INFERRED RELATIONSHIPS (optional)
            if (options.inferRelationships && this.relationEngine) {
                const inferredCount = await this._computeAndPersistInferredRelations(
                    allEntities,
                    options
                );
                result.relationshipsCreated += inferredCount;
            }

            await job.updateProgress({ stage: Stage.EMBEDDINGS, progress: 85 });

            // 6. EMBEDDINGS (optional)
            if (options.generateEmbeddings && this.embeddings) {
                result.stage = Stage.EMBEDDINGS;
                result.embeddingsStored = await this._generateAndStoreEmbeddings(
                    allEntities,
                    metadata
                );
            }

            result.stage = Stage.COMPLETE;
            result.processingTimeMs = Date.now() - startTime;

            await job.updateProgress({ stage: Stage.COMPLETE, progress: 100 });

            return result;

        } catch (error) {
            result.stage = Stage.FAILED;
            result.errors.push(error.message);
            result.processingTimeMs = Date.now() - startTime;

            // Re-throw for BullMQ retry mechanism
            throw error;
        }
    }

    // ============ Extraction ============

    /**
     * Extract entities based on content type
     */
    async _extract(type, content, metadata) {
        switch (type) {
            case JobType.CODE:
                return this._extractFromCode(content, metadata);

            case JobType.WORKITEM:
                return this._extractFromWorkItem(content, metadata);

            case JobType.DOCUMENT:
                return this._extractFromDocument(content, metadata);

            case JobType.CHANGESET:
                return this._extractFromChangeset(content, metadata);

            default:
                throw new Error(`Unknown job type: ${type}`);
        }
    }

    async _extractFromCode(content, metadata) {
        const { filePath, language } = metadata;
        const entities = [];
        const relationships = [];

        // 1. AST extraction (structural)
        if (this._isTypeScriptOrJS(filePath)) {
            const astResult = await this.astExtractor.extractFromTypeScript(filePath, content);
            entities.push(...astResult.entities);
            relationships.push(...astResult.relationships);
        }

        // 2. LLM extraction (semantic) - for business rules and concepts
        if (content.length > 50) { // Skip very short files
            try {
                const llmResult = await this.llmExtractor.extractAll(content, {
                    filePath,
                    projectId: metadata.projectId,
                });

                entities.push(...(llmResult.businessRules || []));
                entities.push(...(llmResult.concepts || []));

                // Convert suggested relationships
                for (const suggested of llmResult.suggestedRelationships || []) {
                    relationships.push({
                        type: suggested.type || 'RELATED_TO',
                        sourceId: suggested.from,
                        targetId: suggested.to,
                        properties: {
                            description: suggested.description,
                            inferredByLLM: true,
                        },
                    });
                }
            } catch (error) {
                console.warn('LLM extraction failed:', error.message);
            }
        }

        return { entities, relationships, metadata };
    }

    async _extractFromWorkItem(workItem, metadata) {
        const entities = [];
        const relationships = [];

        // Create WorkItem entity
        const workItemEntity = {
            label: 'WorkItem',
            properties: {
                quantumId: `wi_${workItem.id}`,
                workItemId: workItem.id,
                title: workItem.title,
                description: workItem.description,
                type: workItem.type,
                state: workItem.state,
                assignedTo: workItem.assignedTo,
                areaPath: workItem.areaPath,
                iterationPath: workItem.iterationPath,
                createdDate: workItem.createdDate,
                changedDate: workItem.changedDate,
                projectId: metadata.projectId,
            },
        };
        entities.push(workItemEntity);

        // Use new WorkItemExtractor for comprehensive extraction
        try {
            const extractor = createWorkItemExtractor({
                useLLM: true,
                includeComments: true,
                maxComments: 5
            });

            const extractionResult = await extractor.extract(workItem, {
                includeComments: !!workItem.comments
            });

            // Convert extracted entities to graph format
            for (const entity of extractionResult.entities) {
                const graphEntity = {
                    label: entity.type,
                    properties: {
                        id: entity.normalizedForm || entity.name.toLowerCase().replace(/\s+/g, '_'),
                        name: entity.name,
                        confidence: entity.confidence,
                        source: entity.source,
                        workItemId: workItem.id,
                        ...entity.attributes
                    }
                };
                entities.push(graphEntity);
            }

            // Add extracted relationships
            for (const rel of extractionResult.relationships) {
                relationships.push({
                    type: rel.type,
                    sourceId: rel.source,
                    targetId: rel.target,
                    properties: {
                        confidence: rel.confidence,
                        evidence: rel.evidence
                    }
                });
            }

            // Add business rules as entities
            for (const rule of extractionResult.businessRules) {
                entities.push({
                    label: 'BusinessRule',
                    properties: {
                        id: `rule_${workItem.id}_${Date.now()}`,
                        name: rule.name,
                        description: rule.description,
                        category: rule.type,
                        workItemId: workItem.id
                    }
                });
            }

            // Store User Story format if found
            if (extractionResult.userStory) {
                workItemEntity.properties.userStoryActor = extractionResult.userStory.actor?.role;
                workItemEntity.properties.userStoryAction = extractionResult.userStory.action?.fullText;
                workItemEntity.properties.userStoryBenefit = extractionResult.userStory.benefit?.fullText;
            }

            // Store Gherkin scenarios count
            if (extractionResult.scenarios?.length > 0) {
                workItemEntity.properties.scenarioCount = extractionResult.scenarios.length;
            }

            console.log(`[StructuringWorker] Extracted ${extractionResult.entities.length} entities from WI ${workItem.id}`);

        } catch (error) {
            console.warn(`[StructuringWorker] WorkItemExtractor failed for WI ${workItem.id}:`, error.message);

            // Fallback: Legacy extraction using LLMExtractor
            const text = `${workItem.title}\n${workItem.description || ''}`;
            if (text.length > 20) {
                try {
                    const concepts = await this.llmExtractor.extractDomainConcepts(text, 'workitem');
                    entities.push(...concepts);

                    for (const concept of concepts) {
                        relationships.push({
                            type: 'MENTIONS',
                            sourceId: workItemEntity.properties.quantumId,
                            targetId: concept.properties.id,
                            properties: { source: 'workitem' },
                        });
                    }
                } catch (fallbackError) {
                    console.warn('Fallback concept extraction failed:', fallbackError.message);
                }
            }
        }

        // Parent-child relationships (always process)
        if (workItem.parentId) {
            relationships.push({
                type: 'CHILD_OF',
                sourceId: workItemEntity.properties.quantumId,
                targetId: `wi_${workItem.parentId}`,
                properties: {},
            });
        }

        return { entities, relationships, metadata };
    }

    async _extractFromDocument(document, metadata) {
        const entities = [];
        const relationships = [];

        // Create Document entity
        const docEntity = {
            label: 'Document',
            properties: {
                quantumId: `doc_${metadata.documentId || Date.now()}`,
                title: document.title || metadata.fileName,
                content: document.content?.substring(0, 10000), // Truncate for storage
                documentType: metadata.documentType || 'general',
                filePath: metadata.filePath,
                source: metadata.source || 'unknown',
                createdAt: document.createdAt || new Date().toISOString(),
                projectId: metadata.projectId,
            },
        };
        entities.push(docEntity);

        // Extract concepts
        if (document.content && document.content.length > 50) {
            try {
                const concepts = await this.llmExtractor.extractDomainConcepts(
                    document.content,
                    'documentation'
                );
                entities.push(...concepts);

                for (const concept of concepts) {
                    relationships.push({
                        type: 'DESCRIBES',
                        sourceId: docEntity.properties.quantumId,
                        targetId: concept.properties.id,
                        properties: {},
                    });
                }
            } catch (error) {
                console.warn('Document concept extraction failed:', error.message);
            }
        }

        return { entities, relationships, metadata };
    }

    async _extractFromChangeset(changeset, metadata) {
        const entities = [];
        const relationships = [];

        // Create Changeset/Commit entity
        const changesetEntity = {
            label: changeset.type === 'git' ? 'Commit' : 'Changeset',
            properties: {
                quantumId: `cs_${changeset.id}`,
                sha: changeset.sha || changeset.id,
                message: changeset.message,
                author: changeset.author,
                authorEmail: changeset.authorEmail,
                date: changeset.date,
                projectId: metadata.projectId,
                filesChanged: changeset.files?.length || 0,
            },
        };
        entities.push(changesetEntity);

        // Link to modified files
        for (const file of changeset.files || []) {
            relationships.push({
                type: 'MODIFIES',
                sourceId: changesetEntity.properties.quantumId,
                targetId: file.path, // Will be resolved to File entity
                properties: {
                    changeType: file.changeType, // add, edit, delete
                    additions: file.additions,
                    deletions: file.deletions,
                },
            });
        }

        // Link to work items (from commit message)
        const workItemRefs = this._extractWorkItemReferences(changeset.message);
        for (const wiRef of workItemRefs) {
            relationships.push({
                type: 'IMPLEMENTS',
                sourceId: changesetEntity.properties.quantumId,
                targetId: `wi_${wiRef}`,
                properties: { fromCommitMessage: true },
            });
        }

        return { entities, relationships, metadata };
    }

    // ============ Resolution ============

    async _resolveEntities(entities, projectId) {
        // Get existing entities from graph for resolution
        const existingEntities = await this._getExistingEntities(projectId);

        const resolved = [];
        const newEntities = [];

        // Try CrossSourceResolver first (three-level resolution)
        try {
            // Convert entities to CrossSourceResolver format
            const entitiesToResolve = entities.map(e => ({
                name: e.properties?.name || e.properties?.title || e.label,
                type: e.label,
                source: this._getSourceType(e),
                metadata: {
                    quantumId: e.properties?.quantumId,
                    projectId,
                    ...e.properties
                }
            }));

            const resolutionResults = await this.crossSourceResolver.resolveAll(entitiesToResolve);

            for (let i = 0; i < entities.length; i++) {
                const entity = entities[i];
                const result = resolutionResults[i];

                if (result && result.resolved && !result.isNew) {
                    // Entity was merged with existing canonical entity
                    resolved.push({
                        canonicalEntity: {
                            ...entity,
                            properties: {
                                ...entity.properties,
                                canonicalId: result.canonicalId,
                                mergedFrom: result.entity?.mergedFrom || [],
                                resolutionConfidence: result.confidence,
                                matchLevel: result.matchLevel
                            }
                        },
                        matchedEntity: result.entity,
                        confidence: result.confidence,
                        matchLevel: result.matchLevel
                    });
                } else {
                    // New entity or resolution failed
                    if (!entity.properties.quantumId) {
                        entity.properties.quantumId = this._generateQuantumId(entity);
                    }
                    if (result && result.canonicalId) {
                        entity.properties.canonicalId = result.canonicalId;
                    }
                    newEntities.push(entity);
                }
            }

            // Log resolution stats
            const stats = this.crossSourceResolver.getStats();
            console.log(`[StructuringWorker] Resolution: ${resolved.length} merged, ${newEntities.length} new ` +
                        `(rate: ${stats.resolutionRate}%, dedup: ${stats.deduplicationRatio}%)`);

        } catch (error) {
            console.warn('[StructuringWorker] CrossSourceResolver failed, falling back to HybridResolver:', error.message);

            // Fallback to legacy HybridResolver
            for (const entity of entities) {
                const resolution = await this.resolver.resolve(entity, existingEntities);

                if (resolution) {
                    resolved.push(resolution);
                    const idx = existingEntities.findIndex(
                        e => e.properties.quantumId === resolution.matchedEntity?.properties?.quantumId
                    );
                    if (idx >= 0) {
                        existingEntities[idx] = resolution.canonicalEntity;
                    }
                } else {
                    if (!entity.properties.quantumId) {
                        entity.properties.quantumId = this._generateQuantumId(entity);
                    }
                    newEntities.push(entity);
                    existingEntities.push(entity);
                }
            }
        }

        return { resolved, newEntities };
    }

    async _getExistingEntities(projectId) {
        if (!this.graph) {
            return [];
        }

        try {
            const query = `
                MATCH (n:KnowledgeQuantum)
                WHERE n.projectId = $projectId
                RETURN n, labels(n) as labels
                LIMIT 1000
            `;

            const results = await this.graph.query(query, { projectId });

            return results.map(r => ({
                label: r.labels?.[0] || 'KnowledgeQuantum',
                properties: r.n?.properties || r.n || {},
            }));
        } catch (error) {
            console.warn('Failed to fetch existing entities:', error.message);
            return [];
        }
    }

    // ============ Persistence ============

    async _persistEntities(entities, metadata) {
        if (!this.graph) {
            return { created: 0, updated: 0 };
        }

        let created = 0;
        let updated = 0;

        for (const entity of entities) {
            try {
                const quantumId = entity.properties.quantumId;
                const labels = [entity.label, 'KnowledgeQuantum'].filter(Boolean);

                // Add common metadata
                entity.properties.projectId = metadata.projectId;
                entity.properties.updatedAt = new Date().toISOString();

                // Check if exists
                const existsQuery = `
                    MATCH (n:KnowledgeQuantum {quantumId: $quantumId})
                    RETURN n
                `;
                const existing = await this.graph.query(existsQuery, { quantumId });

                if (existing.length > 0) {
                    // Update
                    const updateQuery = `
                        MATCH (n:KnowledgeQuantum {quantumId: $quantumId})
                        SET n += $properties
                        RETURN n
                    `;
                    await this.graph.query(updateQuery, {
                        quantumId,
                        properties: this._sanitizeProperties(entity.properties),
                    });
                    updated++;
                } else {
                    // Create
                    entity.properties.createdAt = new Date().toISOString();

                    const createQuery = `
                        CREATE (n:${labels.join(':')} $properties)
                        RETURN n
                    `;
                    await this.graph.query(createQuery, {
                        properties: this._sanitizeProperties(entity.properties),
                    });
                    created++;
                }
            } catch (error) {
                console.error(`Failed to persist entity ${entity.properties?.quantumId}:`, error.message);
            }
        }

        return { created, updated };
    }

    async _persistRelationships(relationships, metadata) {
        if (!this.graph) {
            return { created: 0 };
        }

        let created = 0;

        for (const rel of relationships) {
            try {
                // Skip if source or target is empty
                if (!rel.sourceId || !rel.targetId) continue;

                const query = `
                    MATCH (source:KnowledgeQuantum)
                    WHERE source.quantumId = $sourceId
                       OR source.qualifiedName = $sourceId
                       OR source.filePath = $sourceId
                    MATCH (target:KnowledgeQuantum)
                    WHERE target.quantumId = $targetId
                       OR target.qualifiedName = $targetId
                       OR target.filePath = $targetId
                       OR target.name = $targetId
                    MERGE (source)-[r:${rel.type}]->(target)
                    SET r += $properties
                    RETURN r
                `;

                const result = await this.graph.query(query, {
                    sourceId: rel.sourceId,
                    targetId: rel.targetId,
                    properties: this._sanitizeProperties(rel.properties || {}),
                });

                if (result.length > 0) created++;
            } catch (error) {
                // Silently skip failed relationships (target may not exist yet)
                if (!error.message.includes('null')) {
                    console.debug(`Relationship ${rel.sourceId} -[${rel.type}]-> ${rel.targetId} skipped:`, error.message);
                }
            }
        }

        return { created };
    }

    async _computeAndPersistInferredRelations(entities, options) {
        if (!this.relationEngine) return 0;

        let totalCreated = 0;

        for (const entity of entities) {
            try {
                const relations = await this.relationEngine.computeInferredRelations(
                    entity,
                    {
                        methods: this._getEnabledInferenceMethods(options),
                        existingEntities: entities,
                    }
                );

                if (relations.length > 0) {
                    const result = await this.relationEngine.persistInferredRelations(relations);
                    totalCreated += result.persisted;
                }
            } catch (error) {
                console.warn(`Failed to compute inferred relations for ${entity.properties?.quantumId}:`, error.message);
            }
        }

        return totalCreated;
    }

    _getEnabledInferenceMethods(options) {
        const methods = [];
        if (options.semanticRelations !== false) methods.push('semantic_similarity');
        if (options.coOccurrenceRelations !== false) methods.push('co_occurrence');
        if (options.namingPatternRelations !== false) methods.push('naming_pattern');
        if (options.structuralRelations !== false) methods.push('structural');
        if (options.temporalRelations === true) methods.push('temporal_proximity');
        return methods;
    }

    // ============ Embeddings ============

    async _generateAndStoreEmbeddings(entities, metadata) {
        if (!this.embeddings) return 0;

        let stored = 0;
        const BATCH_SIZE = 20;

        // Process in batches
        for (let i = 0; i < entities.length; i += BATCH_SIZE) {
            const batch = entities.slice(i, i + BATCH_SIZE);

            try {
                // Generate embeddings
                const vectors = await this.embeddings.generateBatchEmbeddings(
                    batch.map(e => this._entityToEmbeddingText(e))
                );

                // Prepare points for storage
                const points = batch.map((entity, idx) => ({
                    id: entity.properties.quantumId,
                    vector: vectors[idx],
                    payload: {
                        quantum_id: entity.properties.quantumId,
                        entity_type: entity.label,
                        name: entity.properties.name,
                        project_id: metadata.projectId,
                        source_type: this._getSourceType(entity),
                    },
                })).filter(p => p.vector);

                // Store in appropriate collection
                const collection = this._selectCollection(batch[0]);
                await this.embeddings.storeBatchEmbeddings(collection, points);

                // Also store in unified collection
                await this.embeddings.storeBatchEmbeddings('embeddings_unified', points);

                stored += points.length;

                // Mark entities as having embeddings
                if (this.graph) {
                    for (const point of points) {
                        try {
                            await this.graph.query(`
                                MATCH (n:KnowledgeQuantum {quantumId: $id})
                                SET n.hasEmbedding = true, n.embeddingUpdatedAt = $now
                            `, { id: point.id, now: new Date().toISOString() });
                        } catch (e) {
                            // Ignore individual update failures
                        }
                    }
                }
            } catch (error) {
                console.error('Batch embedding failed:', error.message);
            }
        }

        return stored;
    }

    // ============ Queue API ============

    /**
     * Add a job to the structuring queue
     * @param {string} type - Job type
     * @param {Object} content - Content to process
     * @param {Object} metadata - Processing metadata
     * @param {Object} options - Processing options
     * @returns {Promise<Job>}
     */
    async addJob(type, content, metadata, options = {}) {
        return this.queue.add(
            `structuring:${type}`,
            {
                type,
                content,
                metadata: {
                    ...metadata,
                    timestamp: new Date().toISOString(),
                },
                options: {
                    inferRelationships: true,
                    generateEmbeddings: true,
                    ...options,
                },
            },
            {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
                removeOnComplete: 100,
                removeOnFail: 50,
            }
        );
    }

    /**
     * Add multiple jobs as a batch
     */
    async addBatchJobs(jobs) {
        const bulkJobs = jobs.map((j, idx) => ({
            name: `structuring:${j.type}:${idx}`,
            data: {
                type: j.type,
                content: j.content,
                metadata: j.metadata,
                options: j.options,
            },
            opts: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 2000 },
            },
        }));

        return this.queue.addBulk(bulkJobs);
    }

    /**
     * Get queue statistics
     */
    async getStats() {
        const [waiting, active, completed, failed] = await Promise.all([
            this.queue.getWaitingCount(),
            this.queue.getActiveCount(),
            this.queue.getCompletedCount(),
            this.queue.getFailedCount(),
        ]);

        return { waiting, active, completed, failed };
    }

    // ============ Helpers ============

    _isTypeScriptOrJS(filePath) {
        return /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(filePath);
    }

    _generateQuantumId(entity) {
        const type = entity.label?.toLowerCase() || 'entity';
        const name = entity.properties?.name || 'unknown';
        const hash = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
        return `${type}_${this._slugify(name)}_${hash}`;
    }

    _slugify(str) {
        return str
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '')
            .substring(0, 30);
    }

    _sanitizeProperties(props) {
        const sanitized = {};
        for (const [key, value] of Object.entries(props || {})) {
            if (value === undefined || value === null) continue;
            if (typeof value === 'object' && !Array.isArray(value)) {
                sanitized[key] = JSON.stringify(value);
            } else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }

    _entityToEmbeddingText(entity) {
        const props = entity.properties || {};
        const parts = [
            entity.label && `[${entity.label}]`,
            props.name,
            props.description || props.definition,
            props.documentation,
        ].filter(Boolean);

        return parts.join(' ').substring(0, 2000);
    }

    _selectCollection(entity) {
        const label = entity.label?.toLowerCase() || '';

        if (['file', 'function', 'class', 'method', 'interface'].includes(label)) {
            return 'embeddings_code';
        }
        if (['workitem', 'task', 'bug', 'feature'].includes(label)) {
            return 'embeddings_workitems';
        }
        if (['document'].includes(label)) {
            return 'embeddings_docs';
        }
        return 'embeddings_unified';
    }

    _getSourceType(entity) {
        const label = entity.label?.toLowerCase() || '';

        if (['file', 'function', 'class', 'method'].includes(label)) return 'code';
        if (['workitem', 'task', 'bug'].includes(label)) return 'workitem';
        if (['document'].includes(label)) return 'document';
        if (['commit', 'changeset'].includes(label)) return 'changeset';
        return 'other';
    }

    _extractWorkItemReferences(message) {
        if (!message) return [];

        // Common patterns: #123, AB#123, [#123], Fixes #123, etc.
        const patterns = [
            /#(\d+)/g,
            /\[#(\d+)\]/g,
            /(?:fixes?|closes?|resolves?|implements?)\s*#?(\d+)/gi,
            /(?:AB|PBI|US|BUG|TASK)#(\d+)/gi,
        ];

        const refs = new Set();
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(message)) !== null) {
                refs.add(match[1]);
            }
        }

        return Array.from(refs);
    }
}

module.exports = { StructuringWorker, JobType, Stage };
