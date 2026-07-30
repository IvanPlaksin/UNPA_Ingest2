'use strict';

/** VF1-001 — voice transcript store: normalize + append + get, keyed by session, filtering invalid turns. */

const mockMem = new Map();
jest.mock('../../../../services/redis.service', () => ({
  get: jest.fn(async (k) => (mockMem.has(k) ? JSON.parse(JSON.stringify(mockMem.get(k))) : null)),
  set: jest.fn(async (k, v) => { mockMem.set(k, v); return true; }),
}));

const store = require('../voice-transcript.store');

beforeEach(() => mockMem.clear());

describe('voice-transcript.store', () => {
  test('append normalizes {role,content} turns and get returns them chronologically', async () => {
    const r1 = await store.append('s1', [{ role: 'user', content: 'hi' }]);
    expect(r1.appended).toBe(1);
    await store.append('s1', [{ role: 'assistant', content: 'hello' }]);
    const msgs = await store.get('s1');
    expect(msgs.map((m) => [m.role, m.content])).toEqual([['user', 'hi'], ['assistant', 'hello']]);
    expect(msgs[0].metadata.source).toBe('voice');
    expect(typeof msgs[0].id).toBe('string');
  });

  test('filters invalid turns (bad role / empty / non-string content)', async () => {
    const r = await store.append('s2', [
      { role: 'user', content: 'ok' },
      { role: 'system', content: 'nope' },
      { role: 'assistant', content: '   ' },
      { role: 'assistant', content: 42 },
    ]);
    expect(r.appended).toBe(1);
    expect((await store.get('s2')).length).toBe(1);
  });

  test('append([]) is a no-op; get on an unknown session is []', async () => {
    expect((await store.append('s3', [])).appended).toBe(0);
    expect(await store.get('nope')).toEqual([]);
  });

  test('sessions are isolated', async () => {
    await store.append('a', [{ role: 'user', content: 'A' }]);
    await store.append('b', [{ role: 'user', content: 'B' }]);
    expect((await store.get('a')).map((m) => m.content)).toEqual(['A']);
    expect((await store.get('b')).map((m) => m.content)).toEqual(['B']);
  });
});
