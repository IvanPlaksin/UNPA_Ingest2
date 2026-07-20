const {
    serializeRelationship,
    deserializeRelationship,
} = require('../serializers/relationships');

describe('UGP relationship serialization', () => {
    test('serializes with endpoint identities', () => {
        const line = serializeRelationship({
            type: 'HAS_DOCUMENT',
            startNodeIdentity: { property: 'id', value: 'src-1' },
            endNodeIdentity: { property: 'id', value: 'doc-1' },
            properties: { weight: 1 },
        });
        const obj = deserializeRelationship(line);
        expect(obj.type).toBe('HAS_DOCUMENT');
        expect(obj.from).toEqual({ property: 'id', value: 'src-1' });
        expect(obj.to).toEqual({ property: 'id', value: 'doc-1' });
        expect(obj.props.weight).toBe(1);
    });

    test('defaults props to empty object', () => {
        const line = serializeRelationship({
            type: 'RELATED_TO',
            startNodeIdentity: { property: 'id', value: 'a' },
            endNodeIdentity: { property: 'segmentId', value: 'b' },
        });
        expect(deserializeRelationship(line).props).toEqual({});
    });

    test('throws on missing type', () => {
        expect(() =>
            serializeRelationship({
                startNodeIdentity: { property: 'id', value: 'a' },
                endNodeIdentity: { property: 'id', value: 'b' },
            })
        ).toThrow(/missing a type/);
    });

    test('throws on missing endpoint identity', () => {
        expect(() =>
            serializeRelationship({
                type: 'RELATED_TO',
                startNodeIdentity: { property: 'id', value: 'a' },
            })
        ).toThrow(/missing an endpoint identity/);
    });
});
