import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatStore } from '../chat-store';
import fdv2i18n, { setLang } from '../../i18n';

function reset() {
  useChatStore.setState({ user: null, messages: [] });
}

describe('Feature: user profile + personalized greeting', () => {
  beforeEach(() => { reset(); setLang('en'); });

  it('setUser seeds a greeting by FIRST name in the selected language', () => {
    useChatStore.getState().actions.setUser({ userId: 'u1', firstName: 'Ivan', lastName: 'Petrov' });
    const msgs = useChatStore.getState().messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe('assistant');
    expect(msgs[0].content).toContain('Ivan');
    expect(msgs[0].content).not.toContain('Petrov'); // by first name, not surname
    expect(msgs[0].metadata.responseType).toBe('greeting');
  });

  it('greets in the selected language (ru)', () => {
    setLang('ru');
    useChatStore.getState().actions.setUser({ userId: 'u1', firstName: 'Иван' });
    expect(useChatStore.getState().messages[0].content).toContain('Здравствуйте');
    expect(useChatStore.getState().messages[0].content).toContain('Иван');
  });

  it('falls back to the first token of displayName when firstName is absent', () => {
    useChatStore.getState().actions.setUser({ userId: 'u2', displayName: 'Anne Simone Serret' });
    expect(useChatStore.getState().messages[0].content).toContain('Anne');
    expect(useChatStore.getState().messages[0].content).not.toContain('Serret');
  });

  it('setUser is idempotent for the same userId (no duplicate greeting)', () => {
    const { setUser } = useChatStore.getState().actions;
    setUser({ userId: 'u1', firstName: 'Ivan' });
    setUser({ userId: 'u1', firstName: 'Ivan' });
    expect(useChatStore.getState().messages).toHaveLength(1);
  });

  it('does not greet when the thread already has messages', () => {
    useChatStore.getState().actions.addMessage('user', 'hi');
    useChatStore.getState().actions.setUser({ userId: 'u1', firstName: 'Ivan' });
    // user set, but no greeting prepended (thread not empty)
    expect(useChatStore.getState().messages.filter((m) => m.metadata?.responseType === 'greeting')).toHaveLength(0);
  });

  it('ignores a profile without a userId', () => {
    useChatStore.getState().actions.setUser({ firstName: 'Nobody' });
    expect(useChatStore.getState().messages).toHaveLength(0);
    expect(useChatStore.getState().user).toBeNull();
  });
});
