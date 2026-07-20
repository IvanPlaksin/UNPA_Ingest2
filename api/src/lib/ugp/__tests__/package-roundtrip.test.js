const fs = require('fs');
const os = require('os');
const path = require('path');
const { UGPWriter } = require('../package/writer');
const { UGPReader } = require('../package/reader');
const { buildManifest } = require('../serializers/manifest');
const { serializeNode } = require('../serializers/nodes');
const { serializeRelationship } = require('../serializers/relationships');
const { serializeVectorPoint } = require('../serializers/vectors');

describe('UGP package round-trip', () => {
    let dir;
    let pkgPath;

    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ugp-test-'));
        pkgPath = path.join(dir, 'sample.ugp.tar.gz');
    });

    afterAll(() => {
        try {
            fs.rmSync(dir, { recursive: true, force: true });
        } catch {
            /* ignore */
        }
    });

    test('write → read reproduces manifest, nodes, relationships, vectors', async () => {
        const manifest = buildManifest({
            selectionMode: 'LABELS',
            labels: ['Entity', 'DialogueSegment'],
            selectedCollections: { dialogue_embeddings: true },
            counts: { nodes: 2, relationships: 1, vectorPoints: { dialogue_embeddings: 1 } },
        });

        const w = new UGPWriter(pkgPath);
        await w.open();
        await w.writeManifest(manifest);

        w.writeNode(serializeNode({ labels: ['Entity'], properties: { id: 'e-1', name: 'Alice' } }));
        w.writeNode(
            serializeNode({
                labels: ['DialogueSegment'],
                properties: { segmentId: 'seg-1', sessionId: 'sess-1' },
            })
        );
        await w.finalizeNodes();

        w.writeRelationship(
            serializeRelationship({
                type: 'HAS_SEGMENT',
                startNodeIdentity: { property: 'id', value: 'e-1' },
                endNodeIdentity: { property: 'segmentId', value: 'seg-1' },
                properties: {},
            })
        );
        await w.finalizeRelationships();

        w.writeVectorPoint(
            'dialogue_embeddings',
            serializeVectorPoint({
                id: 'seg-1',
                vectors: { content: [0.1, 0.2], summary: [0.3, 0.4] },
                payload: { segmentId: 'seg-1' },
            })
        );
        await w.finalizeVectors();
        await w.close();

        expect(fs.existsSync(pkgPath)).toBe(true);

        const r = new UGPReader(pkgPath);

        const { manifest: m, valid } = await r.readManifest();
        expect(valid).toBe(true);
        expect(m.selection.labels).toEqual(['Entity', 'DialogueSegment']);
        expect(m.selectedCollections.dialogue_embeddings).toBe(true);

        const nodes = [];
        for await (const n of r.readNodes()) nodes.push(n);
        expect(nodes).toHaveLength(2);
        expect(nodes[0]._identity).toEqual({ property: 'id', value: 'e-1' });
        expect(nodes[1]._identity).toEqual({ property: 'segmentId', value: 'seg-1' });

        const rels = [];
        for await (const rel of r.readRelationships()) rels.push(rel);
        expect(rels).toHaveLength(1);
        expect(rels[0].type).toBe('HAS_SEGMENT');

        const vectors = [];
        for await (const v of r.readVectors()) vectors.push(v);
        expect(vectors).toHaveLength(1);
        expect(vectors[0].collection).toBe('dialogue_embeddings');
        expect(vectors[0].point.vectors).toEqual({ content: [0.1, 0.2], summary: [0.3, 0.4] });

        expect(await r.listVectorCollections()).toEqual(['dialogue_embeddings']);
    });

    test('checksums verify on an intact package', async () => {
        const r = new UGPReader(pkgPath);
        const result = await r.verifyChecksums();
        expect(result).toEqual({ valid: true, errors: [] });
    });

    test('checksum verification fails on a tampered package', async () => {
        // Build a fresh package, then corrupt a byte in the gzip stream.
        const tampered = path.join(dir, 'tampered.ugp.tar.gz');
        const w = new UGPWriter(tampered);
        await w.open();
        await w.writeManifest(
            buildManifest({ selectionMode: 'LABELS', counts: { nodes: 1, relationships: 0 } })
        );
        w.writeNode(serializeNode({ labels: ['Entity'], properties: { id: 'e-9', big: 'x'.repeat(500) } }));
        await w.finalizeNodes();
        await w.finalizeRelationships();
        await w.finalizeVectors();
        await w.close();

        const buf = fs.readFileSync(tampered);
        // Flip a byte in the compressed payload (avoid the gzip header first 16 bytes).
        const idx = Math.floor(buf.length / 2);
        buf[idx] = buf[idx] ^ 0xff;
        fs.writeFileSync(tampered, buf);

        const r = new UGPReader(tampered);
        // Corruption manifests either as a gunzip error or a checksum mismatch —
        // both are acceptable failure signals; neither should report valid=true.
        let failed = false;
        try {
            const result = await r.verifyChecksums();
            failed = !result.valid;
        } catch {
            failed = true;
        }
        expect(failed).toBe(true);
    });
});
