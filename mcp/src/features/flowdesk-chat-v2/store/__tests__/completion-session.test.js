import { describe, it, expect, afterEach, vi } from 'vitest';

// i18n → identity so we assert on stable keys.
vi.mock('../../i18n', () => ({ default: { t: (k) => k }, currentLang: () => 'en' }));

import { getChatStore, clearChatStores } from '../chat-store';

afterEach(() => clearChatStores());

describe('ending a thread opens a new session', () => {
  it('posts the closing message, then opens a fresh session the user can keep using', () => {
    const s = getChatStore('c1');
    const before = s.getState().session.id;

    s.getState().actions.completeWithThanks('SR-42');

    const msgs = s.getState().messages;
    // The closing line, then the opening line of the session that replaces it.
    expect(msgs[msgs.length - 2].content).toBe('thanks');
    expect(msgs[msgs.length - 2].metadata.srNumber).toBe('SR-42');
    expect(msgs[msgs.length - 1].content).toBe('anythingElse');
    // A NEW backend session, with nothing of the finished request left on it.
    expect(s.getState().session.id).not.toBe(before);
    expect(s.getState().session.serviceId).toBeNull();
    expect(s.getState().draft.slots).toEqual({});
    expect(s.getState().schema).toBeNull();
    // …and the chat is usable: the composer is NOT locked. This is the point of
    // the change — a hand-off used to leave a dead thread behind.
    expect(s.getState().ui.composerDisabled).toBe(false);
  });

  it('the form hand-off says the form is open, not that a request was created', () => {
    const s = getChatStore('c1b');
    s.getState().actions.endThread({ reason: 'form_handoff', key: 'm-1' });
    const msgs = s.getState().messages;
    expect(msgs[msgs.length - 2].content).toBe('handoffClosing');
    expect(msgs[msgs.length - 1].content).toBe('anythingElse');
  });

  it('is idempotent per event, so one hand-off closes the thread once', () => {
    const s = getChatStore('c2');
    s.getState().actions.endThread({ reason: 'form_handoff', key: 'm-1' });
    s.getState().actions.endThread({ reason: 'form_handoff', key: 'm-1' });
    expect(s.getState().messages.filter((m) => m.content === 'handoffClosing')).toHaveLength(1);
  });

  it('…but a LATER request in the same window gets its own closing', () => {
    const s = getChatStore('c3');
    s.getState().actions.endThread({ reason: 'form_handoff', key: 'm-1' });
    s.getState().actions.completeWithThanks('SR-7');
    expect(s.getState().messages.filter((m) => m.content === 'handoffClosing')).toHaveLength(1);
    expect(s.getState().messages.filter((m) => m.content === 'thanks')).toHaveLength(1);
  });
});

describe('Addition 3 — a fresh session on every load', () => {
  it('the session id is NOT persisted (partialize omits it)', () => {
    // Reaching into the persist options is brittle; instead assert the behavioural
    // contract: a brand-new store instance always has a freshly-generated session id
    // (nothing is rehydrated from storage into it).
    const a = getChatStore('load-a');
    const idA = a.getState().session.id;
    expect(typeof idA).toBe('string');
    expect(idA.length).toBeGreaterThan(0);
    // sessionStorage holds no persisted session id for this store key
    const raw = sessionStorage.getItem('fdv2-chat-load-a');
    if (raw) {
      const parsed = JSON.parse(raw);
      expect(parsed?.state?.session?.id).toBeUndefined();
    }
  });
});
