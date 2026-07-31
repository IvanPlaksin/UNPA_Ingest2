// @vitest-environment jsdom
/**
 * The React bindings, driven end to end against a fake knowledge provider.
 *
 * The core is covered by the package's own Node tests; what those cannot reach is the
 * part that only exists in a browser — a component declaring an anchor as it mounts,
 * the spotlight finding the element, and the panel saying something true when it does
 * not. That is what this file exercises.
 *
 * A fake provider rather than the HTTP one on purpose: this is a test of the bindings,
 * and reaching for the network would make it a test of the network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import {
  TourProvider, TourSpotlight, TourPanel, TourAssistant, useTourAnchor, useTour,
} from '@guided-ux/tour/react';

const SCENARIO = {
  id: 'demo',
  name: { en: 'A short tour' },
  entry: 's1',
  steps: [
    { id: 's1', content: { title: { en: 'Welcome' }, text: { en: 'This tour has three steps.' } }, next: 's2' },
    { id: 's2', anchorId: 'demo.always', content: { text: { en: 'This panel is always here.' } }, next: 's3' },
    { id: 's3', anchorId: 'demo.sometimes', content: { text: { en: 'This one appears only when you open it.' } } },
  ],
};

const provider = {
  capabilities: () => ({ vectorSearch: true, graph: true, languages: ['en'] }),
  listScenarios: async () => [{ id: 'demo', name: SCENARIO.name, steps: 3 }],
  getScenario: async (id) => {
    if (id !== 'demo') throw new Error(`no scenario "${id}"`);
    return SCENARIO;
  },
  search: vi.fn(async () => [
    { id: 'h1', text: 'The rules in force are the ones compiled into that version.', kind: 'step', stepId: 's2', source: 'test' },
  ]),
};

/** A host component that declares two anchors, one of which comes and goes. */
function Host({ onStart, showOptional = true, ask }) {
  const [open, setOpen] = useState(false);
  const alwaysRef = useTourAnchor('demo.always', { label: 'Always here' });
  const sometimesRef = useTourAnchor('demo.sometimes', {
    label: 'Sometimes here', route: '/somewhere', available: () => open,
  });
  return (
    <>
      <button type="button" onClick={onStart}>start tour</button>
      <div ref={alwaysRef} data-testid="always">always</div>
      {showOptional && <div ref={sometimesRef} data-testid="sometimes">sometimes</div>}
      <button type="button" onClick={() => setOpen(true)}>open it</button>
      <TourSpotlight />
      <TourPanel />
      <TourAssistant ask={ask} />
    </>
  );
}

/** A host adapter that can search and move, as the protocol asks. */
const hostAdapter = (over = {}) => ({
  hostType: 'test-spa',
  capabilities: () => ({
    navigation: { routes: true, tabs: true, modals: false, drawers: true, anchors: true },
    query: { sessions: true },
    interact: { select: true, expand: true, focus: true, highlight: true },
    constraints: { maxQueryResults: 5 },
  }),
  navigate: vi.fn(async () => ({ ok: true })),
  query: vi.fn(async () => ({
    ok: true, total: 1, items: [{
      id: 'fdv2-abc', domain: 'sessions', title: 'Ivan · Education grant',
      snippet: '2026-07-30 · 12 turns',
      revealIntent: { domain: 'sessions', id: 'fdv2-abc', select: true },
    }],
  })),
  reveal: vi.fn(async () => ({ ok: true })),
  interact: vi.fn(async () => ({ ok: true })),
  ...over,
});

function Harness({ showOptional = true, ask, narrator, adapter }) {
  const [starter, setStarter] = useState(null);
  return (
    <TourProvider provider={provider} lang="en" waitMs={0} narrator={narrator} adapter={adapter}>
      <Inner setStarter={setStarter} showOptional={showOptional} ask={ask} />
    </TourProvider>
  );
}

// Split so the launcher can reach the context the provider creates.
function Inner({ showOptional, ask }) {
  const tour = useTour();
  return <Host onStart={() => tour.start('demo')} showOptional={showOptional} ask={ask} />;
}

beforeEach(() => { provider.search.mockClear(); });

