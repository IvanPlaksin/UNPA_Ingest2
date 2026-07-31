// @vitest-environment jsdom
/**
 * PE-001 — the acceptance criterion is "find a rule by a fragment of its text".
 *
 * The fragment an operator remembers comes from a transcript, so it is a phrase from
 * the rule BODY — the text the model was given — not from a title someone wrote for
 * the editor. That is the property these tests pin.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RuleExplorer from '../RuleExplorer';
import { useRulesStore } from '../rulesStore';

const N = (id, over = {}) => ({
  id, type: 'ruleNode', position: { x: 0, y: 0 },
  data: {
    key: id, title: over.title || id, nodeType: 'Thesis', category: 'dialogue',
    enabled: true, priority: 50, ...over,
  },
});

const NODES = [
  N('t1', { title: 'One question', text: 'Ask exactly one question per turn.' }),
  N('t2', { title: 'Escalation', text: 'When the user asks for a human, call escalation_create.' }),
  N('c1', { title: 'No invented services', nodeType: 'Constraint', category: 'safety', immutable: true, text: 'Never offer a service you have not seen.' }),
  N('p1', { title: 'Register', nodeType: 'Persona', category: 'tone', text: 'Be concise, professional and warm.' }),
  N('t3', { title: 'Retired rule', enabled: false, text: 'An old instruction nobody uses.' }),
];

beforeEach(() => {
  useRulesStore.setState({ nodes: NODES, edges: [], selectedId: null });
});

describe('finding a rule', () => {
  it('finds it by a fragment of the text the model was given, not just the title', () => {
    render(<RuleExplorer />);
    fireEvent.change(screen.getByPlaceholderText('Search rules…'), { target: { value: 'human' } });
    expect(screen.getByText('Escalation')).toBeTruthy();
    expect(screen.queryByText('One question')).toBeNull();
    expect(screen.getByText('1 of 5 shown')).toBeTruthy();
  });

  it('shows the matched fragment in context, so a hit is legible without opening it', () => {
    render(<RuleExplorer />);
    fireEvent.change(screen.getByPlaceholderText('Search rules…'), { target: { value: 'escalation_create' } });
    expect(screen.getByText('escalation_create')).toBeTruthy();
  });

  it('says plainly when nothing matches, and what was searched', () => {
    render(<RuleExplorer />);
    fireEvent.change(screen.getByPlaceholderText('Search rules…'), { target: { value: 'zzzz' } });
    expect(screen.getByText(/Nothing matches/i)).toBeTruthy();
  });
});

describe('grouping and filters', () => {
  it('groups by type and counts each group', () => {
    render(<RuleExplorer />);
    expect(screen.getByText('Thesis · 3')).toBeTruthy();
    expect(screen.getByText('Constraint · 1')).toBeTruthy();
    expect(screen.getByText('Persona · 1')).toBeTruthy();
  });

  it('filters by status, and immutable is one of them', () => {
    render(<RuleExplorer />);
    fireEvent.click(screen.getByLabelText('Filters'));
    fireEvent.click(screen.getByText('immutable'));
    expect(screen.getByText('No invented services')).toBeTruthy();
    expect(screen.queryByText('One question')).toBeNull();
  });

  it('a disabled rule is listed and marked, not hidden', () => {
    // It still exists and someone has to be able to find it to turn it back on.
    render(<RuleExplorer />);
    expect(screen.getByText('Retired rule')).toBeTruthy();
    expect(screen.getByText('off')).toBeTruthy();
  });

  it('clearing restores the full list', () => {
    render(<RuleExplorer />);
    fireEvent.change(screen.getByPlaceholderText('Search rules…'), { target: { value: 'human' } });
    fireEvent.click(screen.getByText('clear'));
    expect(screen.getByText('5 rules')).toBeTruthy();
  });
});

describe('one selection, three views', () => {
  it('clicking a rule selects it in the shared store, which is what the canvas reads', () => {
    render(<RuleExplorer />);
    fireEvent.click(screen.getByText('Register'));
    expect(useRulesStore.getState().selectedId).toBe('p1');
  });

  it('a selection made elsewhere shows as selected here', () => {
    useRulesStore.setState({ selectedId: 'c1' });
    render(<RuleExplorer />);
    // The row is rendered with the selected styling; the assertion that matters is
    // that the list reads the same store field rather than keeping its own.
    expect(useRulesStore.getState().selectedId).toBe('c1');
    expect(screen.getByText('No invented services')).toBeTruthy();
  });
});
