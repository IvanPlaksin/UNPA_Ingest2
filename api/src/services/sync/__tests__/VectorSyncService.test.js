const { VectorSyncService, SyncStatus, SyncOperation } = require('../VectorSyncService');

const mockGraphService = {
    query: jest.fn().mockResolvedValue([]),
};

const mockEmbeddingService = {
    generateEmbedding: jest.fn().mockResolvedValue(new Array(1024).fill(0.1)),
    generateBatchEmbeddings: jest.fn().mockResolvedValue([]),
    storeEmbedding: jest.fn().mockResolvedValue({}),
    storeBatchEmbeddings: jest.fn().mockResolvedValue({}),
    getVector: jest.fn().mockResolvedValue(null),
    deleteVector: jest.fn().mockResolvedValue({}),
    qdrant: {
        scroll: jest.fn().mockResolvedValue({ points: [], next_page_offset: null }),
        delete: jest.fn().mockResolvedValue({}),
        getCollection: jest.fn().mockResolvedValue({ points_count: 100, vectors_count: 100, status: 'green' }),
    },
};

describe('VectorSyncService', () => {
    let service;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new VectorSyncService(mockGraphService, mockEmbeddingService);
    });

    describe('constructor', () => {
        test('should initialize with default config', () => {
            expect(service.config.batchSize).toBe(50);
            expect(service.config.embeddingBatchSize).toBe(20);
            expect(service.config.syncIntervalMs).toBe(60000);
            expect(service.config.collections).toHaveLength(4);
        });

        test('should accept custom config', () => {
            const customService = new VectorSyncService(mockGraphService, mockEmbeddingService, {
                batchSize: 100,
                syncIntervalMs: 30000,
            });

            expect(customService.config.batchSize).toBe(100);
            expect(customService.config.syncIntervalMs).toBe(30000);
        });

        test('should start with no sync interval', () => {
            expect(service.syncInterval).toBeNull();
            expect(service.isSyncing).toBe(false);
        });
    });

    describe('syncGraphToVector', () => {
        test('should sync nodes without embeddings', async () => {
            mockGraphService.query
                .mockResolvedValueOnce([ // Query for missing embeddings
                    { quantumId: 'node-1', name: 'Test1', label: 'Class', projectId: 'proj-1' },
                    { quantumId: 'node-2', name: 'Test2', label: 'Function', projectId: 'proj-1' },
                ])
                .mockResolvedValue([]); // Mark as synced queries

            mockEmbeddingService.generateBatchEmbeddings.mockResolvedValue([
                new Array(1024).fill(0.1),
                new Array(1024).fill(0.2),
            ]);

            const result = await service.syncGraphToVector();

            expect(result.processed).toBe(2);
            expect(result.created).toBe(2);
            expect(result.operation).toBe('graph_to_vector');
            expect(result.startedAt).toBeDefined();
            expect(result.completedAt).toBeDefined();
            expect(mockEmbeddingService.storeBatchEmbeddings).toHaveBeenCalled();
        });

        test('should handle empty result', async () => {
            mockGraphService.query.mockResolvedValue([]);

            const result = await service.syncGraphToVector();

            expect(result.processed).toBe(0);
            expect(result.created).toBe(0);
            expect(result.errors).toHaveLength(0);
        });

        test('should process in batches', async () => {
            // Create 25 nodes (more than batch size of 20)
            const nodes = Array(25).fill(null).map((_, i) => ({
                quantumId: `node-${i}`,
                name: `Test${i}`,
                label: 'Class',
            }));

            mockGraphService.query.mockResolvedValueOnce(nodes).mockResolvedValue([]);

            mockEmbeddingService.generateBatchEmbeddings
                .mockResolvedValueOnce(Array(20).fill(new Array(1024).fill(0.1)))
                .mockResolvedValueOnce(Array(5).fill(new Array(1024).fill(0.2)));

            const result = await service.syncGraphToVector();

            expect(result.processed).toBe(25);
            expect(mockEmbeddingService.generateBatchEmbeddings).toHaveBeenCalledTimes(2);
        });

        test('should handle batch errors gracefully', async () => {
            mockGraphService.query.mockResolvedValueOnce([
                { quantumId: 'node-1', name: 'Test1', label: 'Class' },
            ]);

            mockEmbeddingService.generateBatchEmbeddings.mockRejectedValueOnce(new Error('Embedding failed'));

            const result = await service.syncGraphToVector();

            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].error).toBe('Embedding failed');
        });

        test('should filter by projectId', async () => {
            mockGraphService.query.mockResolvedValue([]);

            await service.syncGraphToVector({ projectId: 'test-project' });

            const query = mockGraphService.query.mock.calls[0][0];
            expect(query).toContain('n.projectId = $projectId');
        });

        test('should skip embedding filter when forceUpdate is true', async () => {
            mockGraphService.query.mockResolvedValue([]);

            await service.syncGraphToVector({ forceUpdate: true });

            const query = mockGraphService.query.mock.calls[0][0];
            expect(query).not.toContain('hasEmbedding IS NULL OR n.hasEmbedding = false');
        });
    });

    describe('cleanOrphanVectors', () => {
        test('should find and delete orphan vectors', async () => {
            mockEmbeddingService.qdrant.scroll.mockResolvedValue({
                points: [
                    { id: 'uuid-1', payload: { _originalId: 'orphan-1' } },
                    { id: 'uuid-2', payload: { _originalId: 'exists-1' } },
                ],
                next_page_offset: null,
            });

            // orphan-1 doesn't exist, exists-1 does
            mockGraphService.query
                .mockResolvedValueOnce([{ count: 0 }]) // orphan-1
                .mockResolvedValueOnce([{ count: 1 }]); // exists-1

            const result = await service.cleanOrphanVectors({ dryRun: false });

            expect(result.scanned).toBe(2);
            expect(result.orphansFound).toBe(1);
            expect(result.deleted).toBe(1);
            expect(mockEmbeddingService.qdrant.delete).toHaveBeenCalledWith(
                'embeddings_unified',
                expect.objectContaining({
                    points: ['uuid-1'],
                })
            );
        });

        test('should not delete in dry-run mode', async () => {
            mockEmbeddingService.qdrant.scroll.mockResolvedValue({
                points: [{ id: 'uuid-1', payload: { _originalId: 'orphan-1' } }],
                next_page_offset: null,
            });

            mockGraphService.query.mockResolvedValueOnce([{ count: 0 }]);

            const result = await service.cleanOrphanVectors({ dryRun: true });

            expect(result.orphansFound).toBe(1);
            expect(result.deleted).toBe(0);
            expect(mockEmbeddingService.qdrant.delete).not.toHaveBeenCalled();
        });

        test('should use quantum_id as fallback', async () => {
            mockEmbeddingService.qdrant.scroll.mockResolvedValue({
                points: [{ id: 'uuid-1', payload: { quantum_id: 'quantum-1' } }],
                next_page_offset: null,
            });

            mockGraphService.query.mockResolvedValueOnce([{ count: 1 }]);

            const result = await service.cleanOrphanVectors();

            expect(result.scanned).toBe(1);
            expect(result.orphansFound).toBe(0);
        });

        test('should handle pagination', async () => {
            mockEmbeddingService.qdrant.scroll
                .mockResolvedValueOnce({
                    points: [{ id: 'uuid-1', payload: { _originalId: 'node-1' } }],
                    next_page_offset: 'offset-1',
                })
                .mockResolvedValueOnce({
                    points: [{ id: 'uuid-2', payload: { _originalId: 'node-2' } }],
                    next_page_offset: null,
                });

            mockGraphService.query.mockResolvedValue([{ count: 1 }]);

            const result = await service.cleanOrphanVectors({ limit: 100 });

            expect(result.scanned).toBe(2);
            expect(mockEmbeddingService.qdrant.scroll).toHaveBeenCalledTimes(2);
        });

        test('should respect limit', async () => {
            mockEmbeddingService.qdrant.scroll.mockResolvedValue({
                points: Array(50).fill({ id: 'uuid', payload: { _originalId: 'node' } }),
                next_page_offset: 'more',
            });

            mockGraphService.query.mockResolvedValue([{ count: 1 }]);

            const result = await service.cleanOrphanVectors({ limit: 50 });

            expect(result.scanned).toBe(50);
            expect(mockEmbeddingService.qdrant.scroll).toHaveBeenCalledTimes(1);
        });
    });

    describe('fullResync', () => {
        test('should perform full resync', async () => {
            mockGraphService.query.mockResolvedValue([]);
            mockEmbeddingService.qdrant.scroll.mockResolvedValue({ points: [], next_page_offset: null });

            const result = await service.fullResync();

            expect(result.operation).toBe('full_resync');
            expect(result.graphToVector).toBeDefined();
            expect(result.orphanCleanup).toBeDefined();
            expect(Object.keys(result.orphanCleanup)).toHaveLength(4); // 4 collections
        });

        test('should skip orphan cleanup when disabled', async () => {
            mockGraphService.query.mockResolvedValue([]);

            const result = await service.fullResync({ cleanOrphans: false });

            expect(result.orphanCleanup).toBeNull();
        });
    });

    describe('syncEntity', () => {
        test('should sync individual entity', async () => {
            mockGraphService.query.mockResolvedValue([{
                n: { quantumId: 'entity-1', name: 'Test', hasEmbedding: false, projectId: 'proj-1' },
                labels: ['Class'],
            }]);

            const result = await service.syncEntity('entity-1');

            expect(result.status).toBe(SyncStatus.SYNCED);
            expect(result.updated).toBe(true);
            expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalled();
            expect(mockEmbeddingService.storeEmbedding).toHaveBeenCalledTimes(2); // collection + unified
        });

        test('should skip already synced entity', async () => {
            const recentDate = new Date().toISOString();
            mockGraphService.query.mockResolvedValue([{
                n: { quantumId: 'entity-1', hasEmbedding: true, embeddingUpdatedAt: recentDate },
                labels: ['Class'],
            }]);

            const result = await service.syncEntity('entity-1');

            expect(result.status).toBe(SyncStatus.SYNCED);
            expect(result.updated).toBe(false);
            expect(mockEmbeddingService.generateEmbedding).not.toHaveBeenCalled();
        });

        test('should force update when option set', async () => {
            const recentDate = new Date().toISOString();
            mockGraphService.query.mockResolvedValue([{
                n: { quantumId: 'entity-1', hasEmbedding: true, embeddingUpdatedAt: recentDate },
                labels: ['Class'],
            }]);

            const result = await service.syncEntity('entity-1', { forceUpdate: true });

            expect(result.updated).toBe(true);
            expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalled();
        });

        test('should throw for non-existent entity', async () => {
            mockGraphService.query.mockResolvedValue([]);

            await expect(service.syncEntity('non-existent')).rejects.toThrow('Entity not found');
        });

        test('should update stale embeddings', async () => {
            // Embedding older than 24 hours
            const staleDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
            mockGraphService.query.mockResolvedValue([{
                n: { quantumId: 'entity-1', hasEmbedding: true, embeddingUpdatedAt: staleDate },
                labels: ['Class'],
            }]);

            const result = await service.syncEntity('entity-1');

            expect(result.updated).toBe(true);
        });
    });

    describe('deleteEntityVectors', () => {
        test('should delete from all collections', async () => {
            await service.deleteEntityVectors('entity-1');

            expect(mockEmbeddingService.deleteVector).toHaveBeenCalledTimes(4);
        });

        test('should handle delete errors gracefully', async () => {
            mockEmbeddingService.deleteVector.mockRejectedValueOnce(new Error('Delete failed'));

            await expect(service.deleteEntityVectors('entity-1')).resolves.not.toThrow();
        });
    });

    describe('checkSyncStatus', () => {
        test('should return SYNCED for fully synced entity', async () => {
            mockGraphService.query.mockResolvedValue([{
                n: { quantumId: 'test-1', hasEmbedding: true },
                labels: ['Class'],
            }]);

            mockEmbeddingService.getVector.mockResolvedValue(new Array(1024).fill(0.1));

            const status = await service.checkSyncStatus('test-1');

            expect(status.status).toBe(SyncStatus.SYNCED);
            expect(status.graphExists).toBe(true);
            expect(Object.values(status.vectorExists).some(v => v)).toBe(true);
        });

        test('should return MISSING_EMBEDDING for node without vector', async () => {
            mockGraphService.query.mockResolvedValue([{
                n: { quantumId: 'test-1', hasEmbedding: false },
                labels: ['Class'],
            }]);

            mockEmbeddingService.getVector.mockResolvedValue(null);

            const status = await service.checkSyncStatus('test-1');

            expect(status.status).toBe(SyncStatus.MISSING_EMBEDDING);
        });

        test('should return ORPHAN_VECTOR for vector without node', async () => {
            mockGraphService.query.mockResolvedValue([]);
            mockEmbeddingService.getVector.mockResolvedValue(new Array(1024).fill(0.1));

            const status = await service.checkSyncStatus('orphan-1');

            expect(status.status).toBe(SyncStatus.ORPHAN_VECTOR);
        });

        test('should return STALE for outdated embedding', async () => {
            const staleDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
            mockGraphService.query.mockResolvedValue([{
                n: { quantumId: 'test-1', hasEmbedding: true, embeddingUpdatedAt: staleDate },
                labels: ['Class'],
            }]);

            mockEmbeddingService.getVector.mockResolvedValue(new Array(1024).fill(0.1));

            const status = await service.checkSyncStatus('test-1');

            expect(status.status).toBe(SyncStatus.STALE);
        });

        test('should include details in result', async () => {
            mockGraphService.query.mockResolvedValue([{
                n: { quantumId: 'test-1', hasEmbedding: true, embeddingUpdatedAt: new Date().toISOString() },
                labels: ['Function'],
            }]);

            const status = await service.checkSyncStatus('test-1');

            expect(status.details.label).toBe('Function');
            expect(status.details.hasEmbeddingFlag).toBe(true);
        });
    });

    describe('getHealthReport', () => {
        test('should return healthy report when sync > 95%', async () => {
            mockGraphService.query.mockResolvedValue([{
                total: 100,
                withEmbedding: 98,
                withoutEmbedding: 2,
            }]);

            const report = await service.getHealthReport();

            expect(report.graph.totalNodes).toBe(100);
            expect(report.graph.withEmbedding).toBe(98);
            expect(report.syncHealth).toBe('healthy');
            expect(parseFloat(report.syncPercentage)).toBe(98);
        });

        test('should report degraded health between 80-95%', async () => {
            mockGraphService.query.mockResolvedValue([{
                total: 100,
                withEmbedding: 85,
                withoutEmbedding: 15,
            }]);

            const report = await service.getHealthReport();

            expect(report.syncHealth).toBe('degraded');
        });

        test('should report unhealthy when sync < 80%', async () => {
            mockGraphService.query.mockResolvedValue([{
                total: 100,
                withEmbedding: 50,
                withoutEmbedding: 50,
            }]);

            const report = await service.getHealthReport();

            expect(report.syncHealth).toBe('unhealthy');
        });

        test('should include vector collection stats', async () => {
            mockGraphService.query.mockResolvedValue([{
                total: 100,
                withEmbedding: 100,
                withoutEmbedding: 0,
            }]);

            const report = await service.getHealthReport();

            expect(report.vector).toBeDefined();
            expect(Object.keys(report.vector)).toHaveLength(4);
            expect(report.vector['embeddings_code'].pointsCount).toBe(100);
        });

        test('should handle collection errors', async () => {
            mockGraphService.query.mockResolvedValue([{ total: 0, withEmbedding: 0, withoutEmbedding: 0 }]);
            mockEmbeddingService.qdrant.getCollection.mockRejectedValueOnce(new Error('Collection error'));

            const report = await service.getHealthReport();

            expect(report.vector['embeddings_code'].error).toBe('Collection error');
        });

        test('should report healthy for empty graph', async () => {
            mockGraphService.query.mockResolvedValue([{
                total: 0,
                withEmbedding: 0,
                withoutEmbedding: 0,
            }]);

            const report = await service.getHealthReport();

            expect(report.syncHealth).toBe('healthy');
            expect(report.syncPercentage).toBe('100.00');
        });
    });

    describe('auto sync', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            service.stopAutoSync();
            jest.useRealTimers();
        });

        test('should start auto sync', () => {
            service.startAutoSync();

            expect(service.syncInterval).not.toBeNull();
        });

        test('should stop auto sync', () => {
            service.startAutoSync();
            service.stopAutoSync();

            expect(service.syncInterval).toBeNull();
        });

        test('should not start if already running', () => {
            service.startAutoSync();
            const interval = service.syncInterval;

            service.startAutoSync();

            expect(service.syncInterval).toBe(interval);
        });

        test('should skip sync if already syncing', async () => {
            service.isSyncing = true;
            service.startAutoSync();

            jest.advanceTimersByTime(60000);

            expect(mockGraphService.query).not.toHaveBeenCalled();
        });
    });

    describe('collection selection', () => {
        test('should select correct collection for entity type', () => {
            expect(service._selectCollection({ label: 'Class' })).toBe('embeddings_code');
            expect(service._selectCollection({ label: 'Function' })).toBe('embeddings_code');
            expect(service._selectCollection({ label: 'Method' })).toBe('embeddings_code');
            expect(service._selectCollection({ label: 'Interface' })).toBe('embeddings_code');
            expect(service._selectCollection({ label: 'File' })).toBe('embeddings_code');

            expect(service._selectCollection({ label: 'WorkItem' })).toBe('embeddings_workitems');
            expect(service._selectCollection({ label: 'Task' })).toBe('embeddings_workitems');
            expect(service._selectCollection({ label: 'Bug' })).toBe('embeddings_workitems');
            expect(service._selectCollection({ label: 'Feature' })).toBe('embeddings_workitems');

            expect(service._selectCollection({ label: 'Document' })).toBe('embeddings_docs');

            expect(service._selectCollection({ label: 'BusinessRule' })).toBe('embeddings_unified');
            expect(service._selectCollection({ label: 'Unknown' })).toBe('embeddings_unified');
        });

        test('_shouldStoreIn should filter correctly', () => {
            expect(service._shouldStoreIn('embeddings_code', 'Class')).toBe(true);
            expect(service._shouldStoreIn('embeddings_code', 'WorkItem')).toBe(false);

            expect(service._shouldStoreIn('embeddings_workitems', 'WorkItem')).toBe(true);
            expect(service._shouldStoreIn('embeddings_workitems', 'UserStory')).toBe(true);
            expect(service._shouldStoreIn('embeddings_workitems', 'Class')).toBe(false);

            expect(service._shouldStoreIn('embeddings_docs', 'Document')).toBe(true);
            expect(service._shouldStoreIn('embeddings_docs', 'Class')).toBe(false);

            expect(service._shouldStoreIn('embeddings_unified', 'Anything')).toBe(true);
        });
    });

    describe('helper methods', () => {
        test('_entityToText should combine entity properties', () => {
            const entity = {
                label: 'Function',
                name: 'calculateTotal',
                description: 'Calculates total',
                definition: 'Sum of items',
                documentation: 'JSDoc here',
            };

            const text = service._entityToText(entity);

            expect(text).toContain('[Function]');
            expect(text).toContain('calculateTotal');
            expect(text).toContain('Calculates total');
        });

        test('_entityToText should truncate long text', () => {
            const entity = {
                label: 'Document',
                name: 'Test',
                description: 'A'.repeat(3000),
            };

            const text = service._entityToText(entity);

            expect(text.length).toBeLessThanOrEqual(2000);
        });

        test('_isStale should detect old embeddings', () => {
            expect(service._isStale(null)).toBe(true);
            expect(service._isStale(undefined)).toBe(true);

            const fresh = new Date().toISOString();
            expect(service._isStale(fresh)).toBe(false);

            const stale = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
            expect(service._isStale(stale)).toBe(true);
        });

        test('_chunkArray should split array into chunks', () => {
            const arr = [1, 2, 3, 4, 5];
            const chunks = service._chunkArray(arr, 2);

            expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
        });

        test('_chunkArray should handle empty array', () => {
            expect(service._chunkArray([], 10)).toEqual([]);
        });

        test('_buildMissingEmbeddingsQuery should build correct query', () => {
            // Default query
            const defaultQuery = service._buildMissingEmbeddingsQuery(null, null, false);
            expect(defaultQuery).toContain('hasEmbedding IS NULL OR n.hasEmbedding = false');
            expect(defaultQuery).not.toContain('n.projectId = $projectId');

            // With projectId
            const withProjectQuery = service._buildMissingEmbeddingsQuery('proj-1', null, false);
            expect(withProjectQuery).toContain('n.projectId = $projectId');

            // With forceUpdate
            const forceQuery = service._buildMissingEmbeddingsQuery(null, null, true);
            expect(forceQuery).not.toContain('hasEmbedding IS NULL');

            // With nodeLabels
            const withLabelsQuery = service._buildMissingEmbeddingsQuery(null, ['Class', 'Function'], false);
            expect(withLabelsQuery).toContain("'Class'");
            expect(withLabelsQuery).toContain("'Function'");
        });
    });

    describe('SyncStatus enum', () => {
        test('should have all status values', () => {
            expect(SyncStatus.SYNCED).toBe('synced');
            expect(SyncStatus.MISSING_EMBEDDING).toBe('missing_embedding');
            expect(SyncStatus.ORPHAN_VECTOR).toBe('orphan_vector');
            expect(SyncStatus.STALE).toBe('stale');
            expect(SyncStatus.ERROR).toBe('error');
        });
    });

    describe('SyncOperation enum', () => {
        test('should have all operation values', () => {
            expect(SyncOperation.CREATE_EMBEDDING).toBe('create_embedding');
            expect(SyncOperation.UPDATE_EMBEDDING).toBe('update_embedding');
            expect(SyncOperation.DELETE_VECTOR).toBe('delete_vector');
            expect(SyncOperation.MARK_SYNCED).toBe('mark_synced');
        });
    });
});
