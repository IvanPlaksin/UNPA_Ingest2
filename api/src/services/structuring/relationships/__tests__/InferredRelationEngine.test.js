const {
    InferredRelationEngine,
    InferenceMethod,
    InferredRelationType,
    NamingPatterns,
} = require('../InferredRelationEngine');

// Mock EmbeddingService
const mockEmbeddingService = {
    generateEntityEmbedding: jest.fn(),
    searchSimilar: jest.fn(),
};

// Mock Graph Client
const mockGraphClient = {
    query: jest.fn(),
};

describe('InferredRelationEngine', () => {
    let engine;

    beforeEach(() => {
        jest.clearAllMocks();
        engine = new InferredRelationEngine(mockGraphClient, mockEmbeddingService, {
            minConfidence: 0.5,
            semanticSimilarityThreshold: 0.7,
        });
    });

    describe('constructor', () => {
        test('should initialize with default options', () => {
            const defaultEngine = new InferredRelationEngine(null, null);
            const info = defaultEngine.getInfo();

            expect(info.enabledMethods).toHaveLength(5);
            expect(info.minConfidence).toBe(0.6);
            expect(info.semanticSimilarityThreshold).toBe(0.75);
        });

        test('should accept custom options', () => {
            const customEngine = new InferredRelationEngine(null, null, {
                minConfidence: 0.8,
                semanticSimilarityThreshold: 0.9,
                enabledMethods: [InferenceMethod.NAMING_PATTERN],
            });
            const info = customEngine.getInfo();

            expect(info.minConfidence).toBe(0.8);
            expect(info.semanticSimilarityThreshold).toBe(0.9);
            expect(info.enabledMethods).toEqual([InferenceMethod.NAMING_PATTERN]);
        });
    });

    describe('computeSemanticSimilarity', () => {
        test('should find semantically similar entities', async () => {
            const entity = {
                label: 'Function',
                properties: { id: 'func-1', name: 'calculateTotal' }
            };

            const mockEmbedding = new Array(1024).fill(0.1);
            mockEmbeddingService.generateEntityEmbedding.mockResolvedValueOnce(mockEmbedding);
            mockEmbeddingService.searchSimilar.mockResolvedValueOnce([
                { id: 'func-2', score: 0.85, payload: { name: 'computeSum' } },
                { id: 'func-3', score: 0.78, payload: { name: 'getTotal' } },
            ]);

            const relations = await engine.computeSemanticSimilarity(entity);

            expect(relations).toHaveLength(2);
            expect(relations[0].type).toBe(InferredRelationType.SIMILAR_TO);
            expect(relations[0].properties.confidence).toBe(0.85);
            expect(relations[0].properties.method).toBe(InferenceMethod.SEMANTIC_SIMILARITY);
        });

        test('should return empty array if no embedding service', async () => {
            const noEmbeddingEngine = new InferredRelationEngine(mockGraphClient, null);
            const entity = { label: 'Function', properties: { name: 'test' } };

            const relations = await noEmbeddingEngine.computeSemanticSimilarity(entity);

            expect(relations).toEqual([]);
        });

        test('should return empty array if embedding generation fails', async () => {
            mockEmbeddingService.generateEntityEmbedding.mockResolvedValueOnce(null);

            const entity = { label: 'Function', properties: { name: 'test' } };
            const relations = await engine.computeSemanticSimilarity(entity);

            expect(relations).toEqual([]);
        });

        test('should exclude entity itself from results', async () => {
            const entity = {
                label: 'Function',
                properties: { id: 'func-1', qualifiedName: 'src/utils.ts#func-1' }
            };

            mockEmbeddingService.generateEntityEmbedding.mockResolvedValueOnce([0.1]);
            mockEmbeddingService.searchSimilar.mockResolvedValueOnce([]);

            await engine.computeSemanticSimilarity(entity);

            expect(mockEmbeddingService.searchSimilar).toHaveBeenCalledWith(
                'embeddings_code',
                expect.any(Array),
                expect.objectContaining({
                    excludeIds: ['func-1', 'src/utils.ts#func-1'],
                })
            );
        });
    });

    describe('computeCoOccurrence', () => {
        test('should find co-occurring entities', async () => {
            const entity = {
                label: 'Class',
                properties: { id: 'class-1', name: 'UserService' }
            };

            mockGraphClient.query.mockResolvedValueOnce([
                { targetId: 'class-2', targetName: 'OrderService', coOccurrences: 5, commonNodes: ['User', 'Order'] },
                { targetId: 'class-3', targetName: 'PaymentService', coOccurrences: 3, commonNodes: ['Payment'] },
            ]);

            const relations = await engine.computeCoOccurrence(entity);

            expect(relations).toHaveLength(2);
            expect(relations[0].type).toBe(InferredRelationType.CO_OCCURS_WITH);
            expect(relations[0].properties.method).toBe(InferenceMethod.CO_OCCURRENCE);
            expect(relations[0].properties.coOccurrenceCount).toBe(5);
            expect(relations[0].properties.commonNodes).toEqual(['User', 'Order']);
        });

        test('should return empty array without graph client', async () => {
            const noGraphEngine = new InferredRelationEngine(null, mockEmbeddingService);
            const entity = { label: 'Class', properties: { id: 'c1' } };

            const relations = await noGraphEngine.computeCoOccurrence(entity);

            expect(relations).toEqual([]);
        });

        test('should return empty array for entity without id', async () => {
            const entity = { label: 'Class', properties: { name: 'Test' } };
            const relations = await engine.computeCoOccurrence(entity);

            expect(relations).toEqual([]);
            expect(mockGraphClient.query).not.toHaveBeenCalled();
        });

        test('should calculate confidence based on co-occurrence count', async () => {
            const entity = { label: 'Class', properties: { id: 'c1' } };

            mockGraphClient.query.mockResolvedValueOnce([
                { targetId: 't1', coOccurrences: 2, commonNodes: [] },
                { targetId: 't2', coOccurrences: 5, commonNodes: [] },
            ]);

            const relations = await engine.computeCoOccurrence(entity);

            // 0.5 + 2*0.1 = 0.7 for first, 0.5 + 5*0.1 = 0.9 (capped) for second
            expect(relations[0].properties.confidence).toBeCloseTo(0.7);
            expect(relations[1].properties.confidence).toBeCloseTo(0.9);
        });
    });

    describe('computeNamingPatterns', () => {
        test('should detect Service -> Entity pattern', async () => {
            const entity = {
                label: 'Class',
                properties: { id: 'svc-1', name: 'UserService' }
            };

            const existingEntities = [
                { label: 'Class', properties: { id: 'entity-1', name: 'User' } },
            ];

            const relations = await engine.computeNamingPatterns(entity, { existingEntities });

            expect(relations.length).toBeGreaterThan(0);
            const serviceEntityRel = relations.find(r => r.targetId === 'entity-1');
            expect(serviceEntityRel).toBeDefined();
            expect(serviceEntityRel.type).toBe(InferredRelationType.DEPENDS_ON);
            expect(serviceEntityRel.properties.patternName).toBe('SERVICE_ENTITY');
        });

        test('should detect Interface -> Implementation pattern', async () => {
            const entity = {
                label: 'Interface',
                properties: { id: 'int-1', name: 'IUserService' }
            };

            const existingEntities = [
                { label: 'Class', properties: { id: 'class-1', name: 'UserService' } },
            ];

            const relations = await engine.computeNamingPatterns(entity, { existingEntities });

            const implRel = relations.find(r => r.properties.patternName === 'INTERFACE_IMPL');
            expect(implRel).toBeDefined();
            expect(implRel.type).toBe(InferredRelationType.IMPLEMENTS_PATTERN);
            expect(implRel.properties.confidence).toBe(0.9);
        });

        test('should detect Repository -> Entity pattern', async () => {
            const entity = {
                label: 'Class',
                properties: { name: 'OrderRepository' }
            };

            const existingEntities = [
                { label: 'Class', properties: { name: 'Order' } },
            ];

            const relations = await engine.computeNamingPatterns(entity, { existingEntities });

            const repoRel = relations.find(r => r.properties.patternName === 'REPOSITORY_ENTITY');
            expect(repoRel).toBeDefined();
        });

        test('should detect Controller -> Service pattern', async () => {
            const entity = {
                label: 'Class',
                properties: { name: 'ProductController' }
            };

            const existingEntities = [
                { label: 'Class', properties: { name: 'ProductService' } },
            ];

            const relations = await engine.computeNamingPatterns(entity, { existingEntities });

            const ctrlRel = relations.find(r => r.properties.patternName === 'CONTROLLER_SERVICE');
            expect(ctrlRel).toBeDefined();
        });

        test('should detect Handler -> Command pattern', async () => {
            const entity = {
                label: 'Class',
                properties: { name: 'CreateUserHandler' }
            };

            const existingEntities = [
                { label: 'Class', properties: { name: 'CreateUser' } },
            ];

            const relations = await engine.computeNamingPatterns(entity, { existingEntities });

            const handlerRel = relations.find(r => r.properties.patternName === 'HANDLER_COMMAND');
            expect(handlerRel).toBeDefined();
        });

        test('should detect DTO -> Entity pattern (case insensitive)', async () => {
            const entity = {
                label: 'Class',
                properties: { name: 'UserDTO' }
            };

            const existingEntities = [
                { label: 'Class', properties: { name: 'User' } },
            ];

            const relations = await engine.computeNamingPatterns(entity, { existingEntities });

            const dtoRel = relations.find(r => r.properties.patternName === 'DTO_ENTITY');
            expect(dtoRel).toBeDefined();
            expect(dtoRel.type).toBe(InferredRelationType.DERIVED_FROM);
        });

        test('should create potential relation when target not found', async () => {
            const entity = {
                label: 'Class',
                properties: { name: 'CustomerService' }
            };

            // No Customer entity exists
            const relations = await engine.computeNamingPatterns(entity, { existingEntities: [] });

            const potentialRel = relations.find(r => r.properties.patternName === 'SERVICE_ENTITY');
            expect(potentialRel).toBeDefined();
            expect(potentialRel.properties.isPotential).toBe(true);
            expect(potentialRel.targetName).toBe('Customer');
            // Confidence should be reduced for potential relations
            expect(potentialRel.properties.confidence).toBe(0.85 * 0.7);
        });

        test('should return empty array for entity without name', async () => {
            const entity = { label: 'Class', properties: {} };
            const relations = await engine.computeNamingPatterns(entity);

            expect(relations).toEqual([]);
        });

        test('should search in graph if existingEntities not provided', async () => {
            const entity = {
                label: 'Class',
                properties: { name: 'UserService' }
            };

            mockGraphClient.query.mockResolvedValueOnce([
                { n: { properties: { id: 'user-1', name: 'User' } } }
            ]);

            const relations = await engine.computeNamingPatterns(entity);

            expect(mockGraphClient.query).toHaveBeenCalled();
        });
    });

    describe('computeStructuralRelations', () => {
        test('should find transitive dependencies', async () => {
            const entity = {
                label: 'Class',
                properties: { id: 'class-a', name: 'ClassA' }
            };

            mockGraphClient.query.mockResolvedValueOnce([
                { targetId: 'class-c', targetName: 'ClassC', distance: 2, pathCount: 3 },
                { targetId: 'class-d', targetName: 'ClassD', distance: 3, pathCount: 1 },
            ]);

            const relations = await engine.computeStructuralRelations(entity);

            expect(relations).toHaveLength(2);
            expect(relations[0].type).toBe(InferredRelationType.DEPENDS_ON);
            expect(relations[0].properties.method).toBe(InferenceMethod.STRUCTURAL);
            expect(relations[0].properties.isTransitive).toBe(true);
            expect(relations[0].properties.transitiveDistance).toBe(2);
        });

        test('should reduce confidence with distance', async () => {
            const entity = { label: 'Class', properties: { id: 'c1' } };

            mockGraphClient.query.mockResolvedValueOnce([
                { targetId: 't1', distance: 2, pathCount: 1 },
                { targetId: 't2', distance: 3, pathCount: 1 },
            ]);

            const relations = await engine.computeStructuralRelations(entity);

            // 0.9 - 2*0.15 = 0.6 for distance 2
            // 0.9 - 3*0.15 = 0.45, but min is 0.5
            expect(relations[0].properties.confidence).toBeCloseTo(0.6);
            expect(relations[1].properties.confidence).toBeCloseTo(0.5);
        });

        test('should return empty array without graph client', async () => {
            const noGraphEngine = new InferredRelationEngine(null, mockEmbeddingService);
            const entity = { label: 'Class', properties: { id: 'c1' } };

            const relations = await noGraphEngine.computeStructuralRelations(entity);

            expect(relations).toEqual([]);
        });
    });

    describe('computeTemporalProximity', () => {
        test('should find entities changed together', async () => {
            const entity = {
                label: 'File',
                properties: { id: 'file-1', name: 'UserService.ts' }
            };

            mockGraphClient.query.mockResolvedValueOnce([
                { targetId: 'file-2', targetName: 'UserRepository.ts', sharedCommits: 10, commitHashes: ['abc123', 'def456'] },
                { targetId: 'file-3', targetName: 'User.ts', sharedCommits: 5, commitHashes: ['abc123'] },
            ]);

            const relations = await engine.computeTemporalProximity(entity);

            expect(relations).toHaveLength(2);
            expect(relations[0].type).toBe(InferredRelationType.CHANGED_WITH);
            expect(relations[0].properties.method).toBe(InferenceMethod.TEMPORAL_PROXIMITY);
            expect(relations[0].properties.sharedCommits).toBe(10);
        });

        test('should increase confidence with shared commits', async () => {
            const entity = { label: 'File', properties: { id: 'f1' } };

            mockGraphClient.query.mockResolvedValueOnce([
                { targetId: 't1', sharedCommits: 2, commitHashes: [] },
                { targetId: 't2', sharedCommits: 5, commitHashes: [] },
            ]);

            const relations = await engine.computeTemporalProximity(entity);

            // 0.5 + 2*0.1 = 0.7
            // 0.5 + 5*0.1 = 0.9 (capped at 0.95)
            expect(relations[0].properties.confidence).toBeCloseTo(0.7);
            expect(relations[1].properties.confidence).toBeCloseTo(0.95);
        });
    });

    describe('computeInferredRelations', () => {
        test('should combine results from all methods', async () => {
            const entity = {
                label: 'Class',
                properties: { id: 'svc-1', name: 'UserService' }
            };

            // Mock semantic similarity
            mockEmbeddingService.generateEntityEmbedding.mockResolvedValueOnce([0.1]);
            mockEmbeddingService.searchSimilar.mockResolvedValueOnce([
                { id: 'svc-2', score: 0.85 }
            ]);

            // Mock co-occurrence
            mockGraphClient.query
                .mockResolvedValueOnce([{ targetId: 'co-1', coOccurrences: 3, commonNodes: [] }])
                // Mock structural
                .mockResolvedValueOnce([{ targetId: 'str-1', distance: 2, pathCount: 1 }])
                // Mock temporal
                .mockResolvedValueOnce([{ targetId: 'tmp-1', sharedCommits: 4, commitHashes: [] }])
                // Mock naming pattern graph search
                .mockResolvedValueOnce([{ n: { properties: { name: 'User' } } }]);

            const relations = await engine.computeInferredRelations(entity);

            // Should have relations from multiple methods
            expect(relations.length).toBeGreaterThan(0);

            const methods = new Set(relations.map(r => r.properties.method));
            expect(methods.size).toBeGreaterThan(1);
        });

        test('should filter by specified methods', async () => {
            const entity = {
                label: 'Class',
                properties: { name: 'TestService' }
            };

            const relations = await engine.computeInferredRelations(entity, {
                methods: [InferenceMethod.NAMING_PATTERN],
                existingEntities: [{ label: 'Class', properties: { name: 'Test' } }],
            });

            // Should only have naming pattern results
            relations.forEach(r => {
                expect(r.properties.method).toBe(InferenceMethod.NAMING_PATTERN);
            });
        });

        test('should continue on method failure', async () => {
            const entity = {
                label: 'Class',
                properties: { id: 'c1', name: 'TestService' }
            };

            // Make semantic fail
            mockEmbeddingService.generateEntityEmbedding.mockRejectedValueOnce(new Error('Embedding failed'));

            // Make graph queries fail
            mockGraphClient.query.mockRejectedValue(new Error('Graph failed'));

            // Should still get naming pattern results
            const relations = await engine.computeInferredRelations(entity, {
                existingEntities: [{ label: 'Class', properties: { name: 'Test' } }],
            });

            const namingRels = relations.filter(r => r.properties.method === InferenceMethod.NAMING_PATTERN);
            expect(namingRels.length).toBeGreaterThan(0);
        });
    });

    describe('computeBatchRelations', () => {
        test('should process multiple entities', async () => {
            const entities = [
                { label: 'Class', properties: { name: 'UserService' } },
                { label: 'Class', properties: { name: 'OrderService' } },
            ];

            // Just test naming patterns
            const batchEngine = new InferredRelationEngine(null, null, {
                enabledMethods: [InferenceMethod.NAMING_PATTERN],
                minConfidence: 0.3,
            });

            const relations = await batchEngine.computeBatchRelations(entities);

            expect(relations.length).toBeGreaterThan(0);
        });

        test('should pass existingEntities to naming patterns', async () => {
            const batchEngine = new InferredRelationEngine(null, null, {
                enabledMethods: [InferenceMethod.NAMING_PATTERN],
                minConfidence: 0.3,
            });

            const entities = [
                { label: 'Class', properties: { name: 'User' } },
                { label: 'Class', properties: { name: 'UserService' } },
            ];

            const relations = await batchEngine.computeBatchRelations(entities);

            // UserService should find User
            const foundUser = relations.some(r =>
                r.sourceId === 'UserService' && !r.properties.isPotential
            );
            expect(foundUser).toBe(true);
        });
    });

    describe('persistInferredRelations', () => {
        test('should persist relations to graph', async () => {
            const relations = [
                {
                    sourceId: 'src-1',
                    targetId: 'tgt-1',
                    type: InferredRelationType.SIMILAR_TO,
                    properties: { confidence: 0.8, method: 'test' },
                },
            ];

            mockGraphClient.query.mockResolvedValueOnce([{ r: {} }]);

            const result = await engine.persistInferredRelations(relations);

            expect(result.persisted).toBe(1);
            expect(result.skipped).toBe(0);
            expect(mockGraphClient.query).toHaveBeenCalled();
        });

        test('should skip potential relations by default', async () => {
            const relations = [
                {
                    sourceId: 'src-1',
                    targetId: 'tgt-1',
                    type: InferredRelationType.DEPENDS_ON,
                    properties: { confidence: 0.8, isPotential: true },
                },
            ];

            const result = await engine.persistInferredRelations(relations);

            expect(result.persisted).toBe(0);
            expect(result.skipped).toBe(1);
            expect(mockGraphClient.query).not.toHaveBeenCalled();
        });

        test('should include potential relations when option set', async () => {
            const relations = [
                {
                    sourceId: 'src-1',
                    targetId: 'tgt-1',
                    type: InferredRelationType.DEPENDS_ON,
                    properties: { confidence: 0.8, isPotential: true },
                },
            ];

            mockGraphClient.query.mockResolvedValueOnce([{ r: {} }]);

            const result = await engine.persistInferredRelations(relations, { includePotential: true });

            expect(result.persisted).toBe(1);
        });

        test('should return zeros without graph client', async () => {
            const noGraphEngine = new InferredRelationEngine(null, mockEmbeddingService);

            const result = await noGraphEngine.persistInferredRelations([{ sourceId: 's', targetId: 't' }]);

            expect(result.persisted).toBe(0);
            expect(result.skipped).toBe(0);
        });

        test('should handle persist errors gracefully', async () => {
            const relations = [
                { sourceId: 's1', targetId: 't1', type: 'TEST', properties: {} },
                { sourceId: 's2', targetId: 't2', type: 'TEST', properties: {} },
            ];

            mockGraphClient.query
                .mockRejectedValueOnce(new Error('Failed'))
                .mockResolvedValueOnce([{ r: {} }]);

            const result = await engine.persistInferredRelations(relations);

            expect(result.persisted).toBe(1);
            expect(result.skipped).toBe(1);
        });
    });

    describe('_filterAndDeduplicateRelations', () => {
        test('should filter by minimum confidence', () => {
            const relations = [
                { sourceId: 's1', targetId: 't1', type: 'A', properties: { confidence: 0.8 } },
                { sourceId: 's2', targetId: 't2', type: 'A', properties: { confidence: 0.3 } },
            ];

            const filtered = engine._filterAndDeduplicateRelations(relations);

            expect(filtered).toHaveLength(1);
            expect(filtered[0].sourceId).toBe('s1');
        });

        test('should deduplicate keeping highest confidence', () => {
            const relations = [
                { sourceId: 's1', targetId: 't1', type: 'A', properties: { confidence: 0.7 } },
                { sourceId: 's1', targetId: 't1', type: 'A', properties: { confidence: 0.9 } },
                { sourceId: 's1', targetId: 't1', type: 'A', properties: { confidence: 0.8 } },
            ];

            const filtered = engine._filterAndDeduplicateRelations(relations);

            expect(filtered).toHaveLength(1);
            expect(filtered[0].properties.confidence).toBe(0.9);
        });

        test('should keep different relation types', () => {
            const relations = [
                { sourceId: 's1', targetId: 't1', type: 'A', properties: { confidence: 0.8 } },
                { sourceId: 's1', targetId: 't1', type: 'B', properties: { confidence: 0.8 } },
            ];

            const filtered = engine._filterAndDeduplicateRelations(relations);

            expect(filtered).toHaveLength(2);
        });
    });

    describe('_getCollectionForEntity', () => {
        test('should return correct collection for code entities', () => {
            expect(engine._getCollectionForEntity({ label: 'Function' })).toBe('embeddings_code');
            expect(engine._getCollectionForEntity({ label: 'CLASS' })).toBe('embeddings_code');
            expect(engine._getCollectionForEntity({ label: 'Method' })).toBe('embeddings_code');
            expect(engine._getCollectionForEntity({ label: 'Interface' })).toBe('embeddings_code');
            expect(engine._getCollectionForEntity({ label: 'File' })).toBe('embeddings_code');
        });

        test('should return correct collection for work items', () => {
            expect(engine._getCollectionForEntity({ label: 'WorkItem' })).toBe('embeddings_workitems');
            expect(engine._getCollectionForEntity({ label: 'Bug' })).toBe('embeddings_workitems');
            expect(engine._getCollectionForEntity({ label: 'UserStory' })).toBe('embeddings_workitems');
            expect(engine._getCollectionForEntity({ label: 'Task' })).toBe('embeddings_workitems');
        });

        test('should return correct collection for documents', () => {
            expect(engine._getCollectionForEntity({ label: 'Document' })).toBe('embeddings_docs');
            expect(engine._getCollectionForEntity({ label: 'Requirement' })).toBe('embeddings_docs');
            expect(engine._getCollectionForEntity({ label: 'Specification' })).toBe('embeddings_docs');
        });

        test('should return unified collection for unknown entities', () => {
            expect(engine._getCollectionForEntity({ label: 'Unknown' })).toBe('embeddings_unified');
            expect(engine._getCollectionForEntity({})).toBe('embeddings_unified');
        });
    });

    describe('getInfo', () => {
        test('should return engine configuration', () => {
            const info = engine.getInfo();

            expect(info.enabledMethods).toBeDefined();
            expect(info.semanticSimilarityThreshold).toBe(0.7);
            expect(info.minConfidence).toBe(0.5);
            expect(info.namingPatterns).toContain('SERVICE_ENTITY');
            expect(info.inferredRelationTypes).toContain(InferredRelationType.SIMILAR_TO);
        });
    });

    describe('NamingPatterns', () => {
        test('should export naming patterns', () => {
            expect(NamingPatterns.SERVICE_ENTITY).toBeDefined();
            expect(NamingPatterns.INTERFACE_IMPL).toBeDefined();
            expect(NamingPatterns.REPOSITORY_ENTITY).toBeDefined();
            expect(NamingPatterns.CONTROLLER_SERVICE).toBeDefined();
            expect(NamingPatterns.HANDLER_COMMAND).toBeDefined();
            expect(NamingPatterns.DTO_ENTITY).toBeDefined();
            expect(NamingPatterns.TEST_TESTED).toBeDefined();
        });

        test('SERVICE_ENTITY pattern should match correctly', () => {
            const pattern = NamingPatterns.SERVICE_ENTITY;
            const match = 'UserService'.match(pattern.pattern);

            expect(match).not.toBeNull();
            expect(pattern.targetPattern(match)).toBe('User');
        });

        test('INTERFACE_IMPL pattern should match correctly', () => {
            const pattern = NamingPatterns.INTERFACE_IMPL;
            const match = 'IUserService'.match(pattern.pattern);

            expect(match).not.toBeNull();
            expect(pattern.targetPattern(match)).toBe('UserService');
        });

        test('TEST_TESTED pattern should match correctly', () => {
            const pattern = NamingPatterns.TEST_TESTED;
            const match = 'UserService.test'.match(pattern.pattern);

            expect(match).not.toBeNull();
            expect(pattern.targetPattern(match)).toBe('UserService');
        });
    });

    describe('InferenceMethod enum', () => {
        test('should have all methods', () => {
            expect(InferenceMethod.SEMANTIC_SIMILARITY).toBe('semantic_similarity');
            expect(InferenceMethod.CO_OCCURRENCE).toBe('co_occurrence');
            expect(InferenceMethod.NAMING_PATTERN).toBe('naming_pattern');
            expect(InferenceMethod.STRUCTURAL).toBe('structural');
            expect(InferenceMethod.TEMPORAL_PROXIMITY).toBe('temporal_proximity');
        });
    });

    describe('InferredRelationType enum', () => {
        test('should have all relation types', () => {
            expect(InferredRelationType.SIMILAR_TO).toBe('SIMILAR_TO');
            expect(InferredRelationType.RELATED_TO).toBe('RELATED_TO');
            expect(InferredRelationType.DEPENDS_ON).toBe('DEPENDS_ON');
            expect(InferredRelationType.DERIVED_FROM).toBe('DERIVED_FROM');
            expect(InferredRelationType.CO_OCCURS_WITH).toBe('CO_OCCURS_WITH');
            expect(InferredRelationType.IMPLEMENTS_PATTERN).toBe('IMPLEMENTS_PATTERN');
            expect(InferredRelationType.CHANGED_WITH).toBe('CHANGED_WITH');
        });
    });
});
