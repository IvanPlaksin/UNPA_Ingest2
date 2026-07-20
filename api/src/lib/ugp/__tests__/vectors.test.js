const {
    serializeVectorPoint,
    deserializeVectorPoint,
    toQdrantPoint,
} = require('../serializers/vectors');

describe('UGP vector serialization', () => {
    test('default (single) vector round-trips', () => {
        const line = serializeVectorPoint({
            id: 'p-1',
            vector: [0.1, 0.2, 0.3],
            payload: { memgraphNodeId: 'n-1' },
        });
        const obj = deserializeVectorPoint(line);
        expect(obj.id).toBe('p-1');
        expect(obj.vector).toEqual([0.1, 0.2, 0.3]);
        expect(obj.vectors).toBeUndefined();
        expect(obj.payload.memgraphNodeId).toBe('n-1');
    });

    test('named vectors round-trip (dialogue_embeddings: content+summary)', () => {
        const line = serializeVectorPoint({
            id: 'seg-1',
            vectors: { content: [1, 2], summary: [3, 4] },
            payload: { segmentId: 'seg-1' },
        });
        const obj = deserializeVectorPoint(line);
        expect(obj.vectors).toEqual({ content: [1, 2], summary: [3, 4] });
        expect(obj.vector).toBeUndefined();
    });

    test('integer point id preserved (altiora_knowledge)', () => {
        const line = serializeVectorPoint({ id: 7, vector: [0.5], payload: { articleId: 7 } });
        expect(deserializeVectorPoint(line).id).toBe(7);
    });

    test('payload-only point allowed (MANIFEST_ONLY)', () => {
        const line = serializeVectorPoint({ id: 'p-2', payload: { entityId: 'e-2' } });
        const obj = deserializeVectorPoint(line);
        expect(obj.vector).toBeUndefined();
        expect(obj.vectors).toBeUndefined();
        expect(obj.payload.entityId).toBe('e-2');
    });

    test('throws on missing id', () => {
        expect(() => serializeVectorPoint({ vector: [1] })).toThrow(/missing an id/);
    });

    test('toQdrantPoint normalizes named vs default shape', () => {
        expect(toQdrantPoint({ id: 'a', vector: [1, 2], payload: {} })).toEqual({
            id: 'a',
            vector: [1, 2],
            payload: {},
        });
        expect(
            toQdrantPoint({ id: 'b', vectors: { content: [1], summary: [2] }, payload: { x: 1 } })
        ).toEqual({ id: 'b', vector: { content: [1], summary: [2] }, payload: { x: 1 } });
    });
});
