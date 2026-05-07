const { StructuringWorker, JobType, Stage } = require('../StructuringWorker');

// Mocks
const mockGraphService = {
    query: jest.fn().mockResolvedValue([]),
};

const mockLLMService = {
    chat: jest.fn().mockResolvedValue('[]'),
};

const mockEmbeddingService = {
    generateBatchEmbeddings: jest.fn().mockResolvedValue([]),
    storeBatchEmbeddings: jest.fn().mockResolvedValue({}),
    generateEntityEmbedding: jest.fn().mockResolvedValue(null),
    searchSimilar: jest.fn().mockResolvedValue([]),
};

// Mock llm-provider to avoid real LLM calls in unit tests
jest.mock('../../../services/extraction/llm-provider', () => ({
    extractEntitiesWithLLM: jest.fn().mockResolvedValue({ entities: [], relationships: [] }),
    isLLMAvailable: jest.fn().mockReturnValue(false),
    getActiveProviderName: jest.fn().mockReturnValue('mock'),
}));

// Mock cross-source-resolver to avoid embedding service calls in unit tests
jest.mock('../../../services/extraction/cross-source-resolver', () => ({
    createCrossSourceResolver: jest.fn(() => ({
        resolveAll: jest.fn().mockResolvedValue([]),
        getStats: jest.fn().mockReturnValue({}),
    })),
    CrossSourceResolver: jest.fn(),
}));

// Mock BullMQ
jest.mock('bullmq', () => ({
    Worker: jest.fn().mockImplementation((name, processor, opts) => ({
        on: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
    })),
    Queue: jest.fn().mockImplementation(() => ({
        add: jest.fn().mockResolvedValue({ id: 'test-job-1' }),
        addBulk: jest.fn().mockResolvedValue([{ id: 'bulk-1' }, { id: 'bulk-2' }]),
        getWaitingCount: jest.fn().mockResolvedValue(5),
        getActiveCount: jest.fn().mockResolvedValue(2),
        getCompletedCount: jest.fn().mockResolvedValue(100),
        getFailedCount: jest.fn().mockResolvedValue(3),
    })),
}));

