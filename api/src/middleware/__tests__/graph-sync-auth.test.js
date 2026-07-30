'use strict';

const { graphSyncAuthMiddleware, KEY_HEADER, SRC_HEADER } = require('../graph-sync-auth.middleware');

function run(headers = {}, { path = '/apply', method = 'POST' } = {}) {
    const req = { headers, path, method };
    let statusCode = 0; let body = null; let nexted = false;
    const res = { status(c) { statusCode = c; return this; }, json(b) { body = b; return this; } };
    graphSyncAuthMiddleware(req, res, () => { nexted = true; });
    return { statusCode, body, nexted, req };
}

const ENV = { ...process.env };
afterEach(() => { process.env = { ...ENV }; });

describe('graph-sync-auth (fail-closed)', () => {
    test('503 when GRAPH_SYNC_KEY unset (fail-closed)', () => {
        delete process.env.GRAPH_SYNC_KEY; delete process.env.GRAPH_SYNC_ALLOW_INSECURE;
        const { statusCode, nexted } = run({ [KEY_HEADER]: 'anything' });
        expect(nexted).toBe(false); expect(statusCode).toBe(503);
    });

    test('health + OPTIONS always pass', () => {
        delete process.env.GRAPH_SYNC_KEY;
        expect(run({}, { path: '/health', method: 'GET' }).nexted).toBe(true);
        expect(run({}, { path: '/apply', method: 'OPTIONS' }).nexted).toBe(true);
    });

    test('401 on wrong key, pass on correct key', () => {
        process.env.GRAPH_SYNC_KEY = 'right';
        expect(run({ [KEY_HEADER]: 'wrong' }).statusCode).toBe(401);
        expect(run({ [KEY_HEADER]: 'right' }).nexted).toBe(true);
    });

    test('peer allowlist enforced when GRAPH_SYNC_PEERS set', () => {
        process.env.GRAPH_SYNC_KEY = 'k';
        process.env.GRAPH_SYNC_PEERS = 'inst-a,inst-b';
        expect(run({ [KEY_HEADER]: 'k', [SRC_HEADER]: 'inst-x' }).statusCode).toBe(403);
        expect(run({ [KEY_HEADER]: 'k', [SRC_HEADER]: 'inst-a' }).nexted).toBe(true);
    });

    test('GRAPH_SYNC_ALLOW_INSECURE bypasses', () => {
        delete process.env.GRAPH_SYNC_KEY;
        process.env.GRAPH_SYNC_ALLOW_INSECURE = 'true';
        expect(run({}).nexted).toBe(true);
    });
});
