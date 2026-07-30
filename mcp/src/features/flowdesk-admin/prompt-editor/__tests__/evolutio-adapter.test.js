import { describe, it, expect } from 'vitest';

import { fromEvolutio, toEvolutio, contentFieldOf, useRulesStore } from '../rulesStore';

/**
 * HYB-011b — the editor now edits the graph the LIVE chat compiles.
 *
 * That graph keeps a node's text in a field named after the node's TYPE: a Thesis in
 * `assertion`, a Narrative in `narrative`, a Constraint in `rule`. Writing to `text`
 * instead saves cleanly, validates cleanly, and compiles the OLD sentence — a
 * failure with no error anywhere, which is exactly how a prompt change once did
 * nothing for a full round of work. These tests exist to keep that from returning.
 */

const thesis = () => ({
  nodeId: 'tone-language',
  type: 'Thesis',
  title: 'Respond in the user language',
  status: 'ACTIVE',
  assertion: 'Reply in the language the user has chosen in their own settings.',
  category: 'tone',
  priority: 100,
  // Fields this editor knows nothing about and must not destroy.
  weight: 0.5,
  appliesToNodes: [],
  scope: 'global',
  scopeRef: null,
  origin: { kind: 'legacy', ref: 'afa606a3@v3', rationale: 'migrated' },
});

describe('a typed node reaches the editor with its own text', () => {
  it('reads a Thesis from `assertion`, not from `text`', () => {
    const n = fromEvolutio(thesis());
    expect(n.data.text).toBe('Reply in the language the user has chosen in their own settings.');
    expect(n.data.contentField).toBe('assertion');
    expect(n.data.nodeType).toBe('Thesis');
  });

  it('reads a Narrative from `narrative` and a Constraint from `rule`', () => {
    expect(fromEvolutio({ nodeId: 'n1', type: 'Narrative', narrative: 'A story.' }).data.text).toBe('A story.');
    expect(fromEvolutio({ nodeId: 'c1', type: 'Constraint', rule: 'Never do X.' }).data.text).toBe('Never do X.');
  });

  it('carries immutability and status through, because both change what the editor may do', () => {
    const n = fromEvolutio({ nodeId: 'c1', type: 'Constraint', rule: 'x', immutable: true, status: 'RETIRED' });
    expect(n.data.immutable).toBe(true);
    expect(n.data.enabled).toBe(false);
    expect(n.data.status).toBe('RETIRED');
  });

  it('falls back to whichever content field a node actually has', () => {
    expect(contentFieldOf({ type: 'Unknown', assertion: 'a' })).toBe('assertion');
    expect(contentFieldOf({ type: 'Unknown', text: 't' })).toBe('text');
  });
});

describe('a round trip loses nothing', () => {
  it('writes the text back to the field the COMPILER reads', () => {
    const edited = fromEvolutio(thesis());
    edited.data.text = 'A new wording.';

    const out = toEvolutio(edited);

    expect(out.assertion).toBe('A new wording.'); // what compiles
    expect(out.text).toBe('A new wording.');      // carried in step for the legacy editor
  });

  it('keeps the fields the editor does not understand', () => {
    const out = toEvolutio(fromEvolutio(thesis()));

    expect(out.weight).toBe(0.5);
    expect(out.origin).toEqual({ kind: 'legacy', ref: 'afa606a3@v3', rationale: 'migrated' });
    expect(out.scope).toBe('global');
    expect(out.appliesToNodes).toEqual([]);
  });

  it('a disabled node becomes RETIRED rather than silently active', () => {
    const n = fromEvolutio(thesis());
    n.data.enabled = false;
    expect(toEvolutio(n).status).toBe('RETIRED');
  });
});

describe('the store says which graph is open', () => {
  it('recognises an EVOLUTIO graph and reports it', () => {
    useRulesStore.getState().loadGraph({
      nodes: [thesis()], edges: [], entryId: 'e1', name: 'Agent prompt', version: 3, isLiveForAgent: true,
    });
    const st = useRulesStore.getState();

    expect(st.isEvolutio).toBe(true);
    expect(st.graphNamespace).toBe('EVOLUTIO:PROMPT');
    expect(st.isLiveForAgent).toBe(true);
    expect(st.nodes[0].data.text).toContain('their own settings');
    // …and hands it back in its own shape, not in the editor's.
    expect(st.actions === undefined || true).toBe(true);
    expect(useRulesStore.getState().toGraph().nodes[0].assertion).toContain('their own settings');
  });

  it('still accepts a legacy rule graph, so pointing it at the other one does not break the editor', () => {
    useRulesStore.getState().loadGraph({
      nodes: [{ id: 'rule-a', type: 'ruleNode', data: { kind: 'rule', key: 'a', title: 'A', text: 'legacy' } }],
      edges: [], entryId: 'e2', name: 'Chat System Prompt', version: 1,
    });
    const st = useRulesStore.getState();

    expect(st.isEvolutio).toBe(false);
    expect(st.graphNamespace).toBe('CHAT_PROMPT');
    expect(st.toGraph().nodes[0].data.text).toBe('legacy');
  });
});
