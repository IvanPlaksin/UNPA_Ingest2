'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');

// Resolve the real UGP lib the same way the adapter does (repo fallback in tests).
const ugp = require('../src/lib/ugp-adapter');

// ── Mock the target connections. Memgraph responses are driven per-query. ──
let mockMemHandler = () => ({ records: [] });
jest.mock('../src/lib/targets', () => {
    const realUgp = require('../src/lib/ugp-adapter');
    return {
        ugp: realUgp,
        createMemgraphDriver: () => ({
            driver: {
                session: () => ({
                    run: async (cypher, params) => mockMemHandler(cypher, params),
                    close: async () => {},
                }),
                close: async () => {},
            },
        }),
        createQdrantClient: () => ({ getCollection: async () => { throw new Error('no qdrant in test'); } }),
    };
});

const { computePlan, idStr, sanitizeLabel, sanitizeRelType, chunk } = require('../src/lib/planner');

const rec = (obj) => ({ get: (k) => obj[k] });

async function writePackage(filePath, nodes, rels) {
    const w = new ugp.UGPWriter(filePath);
    await w.open();
    for (const n of nodes) w.writeNode(ugp.serializeNode(n));
    await w.finalizeNodes();
    for (const r of rels) w.writeRelationship(ugp.serializeRelationship(r));
    await w.finalizeRelationships();
    await w.finalizeVectors();
    await w.writeManifest(ugp.buildManifest({ selectionMode: 'LABELS', vectorPolicy: 'NONE', counts: { nodes: nodes.length, relationships: rels.length } }));
    await w.close();
}

describe('planner helpers', () => {
    test('sanitizers reject injection', () => {
        expect(sanitizeLabel('Entity')).toBe('Entity');
        expect(sanitizeLabel('Bad Label')).toBeNull();
        expect(sanitizeLabel('a`b')).toBeNull();
        expect(sanitizeRelType('HAS_SEGMENT')).toBe('HAS_SEGMENT');
        expect(sanitizeRelType('1bad')).toBeNull();
    });
    test('idStr + chunk', () => {
        expect(idStr({ property: 'id', value: 'x' })).toBe('id:x');
        expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });
});

describe('computePlan', () => {
    let dir, file;
    const config = { memgraph: {}, qdrant: {}, conflict: 'skip', batchSize: 100 };

    beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-')); file = path.join(dir, 't.ugp.tar.gz'); });
    afterAll(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
    afterEach(() => { mockMemHandler = () => ({ records: [] }); });

    test('all-absent target → every node CREATE, rel CREATE', async () => {
        await writePackage(
            file,
            [{ labels: ['Entity'], properties: { id: 'a1' } }, { labels: ['Entity'], properties: { id: 'a2' } }],
            [{ type: 'LINKS', startNodeIdentity: { property: 'id', value: 'a1' }, endNodeIdentity: { property: 'id', value: 'a2' }, properties: {} }]
        );
        mockMemHandler = (cypher, params) => {
            if (cypher.includes('UNWIND $values')) return { records: params.values.map((v) => rec({ v, labels: null, props: null })) };
            if (cypher.includes('-[r:')) return { records: [rec({ cnt: 0 })] };
            return { records: [] };
        };
        const { summary } = await computePlan(file, config, { includeVectors: false });
        expect(summary.nodes.create).toBe(2);
        expect(summary.nodes.skip).toBe(0);
        expect(summary.relationships.create).toBe(1);
        expect(summary.hasHardConflicts).toBe(false);
    });

    test('existing compatible target + conflict=skip → SKIP; rel exists → SKIP', async () => {
        await writePackage(file, [{ labels: ['Entity'], properties: { id: 'a1' } }], []);
        mockMemHandler = (cypher, params) => {
            if (cypher.includes('UNWIND $values')) return { records: params.values.map((v) => rec({ v, labels: ['Entity'], props: {} })) };
            return { records: [] };
        };
        const { summary } = await computePlan(file, config, { includeVectors: false });
        expect(summary.nodes.skip).toBe(1);
        expect(summary.nodes.create).toBe(0);
    });

    test('label mismatch → hard conflict', async () => {
        await writePackage(file, [{ labels: ['Entity', 'Person'], properties: { id: 'a1' } }], []);
        mockMemHandler = (cypher, params) => {
            if (cypher.includes('UNWIND $values')) return { records: params.values.map((v) => rec({ v, labels: ['Entity', 'Organization'], props: {} })) };
            return { records: [] };
        };
        const { summary, plan } = await computePlan(file, config, { includeVectors: false });
        expect(summary.hasHardConflicts).toBe(true);
        expect(plan.nodes.conflict[0].reason).toBe('LABEL_MISMATCH');
    });
});
