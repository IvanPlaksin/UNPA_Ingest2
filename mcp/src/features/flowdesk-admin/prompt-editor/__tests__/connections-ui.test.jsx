// @vitest-environment jsdom
/**
 * EC-008, on screen — the two behaviours worth asserting through the DOM rather than
 * the store, because both are about what the operator is shown before he acts.
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import ConnectionsSection from '../ConnectionsSection';
import ConditionSection from '../ConditionSection';
import DeleteRuleDialog from '../DeleteRuleDialog';
import { useRulesStore } from '../rulesStore';

const origin = { kind: 'human', rationale: 'r', introducedBy: 't', introducedAt: '2026-07-31T00:00:00.000Z' };
const node = (nodeId, title) => ({
  nodeId, type: 'Thesis', title, status: 'ACTIVE', priority: 100,
  category: 'dialogue', assertion: `${nodeId}.`, origin,
});
const edge = (edgeId, source, target, type, over = {}) => ({ edgeId, source, target, type, ...over });

const load = (nodes, edges) => useRulesStore.getState().loadGraph({
  nodes, edges, entryId: 'e1', name: 'g', namespace: 'EVOLUTIO:PROMPT',
});

beforeEach(() => useRulesStore.getState().reset());

describe('the connections list', () => {
  it('reads as prose in both directions, by title rather than id', () => {
    load(
      [node('a', 'One question per turn'), node('b', 'Tone'), node('c', 'Greeting')],
      [edge('e1', 'a', 'b', 'REFINES'), edge('e2', 'c', 'a', 'REFINES')],
    );
    render(<ConnectionsSection nodeId="a" />);
    expect(screen.getByText('refines')).toBeTruthy();
    expect(screen.getByText('refined by')).toBeTruthy();
    expect(screen.getByText('Tone')).toBeTruthy();
    expect(screen.getByText('Greeting')).toBeTruthy();
  });

  it('does not show a condition as a connection to itself', () => {
    load([node('a', 'One question per turn')], [
      edge('c1', 'a', 'a', 'APPLIES_WHEN', { condition: { phase: ['fill'] } }),
    ]);
    render(<ConnectionsSection nodeId="a" />);
    expect(screen.getByText(/Not connected to any other rule/)).toBeTruthy();
  });

  it('flags a conflict nobody explained, since the next person cannot resolve it', () => {
    load([node('a', 'A'), node('b', 'B')], [edge('e1', 'a', 'b', 'CONFLICTS_WITH')]);
    render(<ConnectionsSection nodeId="a" />);
    expect(screen.getByText('why?')).toBeTruthy();
  });

  it('removing a connection removes exactly that one', () => {
    load([node('a', 'A'), node('b', 'B'), node('c', 'C')],
      [edge('e1', 'a', 'b', 'REFINES'), edge('e2', 'a', 'c', 'ILLUSTRATES')]);
    render(<ConnectionsSection nodeId="a" />);
    fireEvent.click(screen.getByLabelText('remove refines b'));
    expect(useRulesStore.getState().edges.map((e) => e.id)).toEqual(['e2']);
  });
});

describe('warning while drawing a conflict', () => {
  it('appears once the second rule is chosen, and says what will happen', () => {
    load([node('a', 'A'), node('b', 'B')], []);
    render(<ConnectionsSection nodeId="a" />);
    fireEvent.click(screen.getByText('Connect to a rule'));

    // MUI selects are not native inputs; they open a listbox.
    const relation = screen.getByLabelText('Relation');
    fireEvent.mouseDown(relation);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('conflicts with'));

    const which = screen.getByLabelText('Which rule');
    fireEvent.mouseDown(which);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('B'));

    expect(screen.getByText(/validation will refuse it/)).toBeTruthy();
  });
});

describe('deleting a rule other rules are attached to', () => {
  it('names every connection that will break', () => {
    load([node('a', 'One question per turn'), node('b', 'Tone'), node('c', 'Greeting')],
      [edge('e1', 'a', 'b', 'REFINES'), edge('e2', 'c', 'a', 'DEPENDS_ON')]);
    render(<DeleteRuleDialog nodeId="a" open onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText(/break 2 connections/)).toBeTruthy();
    expect(screen.getByText('this rule refines Tone')).toBeTruthy();
    expect(screen.getByText('this rule is required by Greeting')).toBeTruthy();
  });
});

/**
 * EC-009 on screen. The summary is the part that gets read; the controls are the part
 * that gets used once.
 */
describe('the "applies when" section', () => {
  const vocabulary = {
    phase: { values: ['intent', 'fill', 'confirm'] },
    toolContext: { values: ['has_draft', 'no_draft'] },
    language: { values: ['en', 'fr'] },
    serviceCategory: { values: null, free: true },
  };

  it('says a rule is unconditional in words, not by an empty box', () => {
    load([node('a', 'A')], []);
    render(<ConditionSection nodeId="a" vocabulary={vocabulary} />);
    expect(screen.getByText('Always — this rule is in every prompt.')).toBeTruthy();
  });

  it('reads an existing condition as a sentence', () => {
    load([node('a', 'A')], [edge('c1', 'a', 'a', 'APPLIES_WHEN', {
      condition: { phase: ['fill'], toolContext: ['has_draft'] },
    })]);
    render(<ConditionSection nodeId="a" vocabulary={vocabulary} />);
    expect(screen.getByText('Only when the form is being filled and a request is open.')).toBeTruthy();
  });

  it('blocks a condition that can never hold, at the moment it is written', () => {
    load([node('a', 'A')], [edge('c1', 'a', 'a', 'APPLIES_WHEN', {
      condition: { phase: ['fill'], toolContext: ['no_draft'] },
    })]);
    render(<ConditionSection nodeId="a" vocabulary={vocabulary} />);
    expect(screen.getByText(/would never apply/)).toBeTruthy();
  });

  it('clearing it puts the rule back in every prompt', () => {
    load([node('a', 'A')], [edge('c1', 'a', 'a', 'APPLIES_WHEN', { condition: { phase: ['fill'] } })]);
    render(<ConditionSection nodeId="a" vocabulary={vocabulary} />);
    fireEvent.click(screen.getByText('always'));
    expect(useRulesStore.getState().toGraph().edges).toHaveLength(0);
  });

  it('never names the edge it is stored as', () => {
    load([node('a', 'A')], [edge('c1', 'a', 'a', 'APPLIES_WHEN', { condition: { phase: ['fill'] } })]);
    const { container } = render(<ConditionSection nodeId="a" vocabulary={vocabulary} />);
    expect(container.textContent).not.toMatch(/APPLIES_WHEN|edge|self-loop/i);
  });
});
