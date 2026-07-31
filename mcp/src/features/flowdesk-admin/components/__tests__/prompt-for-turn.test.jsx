// @vitest-environment jsdom
/**
 * PE-006 — the panel's job is as much about what it refuses to say as what it shows.
 *
 * "In force" is a fact the data supports; "caused" is a hypothesis only the arena can
 * test. These tests pin that wording, and pin the four different meanings of an empty
 * rule list apart from each other — collapsing them would make "we lost the record"
 * look exactly like "no rules applied".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import PromptForTurnView from '../PromptForTurnView';

const rulesForTurn = vi.fn();
vi.mock('../../api/adminClient', () => ({
  promptRulesForTurn: (...a) => rulesForTurn(...a),
}));

const TURN = (over = {}) => ({
  seq: 3, turnId: 't3', ts: '2026-07-30T10:00:00Z', durationMs: 1200,
  turnAuthor: 'model', routerReason: 'free_text',
  promptGraphEntryId: 'agent-entry', promptGraphVersion: 4, promptProvenanceSource: 'turn',
  ...over,
});

const OK = {
  status: 'ok', notice: null, ruleCount: 2, hashMatches: true,
  rules: [
    { nodeId: 'n1', type: 'Thesis', compilesField: 'assertion', category: 'dialogue', immutable: false, text: 'Ask one question per turn.' },
    { nodeId: 'n2', type: 'Constraint', compilesField: 'rule', category: 'safety', immutable: true, text: 'Never invent a service.' },
  ],
};

beforeEach(() => { rulesForTurn.mockReset(); });

describe('rules in force on a turn', () => {
  it('says IN FORCE, and never claims a rule caused the turn', async () => {
    rulesForTurn.mockResolvedValue(OK);
    const { container } = render(<PromptForTurnView turns={[TURN()]} />);
    fireEvent.click(screen.getByText('Turn 3'));
    await waitFor(() => expect(screen.getByText('2 rules in force')).toBeTruthy());
    const text = container.textContent.toLowerCase();
    expect(text).not.toMatch(/caused|because of this rule|responsible for/);
  });

  it('shows the field each node type compiles, so the legacy copy is not edited', async () => {
    rulesForTurn.mockResolvedValue(OK);
    render(<PromptForTurnView turns={[TURN()]} />);
    fireEvent.click(screen.getByText('Turn 3'));
    await waitFor(() => expect(screen.getByText('assertion')).toBeTruthy());
    expect(screen.getByText('rule')).toBeTruthy();
  });

  it('a template turn says no prompt governed it — not "0 rules"', async () => {
    rulesForTurn.mockResolvedValue({
      status: 'template', ruleCount: 0, rules: [],
      notice: 'No prompt governed this turn. The hybrid interpreter answered the click from the form field\'s own prompt hint.',
    });
    render(<PromptForTurnView turns={[TURN({ turnAuthor: 'template', routerReason: 'template' })]} />);
    fireEvent.click(screen.getByText('Turn 3'));
    await waitFor(() => expect(screen.getByText(/No prompt governed this turn/i)).toBeTruthy());
    expect(screen.queryByText(/rules in force/)).toBeNull();
  });

  it('a turn recorded before the provenance fix says so, and lists nothing', async () => {
    rulesForTurn.mockResolvedValue({
      status: 'unattributable', ruleCount: 0, rules: [],
      notice: 'Provenance recorded before the telemetry fix… The rules in force for this turn cannot be recovered.',
    });
    render(<PromptForTurnView turns={[TURN({ promptProvenanceSource: null })]} />);
    fireEvent.click(screen.getByText('Turn 3'));
    await waitFor(() => expect(screen.getByText(/cannot be recovered/i)).toBeTruthy());
  });

  it('a rebuild that disagrees with the record is flagged rather than shown as fact', async () => {
    rulesForTurn.mockResolvedValue({ ...OK, hashMatches: false, notice: 'The rebuilt rules differ from the ones recorded for this turn.' });
    render(<PromptForTurnView turns={[TURN()]} />);
    fireEvent.click(screen.getByText('Turn 3'));
    await waitFor(() => expect(screen.getByText(/rebuilt rules differ/i)).toBeTruthy());
    expect(screen.queryByText('matches the record')).toBeNull();
  });
});

describe('the session header counts', () => {
  it('separates template turns from model turns, and names what cannot be attributed', () => {
    render(<PromptForTurnView turns={[
      TURN({ seq: 1, turnId: 'a', turnAuthor: 'model' }),
      TURN({ seq: 2, turnId: 'b', turnAuthor: 'template' }),
      TURN({ seq: 3, turnId: 'c', turnAuthor: null, promptProvenanceSource: null }),
    ]} />);
    // Only turns that RECORDED an author are counted. The third has none, and
    // counting it as "model" would invent a fact about a turn we cannot attribute.
    expect(screen.getByText('1 template · 1 model')).toBeTruthy();
    expect(screen.getByText('1 unattributable')).toBeTruthy();
  });

  it('nothing is fetched until a turn is opened — a session can hold dozens', () => {
    render(<PromptForTurnView turns={[TURN(), TURN({ seq: 4, turnId: 't4' })]} />);
    expect(rulesForTurn).not.toHaveBeenCalled();
  });
});
