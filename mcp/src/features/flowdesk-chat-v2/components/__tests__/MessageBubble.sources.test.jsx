import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// i18n → map the sources.* keys we assert on; unknown keys fall through to the key.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k) => ({
      senderMe: 'Me', agentName: 'Altiora',
      'sources.view': 'View sources', 'sources.title': 'Sources',
      'sources.collection': 'Collection', 'sources.relevance': 'Relevance', 'sources.close': 'Close',
    }[k] || k),
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('../../utils/markdown.jsx', () => ({ default: ({ children }) => <span>{children}</span> }));
vi.mock('../../store/chat-store', () => ({ useUI: () => ({ loading: false }), useChatActions: () => ({ sendControlAction: () => {}, sendChoice: () => {} }) }));
vi.mock('../../../../config/api.config', () => ({ API_BASE_URL: 'http://test/api/v1' }));

import MessageBubble from '../MessageBubble.jsx';

const withSources = (sources) => ({
  id: 'm1', role: 'assistant', content: 'Here is the answer.',
  timestamp: '2026-07-21T10:00:00Z', metadata: { sources },
});
const SRC = [{ id: 'KB-1', title: 'Separation checklist', collection: 'altiora_knowledge', relevance: 0.81, snippet: 'You will need ID and forms.' }];

describe('FE: Show sources', () => {
  it('renders the sources icon with the count when sources exist', () => {
    render(<MessageBubble message={withSources(SRC)} isLast />);
    const btn = screen.getByRole('button', { name: 'View sources' });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('1');
  });

  it('does NOT render the icon when there are no sources', () => {
    render(<MessageBubble message={withSources([])} isLast />);
    expect(screen.queryByRole('button', { name: 'View sources' })).toBeNull();
  });

  it('opens a modal listing the sources on click; relevance shown as a percentage', () => {
    render(<MessageBubble message={withSources(SRC)} isLast />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'View sources' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Separation checklist')).toBeInTheDocument();
    expect(screen.getByText('81%')).toBeInTheDocument();
    expect(screen.getByText(/Collection: altiora_knowledge/)).toBeInTheDocument();
    expect(screen.getByText('You will need ID and forms.')).toBeInTheDocument();
  });

  it('closes the modal via the close button', () => {
    render(<MessageBubble message={withSources(SRC)} isLast />);
    fireEvent.click(screen.getByRole('button', { name: 'View sources' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
