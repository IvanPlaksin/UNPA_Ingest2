import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

// Spy the chat client (intercepts the store's '../api/chat-client' import too —
// same resolved module). vi.hoisted so the spy exists when the hoisted mock runs.
const { sendMessage } = vi.hoisted(() => ({ sendMessage: vi.fn() }));
vi.mock('../../api/chat-client', () => ({
  chatClient: { sendMessage, subscribeProgress: () => () => {}, getSchema: async () => null },
  ChatError: class ChatError extends Error { constructor(code, message) { super(message); this.code = code; } },
  SSE_EVENTS: {},
}));

const CANNED = {
  response: 'Here is what this element does and how to use it.',
  sources: [{ id: 'kb1', title: 'Leave guide', collection: 'altiora_knowledge', relevance: 0.82 }],
  route: 'ANCHOR_EXPLAIN',
  state: { route: 'ANCHOR_EXPLAIN' },
};

import { useChatStore } from '../../store/chat-store';
import FlowDeskChatV2 from '../../FlowDeskChatV2.jsx';

const resetStore = () => useChatStore.setState({
  messages: [], anchorContext: null, user: null,
  ui: { loading: false, error: null, currentNode: null, composerDisabled: false, draftPanelOpen: true },
});

beforeEach(() => { resetStore(); sendMessage.mockReset(); sendMessage.mockResolvedValue(CANNED); });

describe('sendAnchorExplain store action (Phase 4)', () => {
  it('posts the anchor and adds ONLY an assistant message (no user bubble)', async () => {
    await useChatStore.getState().actions.sendAnchorExplain({ anchorId: 'a.b', anchorTitle: 'Leave Form' });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const opts = sendMessage.mock.calls[0][3];
    expect(sendMessage.mock.calls[0][2]).toBeNull();            // no text message
    expect(opts.anchor).toMatchObject({ id: 'a.b', title: 'Leave Form' });
    const msgs = useChatStore.getState().messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe('assistant');
    expect(msgs[0].metadata.sources).toHaveLength(1);
    expect(useChatStore.getState().anchorContext).toMatchObject({ anchorId: 'a.b' });
  });

  it('does nothing when no anchor is given', async () => {
    await useChatStore.getState().actions.sendAnchorExplain(null);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(useChatStore.getState().messages).toHaveLength(0);
  });
});

describe('auto-send on mount (Phase 4)', () => {
  it('auto-sends an anchor explain exactly once when mounted with anchorContext', async () => {
    render(<FlowDeskChatV2 anchorContext={{ anchorId: 'altiora.leave.form', anchorTitle: 'Leave Request Form' }} />);
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage.mock.calls[0][3].anchor).toMatchObject({ id: 'altiora.leave.form', title: 'Leave Request Form' });
    // Only the assistant explanation is shown — no user bubble.
    const msgs = useChatStore.getState().messages;
    expect(msgs.filter((m) => m.role === 'user')).toHaveLength(0);
    expect(msgs.some((m) => m.role === 'assistant')).toBe(true);
  });

  it('does not auto-send when mounted without an anchor', async () => {
    render(<FlowDeskChatV2 />);
    await new Promise((r) => setTimeout(r, 30));
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
