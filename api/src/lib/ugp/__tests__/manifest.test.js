const { buildManifest, parseManifest, validateManifest } = require('../serializers/manifest');

describe('UGP manifest', () => {
    test('buildManifest fills defaults', () => {
        const m = buildManifest({ selectionMode: 'NAMESPACE', createdAt: '2026-07-17T00:00:00Z' });
        expect(m.ugpVersion).toBe('1.0');
        expect(m.boundaryPolicy).toBe('STUB');
        expect(m.vectorPolicy).toBe('EMBED_POINTS');
        expect(m.selection.mode).toBe('NAMESPACE');
        expect(m.counts.nodes).toBe(0);
        expect(m.containsExecutableGraphs).toBe(false);
    });

    test('per-collection selection is carried', () => {
        const m = buildManifest({
            selectionMode: 'LABELS',
            selectedCollections: { documents_entities: true, flowdesk_services: false },
        });
        expect(m.selectedCollections).toEqual({
            documents_entities: true,
            flowdesk_services: false,
        });
    });

    test('valid manifest passes validation', () => {
        const m = buildManifest({
            selectionMode: 'CYPHER',
            cypher: 'MATCH (n) RETURN n',
            counts: { nodes: 5, relationships: 2 },
        });
        expect(validateManifest(m)).toEqual({ valid: true, errors: [] });
    });

    test('round-trips through JSON', () => {
        const m = buildManifest({ selectionMode: 'NAMESPACE', counts: { nodes: 1, relationships: 0 } });
        const revived = parseManifest(JSON.stringify(m));
        expect(validateManifest(revived).valid).toBe(true);
    });

    test('invalid manifests are reported', () => {
        expect(validateManifest({}).valid).toBe(false);

        const badMode = buildManifest({ selectionMode: 'WRONG' });
        const r1 = validateManifest(badMode);
        expect(r1.valid).toBe(false);
        expect(r1.errors.join(' ')).toMatch(/selection.mode/);

        const badBoundary = buildManifest({ selectionMode: 'LABELS', boundaryPolicy: 'NOPE' });
        const r2 = validateManifest(badBoundary);
        expect(r2.valid).toBe(false);
        expect(r2.errors.join(' ')).toMatch(/boundaryPolicy/);
    });

    test('missing counts flagged', () => {
        const m = buildManifest({ selectionMode: 'LABELS' });
        delete m.counts.nodes;
        expect(validateManifest(m).valid).toBe(false);
    });
});
