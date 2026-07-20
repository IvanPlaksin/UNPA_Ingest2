import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendMessage, getDraft, patchDraft, subscribeProgress, ChatError } from '../chat-client';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

describe('F4 chat-client: REST', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('sendMessage returns turn result + refreshed draft', async () => {
    const fetchMock = vi.fn((u, opts) => {
      if (u.includes('/flowdesk/chat') && opts?.method === 'POST') {
        return Promise.resolve(jsonResponse({ response: 'hi', choices: null, state: { serviceId: 'IT-HW-LAP' }, isComplete: false, version: 'v2', executionLog: [] }));
      }
      if (u.includes('/flowdesk/draft/')) {
        return Promise.resolve(jsonResponse({ sessionId: 's1', slots: { assetType: { value: 'laptop_standard' } } }));
      }
      return Promise.resolve(jsonResponse({}, { ok: false, status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await sendMessage('s1', 'u1', 'need a laptop');
    expect(res.response).toBe('hi');
    expect(res.version).toBe('v2');
    expect(res.draft.slots.assetType.value).toBe('laptop_standard');
    // POST then GET draft = 2 fetches
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sendMessage throws ChatError SERVER on {error}', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ error: 'Chat V2 failed', detail: 'boom' }))));
    await expect(sendMessage('s1', 'u1', 'x')).rejects.toMatchObject({ name: 'ChatError', code: 'SERVER' });
  });

  it('getDraft returns null on 404', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({}, { ok: false, status: 404 }))));
    expect(await getDraft('nope')).toBeNull();
  });

  it('patchDraft posts patches and returns updated draft', async () => {
    const fetchMock = vi.fn((u, opts) => {
      expect(opts.method).toBe('PATCH');
      expect(JSON.parse(opts.body).patches).toHaveLength(1);
      return Promise.resolve(jsonResponse({ slots: { justification: { value: 'x' } } }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await patchDraft('s1', [{ op: 'set', slotId: 'justification', value: 'x', provenance: 'user_edited' }]);
    expect(res.slots.justification.value).toBe('x');
  });

  it('network failure maps to ChatError NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('failed to fetch'))));
    await expect(getDraft('s1')).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('sendMessage with controlAction (I-3) posts it, not message/choice', async () => {
    let posted = null;
    const fetchMock = vi.fn((u, opts) => {
      if (u.includes('/flowdesk/chat') && opts?.method === 'POST') { posted = JSON.parse(opts.body); return Promise.resolve(jsonResponse({ response: 'ok', controls: null })); }
      return Promise.resolve(jsonResponse({}, { ok: false, status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const ca = { controlId: 'ctrl-x', slotId: 'beneficiary', action: 'confirm' };
    await sendMessage('s1', 'u1', null, { controlAction: ca });
    expect(posted.controlAction).toEqual(ca);
    expect(posted.message).toBeUndefined();
    expect(posted.choice).toBeUndefined();
  });
});

describe('F4 chat-client: SSE subscribeProgress', () => {
  // Minimal mock EventSource
  class MockES {
    constructor(url) { this.url = url; this.listeners = {}; MockES.last = this; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    emit(type, data) { (this.listeners[type] || []).forEach((fn) => fn({ data: JSON.stringify(data) })); }
    close() { this.closed = true; }
  }

  it('routes SSE events to handlers and unsubscribe closes', () => {
    const nodes = [];
    let connected = false, turnDone = false;
    const unsub = subscribeProgress('s1', {
      onConnected: () => { connected = true; },
      onNode: (node, phase) => nodes.push(`${phase}:${node}`),
      onTurnDone: () => { turnDone = true; },
    }, { EventSourceImpl: MockES });

    const es = MockES.last;
    es.emit('connected', { sessionId: 's1' });
    es.emit('node:start', { node: 'ROUTER' });
    es.emit('node:done', { node: 'ROUTER', status: 'success' });
    es.emit('turn:done', {});

    expect(connected).toBe(true);
    expect(nodes).toEqual(['start:ROUTER', 'done:ROUTER']);
    expect(turnDone).toBe(true);

    unsub();
    expect(es.closed).toBe(true);
  });

  it('onNode receives null on done (for currentNode clearing)', () => {
    const seen = [];
    subscribeProgress('s2', { onNode: (node, phase) => seen.push([node, phase]) }, { EventSourceImpl: MockES });
    MockES.last.emit('node:start', { node: 'SLOT_EXTRACT' });
    MockES.last.emit('node:done', { node: 'SLOT_EXTRACT' });
    // store maps done → null via its own handler; here we just confirm phase is passed
    expect(seen).toEqual([['SLOT_EXTRACT', 'start'], ['SLOT_EXTRACT', 'done']]);
  });
});
