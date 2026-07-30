import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k, o) => ({ 'navigate.goThere': 'Go there', 'navigate.goTo': `Navigate to ${o?.path ?? ''}` }[k] || k) }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import NavigateLink from '../NavigateLink.jsx';

describe('NavigateLink (Phase 5)', () => {
  it('renders a "Go there" button when navigate + onNavigate are provided', () => {
    render(<NavigateLink navigate={{ path: '/catalog', highlight: 'portal-catalog-search' }} onNavigate={() => {}} />);
    const btn = screen.getByRole('button', { name: 'Navigate to /catalog' });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('Go there');
  });

  it('calls onNavigate with the target on click', () => {
    const onNavigate = vi.fn();
    const target = { path: '/requests', highlight: 'portal-header-nav' };
    render(<NavigateLink navigate={target} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onNavigate).toHaveBeenCalledWith(target);
  });

  it('renders nothing without a navigate target', () => {
    const { container } = render(<NavigateLink navigate={null} onNavigate={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the host provides no onNavigate handler', () => {
    const { container } = render(<NavigateLink navigate={{ path: '/catalog' }} />);
    expect(container.firstChild).toBeNull();
  });
});