describe('a tour running against a real component tree', () => {
  it('walks from a narration step to an anchored one and spotlights it', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('start tour'));

    await waitFor(() => expect(screen.getByText('This tour has three steps.')).toBeTruthy());
    expect(screen.getByText('STEP 1 OF 3')).toBeTruthy();

    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('This panel is always here.')).toBeTruthy());
  });

  it('a step whose anchor is declared-but-unavailable BLOCKS and says why', async () => {
    // `available: () => open` is false until the host opens it. The tour must not
    // point at it, and must not pretend the step does not exist either.
    render(<Harness />);
    fireEvent.click(screen.getByText('start tour'));
    await waitFor(() => screen.getByText('This tour has three steps.'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('This panel is always here.'));
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText(/is not usable right now/i)).toBeTruthy());
    // Blocked, so the way forward is offered as a skip rather than a plain "next".
    expect(screen.getByText('Skip this step')).toBeTruthy();
  });

  it('a step whose anchor was never rendered says it is not on screen, and where it lives', async () => {
    render(<Harness showOptional={false} />);
    fireEvent.click(screen.getByText('start tour'));
    await waitFor(() => screen.getByText('This tour has three steps.'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('This panel is always here.'));
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText(/not on screen/i)).toBeTruthy());
  });

  it('a scenario that will not load fails loudly instead of opening an empty overlay', async () => {
    function BadInner() {
      const tour = useTour();
      return <button type="button" onClick={() => tour.start('missing')}>go</button>;
    }
    render(
      <TourProvider provider={provider} lang="en" waitMs={0}>
        <BadInner />
        <TourPanel />
      </TourProvider>,
    );
    fireEvent.click(screen.getByText('go'));
    await waitFor(() => expect(screen.getByText(/could not be loaded/i)).toBeTruthy());
  });
});

describe('the assistant', () => {
  it('opening it pauses the tour and silences narration', async () => {
    const narrator = { speak: vi.fn(), prefetch: vi.fn(), stop: vi.fn(), setEnabled: vi.fn(), enabled: true };
    render(<Harness narrator={narrator} />);
    fireEvent.click(screen.getByText('start tour'));
    await waitFor(() => screen.getByText('This tour has three steps.'));
    expect(narrator.speak).toHaveBeenCalled();

    fireEvent.click(screen.getByText('🤖 Ask'));
    await waitFor(() => expect(screen.getByText('Ask about this tour')).toBeTruthy());
    // Talking over someone asking a question is the rudest thing this could do.
    expect(narrator.stop).toHaveBeenCalled();
    expect(screen.getByText(/tour is paused on/i)).toBeTruthy();
  });

  it('answers from the provider and offers to take the user to the step it found', async () => {
    const ask = vi.fn(async () => 'In force means the rule was compiled into that version.');
    render(<Harness ask={ask} />);
    fireEvent.click(screen.getByText('start tour'));
    await waitFor(() => screen.getByText('This tour has three steps.'));
    fireEvent.click(screen.getByText('🤖 Ask'));

    fireEvent.change(screen.getByPlaceholderText('What does this do?'), { target: { value: 'what is in force' } });
    await act(async () => { fireEvent.click(screen.getByText('Ask')); });

    await waitFor(() => expect(screen.getByText(/In force means the rule was compiled/)).toBeTruthy());
    expect(provider.search).toHaveBeenCalled();
    // The hit names a step, so the best answer is to go there.
    expect(screen.getByText('Take me there')).toBeTruthy();
  });

  it('with no `ask`, it shows what it found rather than inventing an answer', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('start tour'));
    await waitFor(() => screen.getByText('This tour has three steps.'));
    fireEvent.click(screen.getByText('🤖 Ask'));
    fireEvent.change(screen.getByPlaceholderText('What does this do?'), { target: { value: 'anything' } });
    await act(async () => { fireEvent.click(screen.getByText('Ask')); });

    await waitFor(() => expect(screen.getByText('Found in the tour')).toBeTruthy());
  });
});

