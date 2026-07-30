import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  I18nextProvider: ({ children }) => children,
  useTranslation: () => ({ t: (k) => ({ 'floatingChat.defaultTitle': 'Help', 'floatingChat.close': 'Close' }[k] || k) }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('../../i18n', () => ({ default: {} }));
// Isolate the wrapper mechanics from the full chat mount.
vi.mock('../../FlowDeskChatV2.jsx', () => ({
  default: (props) => (
    <div data-testid="chat" data-anchor={props.anchorContext?.anchorId || ''} data-compact={String(!!props.compact)} />
  ),
}));

import { FloatingChatProvider, useFloatingChat } from '../FloatingChatProvider.jsx';
import FloatingChatWindow from '../FloatingChatWindow.jsx';

function Trigger() {
  const { openChat } = useFloatingChat();
  return <button onClick={() => openChat({ anchorId: 'a.b', anchorTitle: 'Leave Form' })}>open</button>;
}

const setup = () =>
  render(
    <FloatingChatProvider>
      <Trigger />
      <FloatingChatWindow chatProps={{ userProfile: { userId: 'u1' } }} />
    </FloatingChatProvider>,
  );

describe('FloatingChat (Phase 3)', () => {
  it('is closed by default', () => {
    setup();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('openChat shows the window, header title, and forwards anchorContext + compact to the chat', () => {
    setup();
    fireEvent.click(screen.getByText('open'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Leave Form')).toBeInTheDocument();
    const chat = screen.getByTestId('chat');
    expect(chat).toHaveAttribute('data-anchor', 'a.b');
    expect(chat).toHaveAttribute('data-compact', 'true');
  });

  it('closes via the close button', () => {
    setup();
    fireEvent.click(screen.getByText('open'));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape', () => {
    setup();
    fireEvent.click(screen.getByText('open'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens via the window CustomEvent bridge with the event detail as anchor', () => {
    setup();
    act(() => {
      window.dispatchEvent(new CustomEvent('openAltioraChat', { detail: { anchorId: 'x', anchorTitle: 'From Event' } }));
    });
    expect(screen.getByText('From Event')).toBeInTheDocument();
  });

  it('falls back to the default title when opened without an anchor', () => {
    render(
      <FloatingChatProvider>
        <FloatingChatWindow />
      </FloatingChatProvider>,
    );
    act(() => { window.dispatchEvent(new CustomEvent('openAltioraChat')); });
    expect(screen.getByText('Help')).toBeInTheDocument();
  });
});
