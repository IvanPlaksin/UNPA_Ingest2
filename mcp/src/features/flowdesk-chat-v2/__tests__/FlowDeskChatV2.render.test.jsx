import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import FlowDeskChatV2 from '../FlowDeskChatV2.jsx';
import { useChatStore } from '../store/chat-store';
import fdv2i18n, { setLang } from '../i18n';

/**
 * F9 + F9.3 render smoke — mounts the isolated chat tree in jsdom. English is the
 * default UI language; switching to another UN language re-renders the strings.
 */
describe('FlowDeskChatV2 renders (English default)', () => {
  beforeEach(() => {
    cleanup();
    setLang('en');
    useChatStore.getState().actions.resetSession();
  });

  it('mounts header, empty state, composer and disabled voice controls in English', () => {
    render(<FlowDeskChatV2 />);
    expect(screen.getByText('FlowDesk Assistant')).toBeTruthy();
    expect(screen.getByText('v2')).toBeTruthy();
    expect(screen.getByText('How can I help?')).toBeTruthy();
    expect(screen.getByPlaceholderText('Describe what you need…')).toBeTruthy();
    expect(screen.getByLabelText('Voice input — coming soon').disabled).toBe(true);
    expect(screen.getByText('No service selected yet.')).toBeTruthy();
  });

  it('language switcher changes the UI language (en → ru)', () => {
    render(<FlowDeskChatV2 />);
    const select = screen.getByLabelText('Interface language');
    fireEvent.change(select, { target: { value: 'ru' } });
    expect(screen.getByText('Чем могу помочь?')).toBeTruthy();
    expect(screen.getByPlaceholderText('Опишите, что вам нужно…')).toBeTruthy();
  });

  it('Arabic sets RTL direction on the root', () => {
    render(<FlowDeskChatV2 />);
    fireEvent.change(screen.getByLabelText('Interface language'), { target: { value: 'ar' } });
    const root = document.querySelector('.fdv2-root');
    expect(root.getAttribute('dir')).toBe('rtl');
  });

  it('renders assistant markdown + user bubble from store state', () => {
    setLang('en');
    const { actions } = useChatStore.getState();
    actions.addMessage('user', 'need a laptop');
    actions.addMessage('assistant', 'Here is a **list**:\n\n- Laptop\n- Badge');
    render(<FlowDeskChatV2 />);
    expect(screen.getByText('need a laptop')).toBeTruthy();
    expect(screen.getByText('list').tagName.toLowerCase()).toBe('strong');
  });
});