describe('the three faults reported from the first live run', () => {
  it('the speaker button toggles, and turning it on speaks the step you are looking at', async () => {
    // It read `narrator.enabled` off the object: clicking mutated the object, React
    // never re-rendered, and the button kept its old icon while nothing happened.
    let enabled = false;
    const narrator = {
      get enabled() { return enabled; },
      setEnabled: vi.fn((v) => { enabled = v; }),
      speak: vi.fn(), prefetch: vi.fn(), stop: vi.fn(),
    };
    render(<Harness narrator={narrator} />);
    fireEvent.click(screen.getByText('start tour'));
    await waitFor(() => screen.getByText('This tour has three steps.'));

    const muted = screen.getByTitle('Narrate this tour');
    expect(muted).toBeTruthy();
    fireEvent.click(muted);

    await waitFor(() => expect(screen.getByTitle('Mute narration')).toBeTruthy());
    expect(narrator.setEnabled).toHaveBeenCalledWith(true);
    // …and it speaks THIS step, rather than waiting for the next one.
    expect(narrator.speak).toHaveBeenCalledWith('This tour has three steps.');
  });

  it('the counter shows a position in the scenario, never a visit count', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('start tour'));
    await waitFor(() => screen.getByText('STEP 1 OF 3'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('STEP 2 OF 3'));
    fireEvent.click(screen.getByText('Back'));
    await waitFor(() => screen.getByText('STEP 1 OF 3'));
    fireEvent.click(screen.getByText('Next'));
    // Was "STEP 3 OF 3" here, and kept climbing past the end on a longer tour.
    await waitFor(() => expect(screen.getByText('STEP 2 OF 3')).toBeTruthy());
  });

  it('the step text appears at once, without waiting for its anchor', async () => {
    // The anchor for s3 is unavailable, so the old code sat on the timeout before
    // rendering anything and the button looked dead.
    render(<Harness />);
    fireEvent.click(screen.getByText('start tour'));
    await waitFor(() => screen.getByText('This tour has three steps.'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('This panel is always here.'));

    fireEvent.click(screen.getByText('Next'));
    // Synchronously after the click: the step is on screen before its anchor is known.
    expect(screen.getByText('This one appears only when you open it.')).toBeTruthy();
  });
});

describe('Host Adapter Protocol — the bridge between the tour and the application', () => {
  it('the assistant finds a real record and OFFERS to show it', async () => {
    // Ivan's case: "where is the session where someone asked about the grant?" — the
    // answer is a record in the application, not a passage in the tour.
    const adapter = hostAdapter();
    render(<Harness adapter={adapter} />);
    fireEvent.click(screen.getByText('start tour'));
    await waitFor(() => screen.getByText('This tour has three steps.'));
    fireEvent.click(screen.getByText('🤖 Ask'));

    fireEvent.change(screen.getByPlaceholderText('What does this do?'), { target: { value: 'education grant session' } });
    await act(async () => { fireEvent.click(screen.getByText('Ask')); });

    await waitFor(() => expect(screen.getByText('Found in this application')).toBeTruthy());
    expect(screen.getByText('Ivan · Education grant')).toBeTruthy();
    expect(adapter.query).toHaveBeenCalled();
    // Proposed, not performed: revealing is a mutation and the assistant may not do it.
    expect(adapter.reveal).not.toHaveBeenCalled();
  });

  it('the USER pressing "Show me" is what performs the reveal', async () => {
    const adapter = hostAdapter();
    render(<Harness adapter={adapter} />);
    fireEvent.click(screen.getByText('start tour'));
    await waitFor(() => screen.getByText('This tour has three steps.'));
    fireEvent.click(screen.getByText('🤖 Ask'));
    fireEvent.change(screen.getByPlaceholderText('What does this do?'), { target: { value: 'grant' } });
    await act(async () => { fireEvent.click(screen.getByText('Ask')); });
    await waitFor(() => screen.getByText('Show me'));

    await act(async () => { fireEvent.click(screen.getByText('Show me')); });
    expect(adapter.reveal).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'sessions', id: 'fdv2-abc' }),
    );
  });

  it('without an adapter the assistant still answers, and asks the host nothing', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('start tour'));
    await waitFor(() => screen.getByText('This tour has three steps.'));
    fireEvent.click(screen.getByText('🤖 Ask'));
    fireEvent.change(screen.getByPlaceholderText('What does this do?'), { target: { value: 'anything' } });
    await act(async () => { fireEvent.click(screen.getByText('Ask')); });

    await waitFor(() => expect(screen.getByText('Found in the tour')).toBeTruthy());
    expect(screen.queryByText('Found in this application')).toBeNull();
  });
});
