'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');

const STORE = path.join(os.tmpdir(), `sync-peers-test-${process.pid}.json`);
process.env.GRAPH_SYNC_PEERS_FILE = STORE;
const peers = require('../peers.service');

afterAll(() => { try { fs.rmSync(STORE, { force: true }); } catch {} });
beforeEach(() => { try { fs.rmSync(STORE, { force: true }); } catch {} });

describe('peers.service', () => {
    test('rejects a non-http baseUrl', () => {
        expect(() => peers.upsert({ name: 'x', baseUrl: 'ftp://nope' })).toThrow(/http/);
    });

    test('upsert then list/get; secret key is never persisted', () => {
        const p = peers.upsert({ name: 'Azure', baseUrl: 'https://vm.example.com/' });
        expect(p.baseUrl).toBe('https://vm.example.com'); // trailing slash trimmed
        expect(p).not.toHaveProperty('key'); // no plaintext secret
        const raw = JSON.parse(fs.readFileSync(STORE, 'utf8'))[0];
        expect(raw).not.toHaveProperty('key');
        expect(peers.list()).toHaveLength(1);
        expect(peers.get(p.id).name).toBe('Azure');
    });

    test('resolveConnection reads the key from env (keyEnv), errors when unset', () => {
        const p = peers.upsert({ name: 'P', baseUrl: 'https://p', keyEnv: 'TEST_SYNC_KEY_X' });
        delete process.env.TEST_SYNC_KEY_X;
        expect(() => peers.resolveConnection(p.id)).toThrow(/No sync key|not set/);
        process.env.TEST_SYNC_KEY_X = 'secret123';
        const conn = peers.resolveConnection(p.id);
        expect(conn.key).toBe('secret123');
        expect(conn.baseUrl).toBe('https://p');
        delete process.env.TEST_SYNC_KEY_X;
    });

    test('a per-peer key is used (wins over env) but never exposed to the client', () => {
        delete process.env.GRAPH_SYNC_KEY;
        const p = peers.upsert({ name: 'Azure', baseUrl: 'https://az', key: 'peerkey123' });
        expect(p.keyConfigured).toBe(true);
        expect(p).not.toHaveProperty('key');                 // not returned to client
        expect(peers.list()[0]).not.toHaveProperty('key');
        expect(peers.resolveConnection(p.id).key).toBe('peerkey123'); // used server-side
        // update without a key preserves the stored one
        const p2 = peers.upsert({ id: p.id, name: 'Azure2', baseUrl: 'https://az' });
        expect(peers.resolveConnection(p2.id).key).toBe('peerkey123');
    });

    test('remove deletes a peer', () => {
        const p = peers.upsert({ name: 'P', baseUrl: 'https://p' });
        expect(peers.remove(p.id)).toBe(true);
        expect(peers.list()).toHaveLength(0);
    });
});
