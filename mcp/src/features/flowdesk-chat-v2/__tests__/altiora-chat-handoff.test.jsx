// @vitest-environment jsdom
/**
 * AltioraChat — what happens when the gate form opens.
 *
 * Two faults reported from the Altiora portal, both about the same moment:
 *
 *   1. after the form opened, the chat kept the finished conversation instead of
 *      returning to its opening state with a new session;
 *   2. the host persists the thread, so on a page reload the hand-off message came
 *      back, this effect re-opened the wizard, and it sometimes threw hard enough to
 *      take the host SPA with it.
 *
 * These run against the BUILT package (`@flowdesk/chat-v2`), not the source, because
 * the source lives in the Altiora repository and what the portal loads is the build.
 * A test that passed against source we did not ship would prove nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AltioraChat, getChatStore } from '@flowdesk/chat-v2';

const USER = { userId: 'u1', firstName: 'Ivan', displayName: 'Ivan P' };

/** The chat never reaches the network in these tests. */
const fetchImpl = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));

const HANDOFF = {
  id: 'm-handoff',
  role: 'assistant',
  content: 'Opening the form now.',
  metadata: { openForm: { ousId: 59, serviceId: 'EO-HR-BE-EG-EGC', prefill: {} } },
};

const mount = (props = {}) => render(
  <AltioraChat
    apiBaseUrl="/api/v1"
    user={USER}
    userId={USER.userId}
    fetchImpl={fetchImpl}
    storeId="default"
    {...props}
  />,
);

const store = () => getChatStore('default');

beforeEach(() => {
  fetchImpl.mockClear();
  store().setState({ messages: [], anchorContext: null });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('the hand-off is terminal', () => {
  it('opening the form resets the chat to a NEW session with an empty thread', async () => {
    const onOpenForm = vi.fn();
    mount({ onOpenForm });

    const before = store().getState().session.id;

    // The turn carrying the hand-off arrives live.
    await act(async () => {
      store().setState({ messages: [...store().getState().messages, HANDOFF] });
    });

    await waitFor(() => expect(onOpenForm).toHaveBeenCalledTimes(1));
    expect(onOpenForm).toHaveBeenCalledWith(HANDOFF.metadata.openForm);

    await waitFor(() => {
      const s = store().getState();
      // A new session, and the finished conversation is gone.
      expect(s.session.id).not.toBe(before);
      expect(s.messages.some((m) => m.metadata && m.metadata.openForm)).toBe(false);
      // The composer is usable again — it was locked by the old "completed" path.
      expect(s.ui.composerDisabled).toBe(false);
      expect(s.ui.completed).toBe(false);
    });
  });

  it('a RESTORED hand-off never reopens the form — that is what broke on reload', async () => {
    // The host (Altiora portal) mirrors {messages, session} into localStorage and
    // rehydrates before first paint, so the hand-off is already on screen at mount.
    store().setState({ messages: [HANDOFF] });

    const onOpenForm = vi.fn();
    mount({ onOpenForm });

    await waitFor(() => {
      // Nothing reopened…
      expect(onOpenForm).not.toHaveBeenCalled();
      // …and the finished thread was replaced rather than resumed.
      expect(store().getState().messages.some((m) => m.metadata && m.metadata.openForm)).toBe(false);
    });
  });

  it('a hand-off arriving AFTER a restored ordinary thread still opens the form', async () => {
    // The guard must not swallow live hand-offs: only what was on screen at mount is
    // treated as history.
    store().setState({ messages: [{ id: 'm-old', role: 'assistant', content: 'earlier turn' }] });

    const onOpenForm = vi.fn();
    mount({ onOpenForm });

    await act(async () => {
      store().setState({ messages: [...store().getState().messages, HANDOFF] });
    });

    await waitFor(() => expect(onOpenForm).toHaveBeenCalledTimes(1));
  });

  it('the reset clears the anchor context, so the next session does not inherit it', async () => {
    store().setState({ anchorContext: { anchorId: 'catalog.card', anchorTitle: 'Some service' } });

    const onOpenForm = vi.fn();
    mount({ onOpenForm });

    await act(async () => {
      store().setState({ messages: [...store().getState().messages, HANDOFF] });
    });

    await waitFor(() => expect(store().getState().anchorContext).toBeNull());
  });
});
