const { EmbeddingService, EmbeddingModels } = require('../EmbeddingService');

// Mock fetch
global.fetch = jest.fn();

// Mock Qdrant
jest.mock('@qdrant/js-client-rest', () => ({
    QdrantClient: jest.fn().mockImplementation(() => ({
        upsert: jest.fn().mockResolvedValue({}),
        search: jest.fn().mockResolvedValue([]),
        retrieve: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({}),
        getCollections: jest.fn().mockResolvedValue({ collections: [] }),
    })),
}));

describe('EmbeddingService', () => {
    let service;

    beforeEach(() => {
        service = new EmbeddingService({
            teiUrl: 'http://localhost:8081',
            qdrantUrl: 'http://localhost:6333',
            enableCache: true,
            maxRetries: 1, // Faster tests
        });
        jest.clearAllMocks();
    });

    describe('generateEmbedding', () => {
        test('should generate embedding for text', async () => {
            const mockVector = new Array(1024).fill(0.1);
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([mockVector]),
            });

            const result = await service.generateEmbedding('test text');

            expect(result).toHaveLength(1024);
            expect(global.fetch).toHaveBeenCalledWith(
                'http://localhost:8081/embed',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ inputs: ['test text'] }),
                })
            );
        });

        test('should use cache on second call', async () => {
            const mockVector = new Array(1024).fill(0.1);
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([mockVector]),
            });

            await service.generateEmbedding('test text');
            const result2 = await service.generateEmbedding('test text');

            expect(global.fetch).toHaveBeenCalledTimes(1); // Only called once due to cache
            expect(result2).toHaveLength(1024);
        });

        test('should throw on empty text', async () => {
            await expect(service.generateEmbedding('')).rejects.toThrow('Text must be a non-empty string');
            await expect(service.generateEmbedding(null)).rejects.toThrow();
        });

        test('should throw on whitespace-only text', async () => {
            await expect(service.generateEmbedding('   ')).rejects.toThrow();
        });

        test('should trim text before processing', async () => {
            const mockVector = new Array(1024).fill(0.1);
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([mockVector]),
            });

            await service.generateEmbedding('  test text  ');

            expect(global.fetch).toHaveBeenCalledWith(
                'http://localhost:8081/embed',
                expect.objectContaining({
                    body: JSON.stringify({ inputs: ['test text'] }),
                })
            );
        });
    });

    describe('generateBatchEmbeddings', () => {
        test('should batch process texts', async () => {
            const mockVectors = [
                new Array(1024).fill(0.1),
                new Array(1024).fill(0.2),
                new Array(1024).fill(0.3),
            ];
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockVectors),
            });

            const texts = ['text1', 'text2', 'text3'];
            const results = await service.generateBatchEmbeddings(texts);

            expect(results).toHaveLength(3);
            expect(results[0]).toHaveLength(1024);
            expect(results[1]).toHaveLength(1024);
            expect(results[2]).toHaveLength(1024);
        });

        test('should handle empty and invalid texts', async () => {
            const mockVectors = [
                new Array(1024).fill(0.1),
                new Array(1024).fill(0.2),
            ];
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockVectors),
            });

            const texts = ['valid', '', null, 'also valid'];
            const results = await service.generateBatchEmbeddings(texts);

            expect(results[0]).not.toBeNull();
            expect(results[1]).toBeNull();
            expect(results[2]).toBeNull();
            expect(results[3]).not.toBeNull();
        });

        test('should return empty array for empty input', async () => {
            const results = await service.generateBatchEmbeddings([]);
            expect(results).toEqual([]);
        });

        test('should use cache for repeated texts', async () => {
            const mockVectors = [new Array(1024).fill(0.1)];
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockVectors),
            });

            // First call
            await service.generateBatchEmbeddings(['same text']);

            // Second call with same text - should use cache
            const results = await service.generateBatchEmbeddings(['same text', 'same text']);

            expect(global.fetch).toHaveBeenCalledTimes(1);
            expect(results[0]).toHaveLength(1024);
            expect(results[1]).toHaveLength(1024);
        });
    });

    describe('generateEntityEmbedding', () => {
        test('should generate embedding from entity', async () => {
            const mockVector = new Array(1024).fill(0.1);
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([mockVector]),
            });

            const entity = {
                label: 'Function',
                properties: {
                    name: 'calculateTotal',
                    description: 'Calculates the total price',
                    parameters: [{ name: 'items', type: 'Array' }],
                    returnType: 'number',
                }
            };

            const result = await service.generateEntityEmbedding(entity);

            expect(result).toHaveLength(1024);

            // Check that the text was properly constructed
            const callArgs = JSON.parse(global.fetch.mock.calls[0][1].body);
            expect(callArgs.inputs[0]).toContain('[Function]');
            expect(callArgs.inputs[0]).toContain('calculateTotal');
            expect(callArgs.inputs[0]).toContain('Calculates the total price');
        });
    });

    describe('cosineSimilarity', () => {
        test('should calculate correct similarity for identical vectors', () => {
            const vec1 = [1, 0, 0];
            const vec2 = [1, 0, 0];
            expect(service.cosineSimilarity(vec1, vec2)).toBeCloseTo(1.0);
        });

        test('should calculate correct similarity for orthogonal vectors', () => {
            const vec3 = [1, 0, 0];
            const vec4 = [0, 1, 0];
            expect(service.cosineSimilarity(vec3, vec4)).toBeCloseTo(0.0);
        });

        test('should calculate correct similarity for similar vectors', () => {
            const vec5 = [1, 1, 0];
            const vec6 = [1, 0, 0];
            expect(service.cosineSimilarity(vec5, vec6)).toBeCloseTo(0.707, 2);
        });

        test('should handle edge cases', () => {
            expect(service.cosineSimilarity(null, [1, 2])).toBe(0);
            expect(service.cosineSimilarity([1, 2], null)).toBe(0);
            expect(service.cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
            expect(service.cosineSimilarity([], [])).toBe(0);
        });

        test('should handle zero vectors', () => {
            expect(service.cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
        });
    });

    describe('_toQdrantId', () => {
        test('should handle integer IDs', () => {
            expect(service._toQdrantId(123)).toBe(123);
            expect(service._toQdrantId(0)).toBe(0);
        });

        test('should pass through valid UUIDs', () => {
            const uuid = '550e8400-e29b-41d4-a716-446655440000';
            expect(service._toQdrantId(uuid)).toBe(uuid);
        });

        test('should convert string IDs to UUID format', () => {
            const stringId = service._toQdrantId('my-custom-id');
            expect(stringId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        });

        test('should be deterministic', () => {
            const id1 = service._toQdrantId('test-id');
            const id2 = service._toQdrantId('test-id');
            expect(id1).toBe(id2);
        });

        test('should produce different IDs for different strings', () => {
            const id1 = service._toQdrantId('test-id-1');
            const id2 = service._toQdrantId('test-id-2');
            expect(id1).not.toBe(id2);
        });
    });

    describe('_entityToEmbeddingText', () => {
        test('should combine entity properties', () => {
            const entity = {
                label: 'Method',
                properties: {
                    name: 'getUser',
                    description: 'Gets a user by ID',
                    parameters: [{ name: 'id', type: 'string' }],
                    returnType: 'User',
                    synonyms: ['fetchUser', 'retrieveUser'],
                }
            };

            const text = service._entityToEmbeddingText(entity);

            expect(text).toContain('[Method]');
            expect(text).toContain('getUser');
            expect(text).toContain('Gets a user by ID');
            expect(text).toContain('Parameters: id: string');
            expect(text).toContain('Returns: User');
            expect(text).toContain('Also known as: fetchUser, retrieveUser');
        });

        test('should handle missing properties', () => {
            const entity = {
                label: 'Concept',
                properties: {
                    name: 'TestConcept'
                }
            };

            const text = service._entityToEmbeddingText(entity);

            expect(text).toContain('[Concept]');
            expect(text).toContain('TestConcept');
            expect(text).not.toContain('Parameters');
            expect(text).not.toContain('Returns');
        });

        test('should use definition if no description', () => {
            const entity = {
                label: 'Term',
                properties: {
                    name: 'APV',
                    definition: 'Annual Purchase Volume'
                }
            };

            const text = service._entityToEmbeddingText(entity);
            expect(text).toContain('Annual Purchase Volume');
        });

        test('should handle null entity', () => {
            const text = service._entityToEmbeddingText(null);
            expect(text).toBe('');
        });
    });

    describe('storeEmbedding', () => {
        test('should store embedding in Qdrant', async () => {
            const vector = new Array(1024).fill(0.1);
            const payload = { type: 'test', name: 'testEntity' };

            await service.storeEmbedding('test_collection', 'entity-1', vector, payload);

            expect(service.qdrant.upsert).toHaveBeenCalledWith('test_collection', {
                wait: true,
                points: [{
                    id: expect.any(String),
                    vector,
                    payload: expect.objectContaining({
                        type: 'test',
                        name: 'testEntity',
                        _originalId: 'entity-1',
                        _storedAt: expect.any(String),
                    }),
                }],
            });
        });
    });

    describe('storeBatchEmbeddings', () => {
        test('should store multiple embeddings', async () => {
            const points = [
                { id: 'e1', vector: new Array(1024).fill(0.1), payload: { name: 'entity1' } },
                { id: 'e2', vector: new Array(1024).fill(0.2), payload: { name: 'entity2' } },
            ];

            await service.storeBatchEmbeddings('test_collection', points);

            expect(service.qdrant.upsert).toHaveBeenCalledTimes(1);
        });

        test('should handle empty array', async () => {
            await service.storeBatchEmbeddings('test_collection', []);
            expect(service.qdrant.upsert).not.toHaveBeenCalled();
        });

        test('should filter out points without vectors', async () => {
            const points = [
                { id: 'e1', vector: new Array(1024).fill(0.1), payload: {} },
                { id: 'e2', vector: null, payload: {} },
                { id: 'e3', vector: new Array(1024).fill(0.3), payload: {} },
            ];

            await service.storeBatchEmbeddings('test_collection', points);

            const upsertCall = service.qdrant.upsert.mock.calls[0];
            expect(upsertCall[1].points).toHaveLength(2);
        });
    });

    describe('searchSimilar', () => {
        test('should search with default options', async () => {
            const vector = new Array(1024).fill(0.1);
            service.qdrant.search.mockResolvedValueOnce([
                { id: 1, score: 0.95, payload: { _originalId: 'e1', name: 'result1' } },
            ]);

            const results = await service.searchSimilar('test_collection', vector);

            expect(service.qdrant.search).toHaveBeenCalledWith('test_collection', expect.objectContaining({
                vector,
                limit: 10,
                with_payload: true,
            }));
            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('e1');
            expect(results[0].score).toBe(0.95);
        });

        test('should handle excludeIds option', async () => {
            const vector = new Array(1024).fill(0.1);
            service.qdrant.search.mockResolvedValueOnce([]);

            await service.searchSimilar('test_collection', vector, {
                excludeIds: ['exclude-1', 'exclude-2'],
            });

            expect(service.qdrant.search).toHaveBeenCalledWith('test_collection', expect.objectContaining({
                filter: expect.objectContaining({
                    must_not: expect.any(Array),
                }),
            }));
        });
    });

    describe('searchByText', () => {
        test('should generate embedding and search', async () => {
            const mockVector = new Array(1024).fill(0.1);
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve([mockVector]),
            });
            service.qdrant.search.mockResolvedValueOnce([]);

            await service.searchByText('test_collection', 'search query');

            expect(global.fetch).toHaveBeenCalled();
            expect(service.qdrant.search).toHaveBeenCalled();
        });
    });

    describe('cache management', () => {
        test('should evict oldest entry when cache is full', async () => {
            // Clear mocks for this specific test
            global.fetch.mockReset();

            const smallCacheService = new EmbeddingService({
                enableCache: true,
                cacheMaxSize: 2,
                maxRetries: 1,
            });

            global.fetch
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([new Array(1024).fill(0.1)]) })
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([new Array(1024).fill(0.2)]) })
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([new Array(1024).fill(0.3)]) })
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([new Array(1024).fill(0.4)]) });

            await smallCacheService.generateEmbedding('text1');
            await smallCacheService.generateEmbedding('text2');
            await smallCacheService.generateEmbedding('text3');

            // text1 should have been evicted
            await smallCacheService.generateEmbedding('text1');

            expect(global.fetch).toHaveBeenCalledTimes(4); // text1 was called twice
        });

        test('should clear cache', async () => {
            const mockVector = new Array(1024).fill(0.1);
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve([mockVector]),
            });

            await service.generateEmbedding('test');
            service.clearCache();
            await service.generateEmbedding('test');

            expect(global.fetch).toHaveBeenCalledTimes(2);
        });
    });

    describe('getInfo', () => {
        test('should return service configuration', () => {
            const info = service.getInfo();

            expect(info.teiUrl).toBe('http://localhost:8081');
            expect(info.qdrantUrl).toBe('http://localhost:6333');
            expect(info.dimension).toBe(1024);
            expect(info.cacheEnabled).toBe(true);
        });
    });

    describe('EmbeddingModels', () => {
        test('should have model configurations', () => {
            expect(EmbeddingModels['bge-large']).toEqual({ dimension: 1024, maxTokens: 512 });
            expect(EmbeddingModels['nomic-embed']).toEqual({ dimension: 768, maxTokens: 8192 });
        });
    });
});
