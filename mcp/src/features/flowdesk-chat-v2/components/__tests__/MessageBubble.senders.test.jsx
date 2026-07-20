import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// i18n → resolve the two label keys we care about (+ initReactI18next passthrough
// so the transitively-imported i18n index doesn't blow up).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => ({ senderMe: 'Я', agentName: 'Altiora' }[k] || k) }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('../../utils/markdown.jsx', () => ({ default: ({ children }) => <span>{children}</span> }));
// Cut the transitive store/config imports (ControlRenderer/ChoiceButtons are not exercised here).
vi.mock('../../store/chat-store', () => ({ useUI: () => ({ loading: false }), useChatActions: () => ({ sendControlAction: () => {}, sendChoice: () => {} }) }));
vi.mock('../../../../config/api.config', () => ({ API_BASE_URL: 'http://test/api/v1' }));

import MessageBubble from '../MessageBubble.jsx';

const msg = (role, content) => ({ id: 'm1', role, content, timestamp: '2026-07-17T10:00:00Z', metadata: null });

describe('FE: participant captions', () => {
  it('labels an assistant message "Altiora"', () => {
    render(<MessageBubble message={msg('assistant', 'Hi')} isLast />);
    expect(screen.getByText('Altiora')).toBeInTheDocument();
  });

  it('labels a user message with the localized "me" (ru → Я)', () => {
    render(<MessageBubble message={msg('user', 'Привет')} isLast />);
    expect(screen.getByText('Я')).toBeInTheDocument();
  });

  it('a system message has no participant caption', () => {
    render(<MessageBubble message={msg('system', 'Request stopped.')} isLast />);
    expect(screen.queryByText('Altiora')).toBeNull();
    expect(screen.queryByText('Я')).toBeNull();
  });
});