describe('StructuringWorker', () => {
    let worker;

    beforeEach(() => {
        jest.clearAllMocks();
        worker = new StructuringWorker({
            redis: { host: 'localhost', port: 6379 },
            graphService: mockGraphService,
            llmService: mockLLMService,
            embeddingService: mockEmbeddingService,
        });
    });

    describe('constructor', () => {
        test('should initialize with default config', () => {
            expect(worker.config.queueName).toBe('structuring');
            expect(worker.config.concurrency).toBe(3);
        });

        test('should accept custom config', () => {
            const customWorker = new StructuringWorker({
                redis: { host: 'localhost' },
                graphService: mockGraphService,
                llmService: mockLLMService,
                queueName: 'custom-queue',
                concurrency: 5,
            });

            expect(customWorker.config.queueName).toBe('custom-queue');
            expect(customWorker.config.concurrency).toBe(5);
        });

        test('should create extractors', () => {
            expect(worker.astExtractor).toBeDefined();
            expect(worker.llmExtractor).toBeDefined();
            expect(worker.resolver).toBeDefined();
        });

        test('should create relation engine when embedding service provided', () => {
            expect(worker.relationEngine).toBeDefined();
        });

        test('should not create relation engine without embedding service', () => {
            const noEmbWorker = new StructuringWorker({
                redis: { host: 'localhost' },
                graphService: mockGraphService,
                llmService: mockLLMService,
            });

            expect(noEmbWorker.relationEngine).toBeNull();
        });
    });

    describe('lifecycle', () => {
        test('should start worker', async () => {
            await worker.start();

            expect(worker.worker).toBeDefined();
            expect(worker.worker.on).toHaveBeenCalledWith('completed', expect.any(Function));
            expect(worker.worker.on).toHaveBeenCalledWith('failed', expect.any(Function));
            expect(worker.worker.on).toHaveBeenCalledWith('progress', expect.any(Function));
        });

        test('should stop worker', async () => {
            await worker.start();
            await worker.stop();

            expect(worker.worker.close).toHaveBeenCalled();
        });
    });

    describe('extraction - code', () => {
        test('should extract from TypeScript code', async () => {
            const code = `
                export class UserService {
                    getUser(id: string) { return null; }
                }
            `;

            const result = await worker._extractFromCode(code, {
                filePath: 'services/user.ts',
                projectId: 'test-project',
            });

            expect(result.entities.length).toBeGreaterThan(0);
            expect(result.entities.some(e => e.label === 'Class')).toBe(true);
            expect(result.entities.some(e => e.properties?.name === 'UserService')).toBe(true);
        });

        test('should extract from JavaScript code', async () => {
            const code = `
                function calculateTotal(items) {
                    return items.reduce((sum, item) => sum + item.price, 0);
                }
            `;

            const result = await worker._extractFromCode(code, {
                filePath: 'utils/pricing.js',
                projectId: 'test-project',
            });

            expect(result.entities.length).toBeGreaterThan(0);
            expect(result.entities.some(e => e.label === 'Function')).toBe(true);
        });

        test('should skip AST extraction for non-JS/TS files', async () => {
            const result = await worker._extractFromCode('print("hello")', {
                filePath: 'script.py',
                projectId: 'test-project',
            });

            // Should still attempt LLM extraction but no AST entities
            expect(result.entities.filter(e => e.label === 'File')).toHaveLength(0);
        });

        test('should handle very short content', async () => {
            const result = await worker._extractFromCode('x=1', {
                filePath: 'short.ts',
                projectId: 'test',
            });

            // Should not fail, may have minimal entities
            expect(result).toBeDefined();
            expect(result.entities).toBeDefined();
        });
    });

    describe('extraction - work item', () => {
        test('should extract from work item', async () => {
            mockLLMService.chat.mockResolvedValue('[]');

            const workItem = {
                id: 123,
                title: 'Implement user authentication',
                description: 'Add OAuth2 login flow with Google and Microsoft providers',
                type: 'User Story',
                state: 'Active',
                assignedTo: 'developer@example.com',
                areaPath: 'Project/Authentication',
                iterationPath: 'Sprint 5',
            };

            const result = await worker._extractFromWorkItem(workItem, {
                projectId: 'test-project',
            });

            expect(result.entities.length).toBeGreaterThan(0);
            expect(result.entities[0].label).toBe('WorkItem');
            expect(result.entities[0].properties.workItemId).toBe(123);
            expect(result.entities[0].properties.title).toBe('Implement user authentication');
            expect(result.entities[0].properties.quantumId).toBe('wi_123');
        });

        test('should create parent-child relationship', async () => {
            const workItem = {
                id: 456,
                title: 'Child task',
                parentId: 123,
            };

            const result = await worker._extractFromWorkItem(workItem, {
                projectId: 'test-project',
            });

            const childOfRel = result.relationships.find(r => r.type === 'CHILD_OF');
            expect(childOfRel).toBeDefined();
            expect(childOfRel.sourceId).toBe('wi_456');
            expect(childOfRel.targetId).toBe('wi_123');
        });
    });

    describe('extraction - document', () => {
        test('should extract from document', async () => {
            const document = {
                title: 'API Documentation',
                content: 'This document describes the REST API endpoints for user management.',
                createdAt: '2024-01-01T00:00:00Z',
            };

            const result = await worker._extractFromDocument(document, {
                projectId: 'test-project',
                documentId: 'doc-001',
                documentType: 'api-docs',
            });

            expect(result.entities.length).toBeGreaterThan(0);
            expect(result.entities[0].label).toBe('Document');
            expect(result.entities[0].properties.title).toBe('API Documentation');
            expect(result.entities[0].properties.quantumId).toBe('doc_doc-001');
        });
    });

    describe('extraction - changeset', () => {
        test('should extract from changeset', async () => {
            const changeset = {
                id: 'abc123',
                type: 'git',
                sha: 'abc123def456',
                message: 'Fixed bug #123 and implemented feature #456',
                author: 'Developer',
                authorEmail: 'dev@example.com',
                date: '2024-01-15T10:00:00Z',
                files: [
                    { path: 'src/user.ts', changeType: 'edit', additions: 10, deletions: 5 },
                    { path: 'src/auth.ts', changeType: 'add', additions: 50, deletions: 0 },
                ],
            };

            const result = await worker._extractFromChangeset(changeset, {
                projectId: 'test-project',
            });

            // Check commit entity
            expect(result.entities[0].label).toBe('Commit');
            expect(result.entities[0].properties.sha).toBe('abc123def456');
            expect(result.entities[0].properties.filesChanged).toBe(2);

            // Check file modification relationships
            const modifiesRels = result.relationships.filter(r => r.type === 'MODIFIES');
            expect(modifiesRels).toHaveLength(2);

            // Check work item references
            const implementsRels = result.relationships.filter(r => r.type === 'IMPLEMENTS');
            expect(implementsRels).toHaveLength(2);
            expect(implementsRels.some(r => r.targetId === 'wi_123')).toBe(true);
            expect(implementsRels.some(r => r.targetId === 'wi_456')).toBe(true);
        });

        test('should handle TFVC changeset', async () => {
            const changeset = {
                id: '12345',
                type: 'tfvc',
                message: 'Code review changes',
                author: 'Developer',
            };

            const result = await worker._extractFromChangeset(changeset, {
                projectId: 'test-project',
            });

            expect(result.entities[0].label).toBe('Changeset');
        });
    });

    describe('work item references extraction', () => {
        test('should extract #123 format', () => {
            const refs = worker._extractWorkItemReferences('Fixed bug #123 and #456');
            expect(refs).toContain('123');
            expect(refs).toContain('456');
        });

        test('should extract [#123] format', () => {
            const refs = worker._extractWorkItemReferences('Closes [#789]');
            expect(refs).toContain('789');
        });

        test('should extract "Fixes 123" format', () => {
            const refs = worker._extractWorkItemReferences('Fixes 111, resolves 222');
            expect(refs).toContain('111');
            expect(refs).toContain('222');
        });

        test('should extract AB#123 format', () => {
            const refs = worker._extractWorkItemReferences('Implements AB#999 and PBI#888');
            expect(refs).toContain('999');
            expect(refs).toContain('888');
        });

        test('should handle null message', () => {
            const refs = worker._extractWorkItemReferences(null);
            expect(refs).toEqual([]);
        });

        test('should deduplicate references', () => {
            const refs = worker._extractWorkItemReferences('#123 #123 Fixes #123');
            expect(refs).toEqual(['123']);
        });
    });

    describe('resolution', () => {
        test('should resolve entities against existing', async () => {
            mockGraphService.query.mockResolvedValueOnce([
                { n: { properties: { quantumId: 'existing-1', name: 'ExistingClass' } }, labels: ['Class'] },
            ]);

            const entities = [
                { label: 'Class', properties: { name: 'NewClass' } },
            ];

            const { resolved, newEntities } = await worker._resolveEntities(entities, 'test-project');

            // NewClass should be new (no match)
            expect(newEntities).toHaveLength(1);
            expect(newEntities[0].properties.quantumId).toBeDefined();
        });

        test('should generate quantum ID for new entities', async () => {
            mockGraphService.query.mockResolvedValueOnce([]);

            const entities = [
                { label: 'Function', properties: { name: 'myFunction' } },
            ];

            const { newEntities } = await worker._resolveEntities(entities, 'test-project');

            expect(newEntities[0].properties.quantumId).toMatch(/^function_myfunction_/);
        });

        test('should handle empty existing entities', async () => {
            mockGraphService.query.mockResolvedValueOnce([]);

            const entities = [
                { label: 'Class', properties: { name: 'Test' } },
            ];

            const { resolved, newEntities } = await worker._resolveEntities(entities, 'test-project');

            expect(resolved).toHaveLength(0);
            expect(newEntities).toHaveLength(1);
        });
    });

    describe('persistence', () => {
        test('should persist new entities', async () => {
            mockGraphService.query
                .mockResolvedValueOnce([]) // exists check
                .mockResolvedValueOnce([{ n: {} }]); // create

            const entities = [
                { label: 'Class', properties: { quantumId: 'class-1', name: 'TestClass' } },
            ];

            const result = await worker._persistEntities(entities, { projectId: 'test' });

            expect(result.created).toBe(1);
            expect(result.updated).toBe(0);
        });

        test('should update existing entities', async () => {
            mockGraphService.query
                .mockResolvedValueOnce([{ n: {} }]) // exists check - found
                .mockResolvedValueOnce([{ n: {} }]); // update

            const entities = [
                { label: 'Class', properties: { quantumId: 'class-1', name: 'UpdatedClass' } },
            ];

            const result = await worker._persistEntities(entities, { projectId: 'test' });

            expect(result.created).toBe(0);
            expect(result.updated).toBe(1);
        });

        test('should persist relationships', async () => {
            mockGraphService.query.mockResolvedValue([{ r: {} }]);

            const relationships = [
                { type: 'CONTAINS', sourceId: 'file-1', targetId: 'class-1', properties: {} },
                { type: 'CALLS', sourceId: 'method-1', targetId: 'method-2', properties: {} },
            ];

            const result = await worker._persistRelationships(relationships, { projectId: 'test' });

            expect(result.created).toBe(2);
        });

        test('should skip relationships with missing IDs', async () => {
            const relationships = [
                { type: 'TEST', sourceId: null, targetId: 'target' },
                { type: 'TEST', sourceId: 'source', targetId: '' },
            ];

            const result = await worker._persistRelationships(relationships, { projectId: 'test' });

            expect(result.created).toBe(0);
            expect(mockGraphService.query).not.toHaveBeenCalled();
        });

        test('should return zeros without graph service', async () => {
            const noGraphWorker = new StructuringWorker({
                redis: { host: 'localhost' },
                graphService: null,
                llmService: mockLLMService,
            });

            const result = await noGraphWorker._persistEntities(
                [{ label: 'Test', properties: { quantumId: 't1' } }],
                { projectId: 'test' }
            );

            expect(result.created).toBe(0);
            expect(result.updated).toBe(0);
        });
    });

    describe('embeddings', () => {
        test('should generate and store embeddings', async () => {
            mockEmbeddingService.generateBatchEmbeddings.mockResolvedValue([
                new Array(1024).fill(0.1),
                new Array(1024).fill(0.2),
            ]);

            const entities = [
                { label: 'Class', properties: { quantumId: 'c1', name: 'Class1' } },
                { label: 'Function', properties: { quantumId: 'f1', name: 'func1' } },
            ];

            const stored = await worker._generateAndStoreEmbeddings(entities, { projectId: 'test' });

            expect(stored).toBe(2);
            expect(mockEmbeddingService.storeBatchEmbeddings).toHaveBeenCalled();
        });

        test('should process in batches', async () => {
            mockEmbeddingService.generateBatchEmbeddings.mockResolvedValue(
                Array(20).fill(new Array(1024).fill(0.1))
            );

            const entities = Array(25).fill(null).map((_, i) => ({
                label: 'Entity',
                properties: { quantumId: `e${i}`, name: `Entity${i}` },
            }));

            await worker._generateAndStoreEmbeddings(entities, { projectId: 'test' });

            // Should be called twice: once for 20, once for 5
            expect(mockEmbeddingService.generateBatchEmbeddings).toHaveBeenCalledTimes(2);
        });

        test('should return 0 without embedding service', async () => {
            const noEmbWorker = new StructuringWorker({
                redis: { host: 'localhost' },
                graphService: mockGraphService,
                llmService: mockLLMService,
            });

            const stored = await noEmbWorker._generateAndStoreEmbeddings(
                [{ label: 'Test', properties: { quantumId: 't1' } }],
                { projectId: 'test' }
            );

            expect(stored).toBe(0);
        });
    });

    describe('queue operations', () => {
        test('should add job to queue', async () => {
            const job = await worker.addJob(
                JobType.CODE,
                'const x = 1;',
                { filePath: 'test.ts', projectId: 'proj-1' }
            );

            expect(job.id).toBe('test-job-1');
            expect(worker.queue.add).toHaveBeenCalledWith(
                'structuring:code',
                expect.objectContaining({
                    type: JobType.CODE,
                    content: 'const x = 1;',
                }),
                expect.objectContaining({
                    attempts: 3,
                    backoff: expect.objectContaining({ type: 'exponential' }),
                })
            );
        });

        test('should add batch jobs', async () => {
            const jobs = [
                { type: JobType.CODE, content: 'code1', metadata: { projectId: 'p1' } },
                { type: JobType.WORKITEM, content: { id: 1 }, metadata: { projectId: 'p1' } },
            ];

            const result = await worker.addBatchJobs(jobs);

            expect(result).toHaveLength(2);
            expect(worker.queue.addBulk).toHaveBeenCalled();
        });

        test('should return queue stats', async () => {
            const stats = await worker.getStats();

            expect(stats).toEqual({
                waiting: 5,
                active: 2,
                completed: 100,
                failed: 3,
            });
        });
    });

    describe('helpers', () => {
        test('_isTypeScriptOrJS should match JS/TS files', () => {
            expect(worker._isTypeScriptOrJS('file.ts')).toBe(true);
            expect(worker._isTypeScriptOrJS('file.tsx')).toBe(true);
            expect(worker._isTypeScriptOrJS('file.js')).toBe(true);
            expect(worker._isTypeScriptOrJS('file.jsx')).toBe(true);
            expect(worker._isTypeScriptOrJS('file.mjs')).toBe(true);
            expect(worker._isTypeScriptOrJS('file.cjs')).toBe(true);
            expect(worker._isTypeScriptOrJS('file.py')).toBe(false);
            expect(worker._isTypeScriptOrJS('file.cs')).toBe(false);
        });

        test('_generateQuantumId should create unique IDs', () => {
            const entity = { label: 'Function', properties: { name: 'myFunction' } };

            const id1 = worker._generateQuantumId(entity);
            const id2 = worker._generateQuantumId(entity);

            expect(id1).toMatch(/^function_myfunction_[a-z0-9]+$/);
            expect(id1).not.toBe(id2); // Should be unique
        });

        test('_slugify should create URL-safe slugs', () => {
            expect(worker._slugify('Hello World')).toBe('hello_world');
            expect(worker._slugify('Test@#$123')).toBe('test_123');
            expect(worker._slugify('___leading___')).toBe('leading');
            expect(worker._slugify('A'.repeat(50))).toHaveLength(30);
        });

        test('_selectCollection should return correct collection', () => {
            expect(worker._selectCollection({ label: 'Class' })).toBe('embeddings_code');
            expect(worker._selectCollection({ label: 'Function' })).toBe('embeddings_code');
            expect(worker._selectCollection({ label: 'Method' })).toBe('embeddings_code');
            expect(worker._selectCollection({ label: 'Interface' })).toBe('embeddings_code');
            expect(worker._selectCollection({ label: 'File' })).toBe('embeddings_code');

            expect(worker._selectCollection({ label: 'WorkItem' })).toBe('embeddings_workitems');
            expect(worker._selectCollection({ label: 'Task' })).toBe('embeddings_workitems');
            expect(worker._selectCollection({ label: 'Bug' })).toBe('embeddings_workitems');

            expect(worker._selectCollection({ label: 'Document' })).toBe('embeddings_docs');

            expect(worker._selectCollection({ label: 'Unknown' })).toBe('embeddings_unified');
        });

        test('_getSourceType should return correct source type', () => {
            expect(worker._getSourceType({ label: 'Class' })).toBe('code');
            expect(worker._getSourceType({ label: 'WorkItem' })).toBe('workitem');
            expect(worker._getSourceType({ label: 'Document' })).toBe('document');
            expect(worker._getSourceType({ label: 'Commit' })).toBe('changeset');
            expect(worker._getSourceType({ label: 'Other' })).toBe('other');
        });

        test('_sanitizeProperties should handle various types', () => {
            const props = {
                name: 'test',
                value: undefined,
                count: null,
                nested: { foo: 'bar' },
                array: [1, 2, 3],
                number: 42,
                bool: true,
            };

            const sanitized = worker._sanitizeProperties(props);

            expect(sanitized.name).toBe('test');
            expect(sanitized.value).toBeUndefined();
            expect(sanitized.count).toBeUndefined();
            expect(sanitized.nested).toBe('{"foo":"bar"}');
            expect(sanitized.array).toEqual([1, 2, 3]);
            expect(sanitized.number).toBe(42);
            expect(sanitized.bool).toBe(true);
        });

        test('_entityToEmbeddingText should combine properties', () => {
            const entity = {
                label: 'Function',
                properties: {
                    name: 'calculateTotal',
                    description: 'Calculates the total price',
                    documentation: 'JSDoc comment here',
                },
            };

            const text = worker._entityToEmbeddingText(entity);

            expect(text).toContain('[Function]');
            expect(text).toContain('calculateTotal');
            expect(text).toContain('Calculates the total price');
            expect(text).toContain('JSDoc comment here');
        });

        test('_entityToEmbeddingText should truncate long text', () => {
            const entity = {
                label: 'Document',
                properties: {
                    name: 'Test',
                    description: 'A'.repeat(3000),
                },
            };

            const text = worker._entityToEmbeddingText(entity);

            expect(text.length).toBeLessThanOrEqual(2000);
        });
    });

    describe('job types and stages', () => {
        test('should export JobType enum', () => {
            expect(JobType.CODE).toBe('code');
            expect(JobType.WORKITEM).toBe('workitem');
            expect(JobType.DOCUMENT).toBe('document');
            expect(JobType.CHANGESET).toBe('changeset');
            expect(JobType.BATCH).toBe('batch');
        });

        test('should export Stage enum', () => {
            expect(Stage.INIT).toBe('init');
            expect(Stage.EXTRACTION).toBe('extraction');
            expect(Stage.RESOLUTION).toBe('resolution');
            expect(Stage.GRAPH_PERSIST).toBe('graph_persist');
            expect(Stage.RELATIONSHIPS).toBe('relationships');
            expect(Stage.EMBEDDINGS).toBe('embeddings');
            expect(Stage.COMPLETE).toBe('complete');
            expect(Stage.FAILED).toBe('failed');
        });
    });

    describe('_extract dispatch', () => {
        test('should dispatch to correct extractor', async () => {
            // Spy on extractors
            const codeSpy = jest.spyOn(worker, '_extractFromCode').mockResolvedValue({ entities: [], relationships: [] });
            const workItemSpy = jest.spyOn(worker, '_extractFromWorkItem').mockResolvedValue({ entities: [], relationships: [] });
            const docSpy = jest.spyOn(worker, '_extractFromDocument').mockResolvedValue({ entities: [], relationships: [] });
            const changesetSpy = jest.spyOn(worker, '_extractFromChangeset').mockResolvedValue({ entities: [], relationships: [] });

            await worker._extract(JobType.CODE, 'code', {});
            expect(codeSpy).toHaveBeenCalled();

            await worker._extract(JobType.WORKITEM, {}, {});
            expect(workItemSpy).toHaveBeenCalled();

            await worker._extract(JobType.DOCUMENT, {}, {});
            expect(docSpy).toHaveBeenCalled();

            await worker._extract(JobType.CHANGESET, {}, {});
            expect(changesetSpy).toHaveBeenCalled();
        });

        test('should throw for unknown job type', async () => {
            await expect(worker._extract('unknown', {}, {})).rejects.toThrow('Unknown job type');
        });
    });

    describe('inferred relations', () => {
        test('should compute inferred relations when enabled', async () => {
            const entities = [
                { label: 'Class', properties: { quantumId: 'c1', name: 'UserService' } },
            ];

            // Mock the relation engine
            worker.relationEngine = {
                computeInferredRelations: jest.fn().mockResolvedValue([
                    { sourceId: 'c1', targetId: 'c2', type: 'SIMILAR_TO', properties: {} },
                ]),
                persistInferredRelations: jest.fn().mockResolvedValue({ persisted: 1, skipped: 0 }),
            };

            const count = await worker._computeAndPersistInferredRelations(entities, {
                semanticRelations: true,
            });

            expect(count).toBe(1);
            expect(worker.relationEngine.computeInferredRelations).toHaveBeenCalled();
        });

        test('should return 0 without relation engine', async () => {
            worker.relationEngine = null;

            const count = await worker._computeAndPersistInferredRelations([], {});

            expect(count).toBe(0);
        });

        test('should build enabled methods list from options', () => {
            const allEnabled = worker._getEnabledInferenceMethods({});
            expect(allEnabled).toContain('semantic_similarity');
            expect(allEnabled).toContain('co_occurrence');
            expect(allEnabled).toContain('naming_pattern');
            expect(allEnabled).toContain('structural');
            expect(allEnabled).not.toContain('temporal_proximity');

            const withTemporal = worker._getEnabledInferenceMethods({ temporalRelations: true });
            expect(withTemporal).toContain('temporal_proximity');

            const selective = worker._getEnabledInferenceMethods({
                semanticRelations: false,
                coOccurrenceRelations: false,
            });
            expect(selective).not.toContain('semantic_similarity');
            expect(selective).not.toContain('co_occurrence');
            expect(selective).toContain('naming_pattern');
        });
    });
});
