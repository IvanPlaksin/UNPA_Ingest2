// @vitest-environment jsdom
/**
 * PE-002 (rationale) and the field-map defect it uncovered.
 *
 * The second half of this file is the more important one. The editor's map of
 * "which field holds this node's text" disagreed with the compiler on two of four
 * types: Narrative and Persona. Those rules showed EMPTY in the editor and saving
 * wrote the operator's words into a field nothing compiles — no error, no diff, just
 * a rule that would not change however carefully it was edited.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  useRulesStore, fromEvolutio, toEvolutio, contentFieldOf, rulesMissingRationale,
} from '../rulesStore';

describe('the editor reads the field the COMPILER reads', () => {
  // evolutio-prompt.compiler bodyOf(): Thesis→assertion, Narrative→framing,
  // Persona→register, Constraint→rule. These names are not derivable from the type.
  const CASES = [
    ['Thesis', 'assertion', 'do the thing'],
    ['Narrative', 'framing', 'you are FlowDesk'],
    ['Persona', 'register', 'be concise and warm'],
    ['Constraint', 'rule', 'never invent a service'],
  ];

  it.each(CASES)('a %s carries its text in `%s`', (type, field, text) => {
    expect(contentFieldOf({ type })).toBe(field);
    const node = fromEvolutio({ nodeId: 'n', type, [field]: text });
    expect(node.data.text).toBe(text);
  });

  it.each(CASES)('editing a %s writes back to `%s`, where it compiles', (type, field, text) => {
    const node = fromEvolutio({ nodeId: 'n', type, [field]: 'old' });
    node.data.text = text;
    expect(toEvolutio(node)[field]).toBe(text);
  });

  it('a Narrative does not silently come back blank', () => {
    // The exact symptom of the bug: `framing` held the text, the editor looked in
    // `narrative`, and 'You are FlowDesk…' rendered as an empty box.
    const node = fromEvolutio({ nodeId: 'story', type: 'Narrative', framing: 'You are FlowDesk.' });
    expect(node.data.text).toBe('You are FlowDesk.');
  });
});

describe('rationale on a new rule (PE-002)', () => {
  beforeEach(() => useRulesStore.setState({ nodes: [], edges: [], selectedId: null, dirty: false }));

  it('a rule added in the editor is new and starts with no reason', () => {
    const id = useRulesStore.getState().addRule({ title: 'Fresh' });
    const n = useRulesStore.getState().nodes.find((x) => x.id === id);
    expect(n.data.isNew).toBe(true);
    expect(n.data.rationale).toBe('');
  });

  it('a new rule without a reason blocks the save, and is named', () => {
    useRulesStore.getState().addRule({ title: 'Fresh' });
    const missing = useRulesStore.getState().missingRationale();
    expect(missing).toHaveLength(1);
    expect(missing[0].title).toBe('Fresh');
  });

  it('whitespace is not a reason', () => {
    const id = useRulesStore.getState().addRule({ title: 'Fresh' });
    useRulesStore.getState().updateRule(id, { rationale: '   ' });
    expect(useRulesStore.getState().missingRationale()).toHaveLength(1);
  });

  it('once given, the save is unblocked and the reason rides on `origin`', () => {
    const id = useRulesStore.getState().addRule({ title: 'Fresh', nodeType: 'Thesis' });
    useRulesStore.getState().updateRule(id, { rationale: 'Users were asked twice.' });
    expect(useRulesStore.getState().missingRationale()).toHaveLength(0);
    const node = useRulesStore.getState().nodes.find((x) => x.id === id);
    expect(toEvolutio(node).origin).toMatchObject({ rationale: 'Users were asked twice.' });
  });

  it('the 22 inherited rules do NOT block anything — that was the decision', () => {
    // They carry `original intent undocumented`, and gating on them would stop all
    // work on the prompt. The gate is on ADDING to the debt.
    const inherited = fromEvolutio({
      nodeId: 'old', type: 'Thesis', assertion: 'x',
      origin: { kind: 'legacy', rationale: 'migrated…, original intent undocumented' },
    });
    expect(rulesMissingRationale([inherited])).toHaveLength(0);
    expect(inherited.data.isNew).toBe(false);
  });

  it('an inherited rule keeps its recorded origin when saved back', () => {
    const inherited = fromEvolutio({
      nodeId: 'old', type: 'Thesis', assertion: 'x',
      origin: { kind: 'legacy', ref: 'afa606a3@v3', rationale: 'migrated' },
    });
    expect(toEvolutio(inherited).origin).toMatchObject({ kind: 'legacy', ref: 'afa606a3@v3' });
  });

  it('saving clears the new flag, so later edits are governed by the change reason', () => {
    const id = useRulesStore.getState().addRule({ title: 'Fresh' });
    useRulesStore.getState().updateRule(id, { rationale: 'because' });
    useRulesStore.getState().setSaved({ entryId: 'e', version: 2 });
    expect(useRulesStore.getState().nodes.find((x) => x.id === id).data.isNew).toBe(false);
  });
});

describe('turning a rule off writes a status the ontology actually has', () => {
  // The editor wrote `RETIRED`, and the EVOLUTIO schema allows exactly
  // CANDIDATE | ACTIVE | DEPRECATED. `saveGraph` validates before writing, so the
  // disable toggle rendered, moved, and made the graph unsaveable — a control that
  // looks like it works and breaks the save it is part of.
  it('disabled becomes DEPRECATED, which the schema allows', () => {
    const node = fromEvolutio({ nodeId: 'r', type: 'Thesis', assertion: 'x', status: 'ACTIVE' });
    node.data.enabled = false;
    expect(toEvolutio(node).status).toBe('DEPRECATED');
  });

  it('and never the invented "RETIRED"', () => {
    const node = fromEvolutio({ nodeId: 'r', type: 'Thesis', assertion: 'x' });
    node.data.enabled = false;
    expect(toEvolutio(node).status).not.toBe('RETIRED');
  });

  it('re-enabling a disabled rule brings it back to ACTIVE', () => {
    // Without this, `status` stayed DEPRECATED while `enabled` said true, and the rule
    // would have been saved off while the toggle claimed it was on.
    const node = fromEvolutio({ nodeId: 'r', type: 'Thesis', assertion: 'x', status: 'DEPRECATED' });
    expect(node.data.enabled).toBe(false);
    node.data.enabled = true;
    expect(toEvolutio(node).status).toBe('ACTIVE');
  });

  it('a CANDIDATE reads as disabled — it has not been accepted yet', () => {
    const node = fromEvolutio({ nodeId: 'r', type: 'Thesis', assertion: 'x', status: 'CANDIDATE' });
    expect(node.data.enabled).toBe(false);
    // Leaving it alone keeps it a candidate: only an explicit toggle promotes it.
    expect(toEvolutio(node).status).toBe('CANDIDATE');
  });
});
