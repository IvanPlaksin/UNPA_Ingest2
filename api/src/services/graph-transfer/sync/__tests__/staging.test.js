'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');

const TMP = path.join(os.tmpdir(), `sync-staging-test-${process.pid}`);
process.env.GRAPH_SYNC_STAGING_DIR = TMP;
process.env.GRAPH_SYNC_STAGING_TTL_MS = '50';

const staging = require('../staging.service');

afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

describe('staging.service', () => {
    test('allocate returns a uuid id + path inside the staging dir', () => {
        const { stagingId, filePath } = staging.allocate();
        expect(stagingId).toMatch(/^[0-9a-f-]{36}$/i);
        expect(path.dirname(filePath)).toBe(path.resolve(TMP));
    });

    test('getPath resolves an existing staged file and rejects traversal / bad ids', () => {
        const { stagingId, filePath } = staging.allocate();
        fs.writeFileSync(filePath, 'x');
        expect(staging.getPath(stagingId)).toBe(filePath);
        expect(staging.getPath('../../etc/passwd')).toBeNull();
        expect(staging.getPath('not-a-uuid')).toBeNull();
        expect(staging.getPath('00000000-0000-0000-0000-000000000000')).toBeNull(); // valid uuid, no file
    });

    test('remove deletes the staged file + meta', () => {
        const { stagingId, filePath } = staging.allocate();
        fs.writeFileSync(filePath, 'x'); staging.setMeta(stagingId, { contentHash: 'h' });
        staging.remove(stagingId);
        expect(fs.existsSync(filePath)).toBe(false);
        expect(staging.getMeta(stagingId)).toBeNull();
    });

    test('sweep deletes files older than the TTL', async () => {
        const { filePath } = staging.allocate();
        fs.writeFileSync(filePath, 'x');
        await new Promise((r) => setTimeout(r, 80)); // > 50ms TTL
        const removed = staging.sweep();
        expect(removed).toBeGreaterThanOrEqual(1);
        expect(fs.existsSync(filePath)).toBe(false);
    });
});
