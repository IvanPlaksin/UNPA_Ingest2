import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * TOUR-003/004 — the tour's navigation of this application, tested as navigation
 * rather than as method calls.
 *
 * The adapter exists so a scenario never contains a URL and never reaches for a DOM
 * node: it asks for a tab by name and for an object by id, and this file is what
 * keeps those names honest. A tab renamed in the router with the map left behind
 * would send every tour to the overview page and report success while doing it.
 *
 * `reveal` is the assistant's answer to "where is it?", and it used to say nothing
 * about where it had put the thing — so a caller could not distinguish a successful
 * reveal from a no-op. It now names the anchor it made visible, and these tests
 * assert that name, because the tour's next step points at it.
 */

vi.mock('../../api/adminClient', () => ({
  getSessions: vi.fn(async () => ({ items: [] })),
  promptGetGraph: vi.fn(async () => ({ nodes: [] })),
  promptListGraphs: vi.fn(async () => [{ id: 'g1', name: 'Graph' }]),
}));

const { createFlowdeskHostAdapter } = await import('../flowdeskHostAdapter');

/** Every tab this admin section has, by the name a scenario uses. */
const TABS = [
  'overview', 'sessions', 'quality', 'prompt', 'catalog',
  'schemas', 'sync', 'tickets', 'llm', 'permissions',
];

let path;
let navigate;
const mk = (startPath = '/flowdesk-admin') => {
  path = startPath;
  navigate = vi.fn((p) => { path = p; });
  return createFlowdeskHostAdapter({
    navigate, getPath: () => path, registry: { get: () => null, all: () => [] },
  });
};

beforeEach(() => { vi.clearAllMocks(); });

describe('every tab of flowdesk-admin is reachable by name', () => {
  it.each(TABS)('navigates to "%s"', async (target) => {
    // Start on a path that is not any tab, so every target is a real move. Starting
    // on a tab makes THAT tab a no-op, which the assertion would misread as failure.
    const a = mk('/somewhere-else');
    const r = await a.navigate({ type: 'tab', target });
    expect(r.ok).toBe(true);
    expect(navigate).toHaveBeenCalled();
    expect(path.startsWith('/flowdesk-admin')).toBe(true);
  });

  it('a tab this application does not have is refused by NAME, not guessed at', () => {
    // The alternative — falling through to the overview — is how a renamed tab
    // becomes a tour that silently visits the wrong page for months.
    return mk().navigate({ type: 'tab', target: 'nonexistent' }).then((r) => {
      expect(r.ok).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  it('the tab already open is not navigated to again', async () => {
    const a = mk('/flowdesk-admin/prompt');
    const r = await a.navigate({ type: 'tab', target: 'prompt' });
    expect(r.ok).toBe(true);
    expect(r.alreadyThere).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('showing one object by id', () => {
  it('a rule lands on the properties panel, and says so', async () => {
    // The anchor name is not decoration: the tour's next step points at it.
    const a = mk();
    const r = await a.reveal({ domain: 'rules', id: 'tone-professional' });
    expect(r).toMatchObject({ ok: true, anchorId: 'editor.properties' });
    expect(path).toContain('tone-professional');
  });

  it('a session lands where its rules are read', async () => {
    const a = mk();
    const r = await a.reveal({ domain: 'sessions', id: 'fdv2-abc' });
    expect(r).toMatchObject({ ok: true, anchorId: 'session.turn.rules' });
    expect(path).toContain('fdv2-abc');
  });

  it('a graph lands on the selector — the control that owns it', async () => {
    const a = mk();
    expect(await a.reveal({ domain: 'graphs', id: 'g1' }))
      .toMatchObject({ ok: true, anchorId: 'editor.graphSelector' });
  });

  it('a version lands in the editor, where its history lives', async () => {
    const a = mk();
    expect(await a.reveal({ domain: 'versions', id: '8' })).toMatchObject({ ok: true });
  });

  it('a schema lands on the schemas tab', async () => {
    const a = mk();
    const r = await a.reveal({ domain: 'schemas', id: '4' });
    expect(r.ok).toBe(true);
    expect(path).toContain('/schemas/4');
  });

  it('reports that it did nothing when the object is already on screen', async () => {
    // Otherwise the caller cannot tell "shown" from "was already there", and a tour
    // that navigates to where it is loses the user's scroll position for no reason.
    const a = mk('/flowdesk-admin/sessions/fdv2-abc');
    const r = await a.reveal({ domain: 'sessions', id: 'fdv2-abc' });
    expect(r).toMatchObject({ ok: true, alreadyVisible: true });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('a domain this application cannot show is refused with a reason', async () => {
    const r = await mk().reveal({ domain: 'invoices', id: '1' });
    expect(r).toMatchObject({ ok: false, reason: 'not_supported' });
  });

  it('an id that is missing is refused rather than navigated to blindly', async () => {
    const r = await mk().reveal({ domain: 'rules', id: '' });
    expect(r.ok).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('a tour walks: navigate, then reveal', () => {
  it('the chain a scenario actually performs does not break', async () => {
    const a = mk();
    expect((await a.navigate({ type: 'tab', target: 'prompt' })).ok).toBe(true);
    const r = await a.reveal({ domain: 'rules', id: 'safety-no-invent' });
    expect(r.ok).toBe(true);
    expect(path).toContain('safety-no-invent');
  });
});

describe('what the adapter admits it cannot do', () => {
  it('declares its capabilities rather than failing at the moment of use', async () => {
    // The tour reads this before it offers an action, so a step that cannot run is
    // not offered — rather than offered and then failing in front of the user.
    const caps = await mk().capabilities();
    expect(caps.navigation.tabs).toBe(true);
    expect(caps.query.sessions).toBe(true);
    expect(caps.interact.select).toBe(true);
  });

  it('refuses a navigation type it has not implemented, by name', async () => {
    const r = await mk().navigate({ type: 'teleport', target: 'x' });
    expect(r).toMatchObject({ ok: false, reason: 'not_supported' });
  });
});
