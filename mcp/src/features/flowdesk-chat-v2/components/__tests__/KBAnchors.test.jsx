import React, { useRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k, o) => (k === 'explain.trigger' ? `Explain ${o?.title ?? ''}` : k === 'explain.triggerTooltip' ? 'Get help with this' : k) }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import ExplainTrigger from '../ExplainTrigger.jsx';
import { useKBAnchors } from '../useKBAnchors.js';

// Capture the voice-explain window events.
let events;
const onExplain = (e) => events.push(e.detail);
beforeEach(() => { events = []; window.addEventListener('altioraVoiceExplain', onExplain); });
afterEach(() => window.removeEventListener('altioraVoiceExplain', onExplain));

describe('ExplainTrigger (V2 → voice)', () => {
  it('renders a "?" and dispatches altioraVoiceExplain with the anchor on click', () => {
    render(<ExplainTrigger anchorId="altiora.requests.list" anchorTitle="Your Requests" />);
    const btn = screen.getByRole('button', { name: 'Explain Your Requests' });
    expect(btn).toHaveTextContent('?');
    expect(events).toHaveLength(0);
    fireEvent.click(btn);
    expect(events).toEqual([{ anchorId: 'altiora.requests.list', anchorTitle: 'Your Requests' }]);
  });

  it('renders nothing without an anchorId', () => {
    const { container } = render(<ExplainTrigger />);
    expect(container.querySelector('.fdv2-explain-trigger')).toBeNull();
  });
});

function AnchoredArea() {
  const ref = useRef(null);
  useKBAnchors(ref);
  return (
    <div ref={ref}>
      <div data-kb-anchor="altiora.catalog.search" data-kb-title="Catalog">catalog widget</div>
      <div data-kb-anchor="altiora.tasks.list">tasks widget</div>
    </div>
  );
}

describe('useKBAnchors (V2 → voice)', () => {
  it('auto-injects a "?" trigger into each [data-kb-anchor] and dispatches voice-explain on click', () => {
    render(<AnchoredArea />);
    const triggers = document.querySelectorAll('.fdv2-explain-trigger');
    expect(triggers.length).toBe(2);
    triggers[0].click();
    expect(events).toEqual([{ anchorId: 'altiora.catalog.search', anchorTitle: 'Catalog' }]);
  });

  it('is idempotent — does not double-inject', () => {
    const { rerender } = render(<AnchoredArea />);
    rerender(<AnchoredArea />);
    expect(document.querySelectorAll('.fdv2-explain-trigger').length).toBe(2);
  });
});
