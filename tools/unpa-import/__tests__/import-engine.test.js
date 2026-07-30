'use strict';

const { ImportEngine } = require('../src/lib/import-engine');

// Fake Bolt driver that records every tx.run() call.
function makeDriver(recorder) {
    return {
        session: () => ({
            executeWrite: async (fn) => fn({ run: async (cypher, params) => { recorder.push({ cypher, params }); return { records: [] }; } }),
            close: async () => {},
        }),
    };
}

describe('ImportEngine — node writes', () => {
    test('CREATE uses MERGE by (primary label, identity) + secondary SET + ON CREATE', async () => {
        const rec = [];
        const engine = new ImportEngine(makeDriver(rec), { batchSize: 10 });
        const node = {
            labels: ['Entity', 'Person'],
            _identity: { property: 'id', value: 'e1' },
            props: { id: 'e1', name: 'Alice', when: { $type: 'datetime', value: '2026-07-17T00:00:00.000Z' } },
            _action: 'CREATE',
        };
        const stats = await engine.importNodes([node]);

        expect(stats).toMatchObject({ created: 1, updated: 0, skipped: 0, failed: 0 });
        expect(rec).toHaveLength(1);
        const { cypher, params } = rec[0];
        expect(cypher).toMatch(/MERGE \(n:Entity \{id: \$v\}\)/);
        expect(cypher).toMatch(/ON CREATE SET n \+= \$props/);
        expect(cypher).toMatch(/SET n:Person/);
        expect(params.v).toBe('e1');
        // identity property is the MERGE key, not duplicated in SET props
        expect(params.props.id).toBeUndefined();
        // temporal envelope was unwrapped (not a raw {$type} map)
        expect(params.props.when).toBeDefined();
        expect(params.props.when.$type).toBeUndefined();
    });

    test('OVERWRITE uses unconditional SET (no ON CREATE)', async () => {
        const rec = [];
        const engine = new ImportEngine(makeDriver(rec), {});
        await engine.importNodes([{ labels: ['Doc'], _identity: { property: 'id', value: 'd1' }, props: { id: 'd1', title: 'T' }, _action: 'OVERWRITE' }]);
        expect(rec[0].cypher).toMatch(/MERGE \(n:Doc \{id: \$v\}\) SET n \+= \$props/);
        expect(rec[0].cypher).not.toMatch(/ON CREATE/);
    });

    test('stub node sets _ugpStub flag', async () => {
        const rec = [];
        const engine = new ImportEngine(makeDriver(rec), {});
        await engine.importNodes([{ labels: ['Session'], _identity: { property: 'sessionId', value: 's1' }, props: { sessionId: 's1' }, stub: true, _action: 'CREATE_STUB' }]);
        expect(rec[0].cypher).toMatch(/SET n._ugpStub = true/);
    });

    test('SKIP / CONFLICT actions are not written', async () => {
        const rec = [];
        const engine = new ImportEngine(makeDriver(rec), {});
        const stats = await engine.importNodes([
            { labels: ['A'], _identity: { property: 'id', value: '1' }, props: {}, _action: 'SKIP' },
            { labels: ['A'], _identity: { property: 'id', value: '2' }, props: {}, _action: 'CONFLICT' },
        ]);
        expect(rec).toHaveLength(0);
        expect(stats.skipped).toBe(2);
    });
});

describe('ImportEngine — relationship writes', () => {
    test('CREATE matches endpoints by label then MERGEs the typed edge', async () => {
        const rec = [];
        const engine = new ImportEngine(makeDriver(rec), {});
        const rel = {
            type: 'KNOWS',
            from: { property: 'id', value: 'e1', label: 'Entity' },
            to: { property: 'id', value: 'e2', label: 'Person' },
            props: { since: 2020 },
            _action: 'CREATE',
        };
        const stats = await engine.importRelationships([rel]);
        expect(stats.created).toBe(1);
        const { cypher, params } = rec[0];
        expect(cypher).toMatch(/MATCH \(a:Entity \{id: \$fromVal\}\)/);
        expect(cypher).toMatch(/MATCH \(b:Person \{id: \$toVal\}\)/);
        expect(cypher).toMatch(/MERGE \(a\)-\[r:KNOWS\]->\(b\) SET r \+= \$props/);
        expect(params.fromVal).toBe('e1');
        expect(params.toVal).toBe('e2');
    });

    test('non-CREATE relationships are skipped', async () => {
        const rec = [];
        const engine = new ImportEngine(makeDriver(rec), {});
        const stats = await engine.importRelationships([{ type: 'X', from: {}, to: {}, _action: 'SKIP' }, { type: 'Y', from: {}, to: {}, _action: 'ORPHAN' }]);
        expect(rec).toHaveLength(0);
        expect(stats.skipped).toBe(2);
    });
});
