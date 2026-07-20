const { serializeNode, deserializeNode } = require('../serializers/nodes');

describe('UGP node serialization', () => {
    test('serializes a standard id-keyed node', () => {
        const line = serializeNode({
            labels: ['SourceDocument'],
            properties: { id: 'doc-1', title: 'Report' },
        });
        const obj = deserializeNode(line);
        expect(obj._identity).toEqual({ property: 'id', value: 'doc-1' });
        expect(obj.labels).toEqual(['SourceDocument']);
        expect(obj.props.title).toBe('Report');
        expect(obj.stub).toBe(false);
    });

    test('serializes a per-label-keyed node (GraphDefinition)', () => {
        const line = serializeNode({
            labels: ['GraphDefinition'],
            properties: { graphId: 'g-7', name: 'flow' },
        });
        const obj = deserializeNode(line);
        expect(obj._identity).toEqual({ property: 'graphId', value: 'g-7' });
    });

    test('stub flag is carried', () => {
        const line = serializeNode(
            { labels: ['Entity'], properties: { id: 'e-1' } },
            { stub: true }
        );
        expect(deserializeNode(line).stub).toBe(true);
    });

    test('throws when identity cannot be resolved', () => {
        expect(() =>
            serializeNode({ labels: ['DialogueSegment'], properties: { foo: 'bar' } })
        ).toThrow(/no resolvable identity/);
    });

    test('output is a single JSON line (no newline)', () => {
        const line = serializeNode({ labels: ['Entity'], properties: { id: 'e-1' } });
        expect(line).not.toContain('\n');
    });
});
