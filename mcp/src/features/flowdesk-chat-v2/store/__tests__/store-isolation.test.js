import { describe, it, expect, afterEach } from 'vitest';
import { getChatStore, useChatStore, clearChatStores } from '../chat-store';

afterEach(() => clearChatStores());

describe('V1 instance-scoped stores', () => {
  it('same storeId → same store; different storeId → different stores', () => {
    expect(getChatStore('assistant')).toBe(getChatStore('assistant'));
    expect(getChatStore('assistant')).not.toBe(getChatStore('home'));
  });

  it('the default store hook equals getChatStore("default") (backward compat)', () => {
    expect(useChatStore).toBe(getChatStore('default'));
  });

  it('state is independent across stores (messages do not bleed)', () => {
    const a = getChatStore('a');
    const b = getChatStore('b');
    a.getState().actions.addMessage('user', 'hi from A');
    expect(a.getState().messages).toHaveLength(1);
    expect(a.getState().messages[0].content).toBe('hi from A');
    expect(b.getState().messages).toHaveLength(0); // isolated
  });

  it('each store has its own session id', () => {
    const a = getChatStore('s1');
    const b = getChatStore('s2');
    expect(a.getState().session.id).not.toBe(b.getState().session.id);
  });

  it('anchorContext + draft are isolated too', () => {
    const a = getChatStore('x');
    const b = getChatStore('y');
    a.getState().actions.setAnchorContext({ anchorId: 'a.b' });
    expect(a.getState().anchorContext).toMatchObject({ anchorId: 'a.b' });
    expect(b.getState().anchorContext).toBeNull();
  });

  it('addVoiceTranscript appends voice turns (deduped vs the last message)', () => {
    const s = getChatStore('vt');
    s.getState().actions.addVoiceTranscript({ role: 'user', content: 'show my tasks' });
    s.getState().actions.addVoiceTranscript({ role: 'assistant', content: 'You have two tasks.' });
    // duplicate of the last message is ignored
    s.getState().actions.addVoiceTranscript({ role: 'assistant', content: 'You have two tasks.' });
    // invalid inputs ignored
    s.getState().actions.addVoiceTranscript({ role: 'system', content: 'x' });
    s.getState().actions.addVoiceTranscript({ role: 'user', content: '' });
    const msgs = s.getState().messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({ role: 'user', content: 'show my tasks', metadata: { source: 'voice' } });
    expect(msgs[1].content).toBe('You have two tasks.');
  });

  it('hydrateTranscripts merges server transcript, skipping turns already present', () => {
    const s = getChatStore('hy');
    s.getState().actions.addVoiceTranscript({ role: 'user', content: 'A' }); // already live-pushed
    s.getState().actions.hydrateTranscripts([
      { role: 'user', content: 'A', metadata: { source: 'voice' } }, // dup → skipped
      { role: 'assistant', content: 'B', metadata: { source: 'voice' } }, // new → added
      { role: 'nope', content: 'C' }, // invalid → skipped
    ]);
    const contents = s.getState().messages.map((m) => m.content);
    expect(contents).toEqual(['A', 'B']);
  });

  it('adoptSession points a store at an external shared session id (idempotent)', () => {
    const s = getChatStore('assistant');
    const original = s.getState().session.id;
    s.getState().actions.adoptSession('fdv2-shared-123');
    expect(s.getState().session.id).toBe('fdv2-shared-123');
    // idempotent: re-adopting the same id is a no-op, and does not touch other fields
    s.getState().actions.adoptSession('fdv2-shared-123');
    expect(s.getState().session.id).toBe('fdv2-shared-123');
    // an empty id is ignored
    s.getState().actions.adoptSession('');
    expect(s.getState().session.id).toBe('fdv2-shared-123');
    expect(s.getState().session.id).not.toBe(original);
  });
});
