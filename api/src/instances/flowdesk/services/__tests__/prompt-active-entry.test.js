'use strict';

/**
 * ПР-001/ПР-002/ПР-004 — which graph is the system prompt, and who may say so.
 *
 * Two of these tests guard damage rather than features. `saveGraph` used to
 * substitute the LIVE entry whenever none was given, so "create a new graph" wrote a
 * version onto the running prompt — success reported, assistant quietly changed. And
 * making a graph live is the one setting where a bad value stops every conversation,
 * so each gate here is a hard failure and is asserted as one.
 */

const settings = require('../flowdesk-settings.service');
const editor = require('../prompt-editor.service');

jest.mock('../../schema-graph/driver', () => ({ read: jest.fn(), write: jest.fn() }));
const driver = require('../../schema-graph/driver');

const ENV = process.env.FLOWDESK_AGENT_PROMPT_ENTRY;
const row = (value) => ({ get: () => value });

beforeEach(() => {
  settings._resetCache();
  driver.read.mockReset();
  driver.write.mockReset();
  driver.read.mockResolvedValue([]);
  driver.write.mockResolvedValue([]);
  process.env.FLOWDESK_AGENT_PROMPT_ENTRY = 'env-entry';
  delete process.env.FLOWDESK_AGENT_PROMPT_ENTRY_FORCE;
});
afterAll(() => {
  process.env.FLOWDESK_AGENT_PROMPT_ENTRY = ENV;
  delete process.env.FLOWDESK_AGENT_PROMPT_ENTRY_FORCE;
});

describe('where the live entry comes from', () => {
  test('the environment, when nothing has been chosen', async () => {
    const d = await settings.describeActivePromptEntry();
    expect(d).toMatchObject({ entryId: 'env-entry', source: 'env', editable: true });
  });

  test('the stored choice beats the environment — otherwise the selector does nothing', async () => {
    driver.read.mockResolvedValue([row('chosen-entry')]);
    expect(await settings.getActivePromptEntry()).toBe('chosen-entry');
    expect((await settings.describeActivePromptEntry()).source).toBe('stored');
  });

  test('the force flag beats the stored choice, and the UI is told it is not editable', async () => {
    // The way back when the stored choice is what broke the chat and the admin UI is
    // exactly what cannot be reached.
    driver.read.mockResolvedValue([row('chosen-entry')]);
    process.env.FLOWDESK_AGENT_PROMPT_ENTRY_FORCE = 'true';
    const d = await settings.describeActivePromptEntry();
    expect(d).toMatchObject({ entryId: 'env-entry', source: 'env-forced', editable: false });
    expect(d.notice).toMatch(/would have no effect/);
  });

  test('a storage outage falls back to the environment rather than reporting "no choice"', async () => {
    driver.read.mockRejectedValue(new Error('memgraph down'));
    expect(await settings.getActivePromptEntry()).toBe('env-entry');
  });

  test('…and is not cached as an answer, so the next call tries again', async () => {
    driver.read.mockRejectedValueOnce(new Error('memgraph down'));
    await settings.getActivePromptEntry();
    driver.read.mockResolvedValue([row('chosen-entry')]);
    expect(await settings.getActivePromptEntry()).toBe('chosen-entry');
  });

  test('the resolved choice reaches the synchronous readers through the environment', async () => {
    // Several services read `process.env` directly and cannot await.
    driver.read.mockResolvedValue([row('chosen-entry')]);
    await settings.getActivePromptEntry();
    expect(process.env.FLOWDESK_AGENT_PROMPT_ENTRY).toBe('chosen-entry');
  });
});

describe('making a graph live', () => {
  const good = {
    nodes: [
      {
        nodeId: 'n1', type: 'Thesis', title: 'n1', status: 'ACTIVE', priority: 100,
        category: 'dialogue', assertion: 'Be brief.',
        origin: { kind: 'human', rationale: 'r', introducedBy: 't', introducedAt: '2026-07-31T00:00:00.000Z' },
      },
    ],
    edges: [],
    name: 'A good graph',
  };

  test('stores the choice once the graph has passed every gate', async () => {
    jest.spyOn(editor, 'getGraph').mockResolvedValue(good);
    const out = await settings.setActivePromptEntry('new-entry', { updatedBy: 'ivan' });
    expect(out).toMatchObject({ entryId: 'new-entry', source: 'stored' });
    expect(driver.write).toHaveBeenCalled();
    editor.getGraph.mockRestore();
  });

  test('refuses a graph that is not there', async () => {
    jest.spyOn(editor, 'getGraph').mockResolvedValue(null);
    await expect(settings.setActivePromptEntry('ghost')).rejects.toThrow(/was not found/);
    expect(driver.write).not.toHaveBeenCalled();
    editor.getGraph.mockRestore();
  });

  test('refuses a graph with validation errors, rather than warning about them', async () => {
    // A warning here is an invitation to break the chat: the operator finds out from
    // users, not from the screen.
    jest.spyOn(editor, 'getGraph').mockResolvedValue({ nodes: [{ nodeId: 'x', type: 'Nonsense' }], edges: [] });
    await expect(settings.setActivePromptEntry('bad')).rejects.toThrow(/validation errors/);
    expect(driver.write).not.toHaveBeenCalled();
    editor.getGraph.mockRestore();
  });

  test('refuses a graph that compiles to nothing', async () => {
    jest.spyOn(editor, 'getGraph').mockResolvedValue({ nodes: [], edges: [] });
    await expect(settings.setActivePromptEntry('empty')).rejects.toThrow();
    expect(driver.write).not.toHaveBeenCalled();
    editor.getGraph.mockRestore();
  });

  test('names the context a graph fails in, not just that it failed', async () => {
    jest.spyOn(editor, 'getGraph').mockResolvedValue(good);
    jest.spyOn(editor, 'compile').mockImplementation((g, o) => {
      if (o.phase === 'confirm') throw new Error('boom');
      return { text: 'ok', manifest: { nodes: [{ nodeId: 'n1' }] } };
    });
    // A graph that compiles at rest and throws once the conversation reaches
    // `confirm` would fail mid-dialogue, for some users only.
    await expect(settings.setActivePromptEntry('half')).rejects.toThrow(/confirming/);
    editor.compile.mockRestore();
    editor.getGraph.mockRestore();
  });

  test('requires an entryId at all', async () => {
    await expect(settings.setActivePromptEntry('')).rejects.toThrow(/required/);
  });
});

describe('creating a graph instead of overwriting the live one', () => {
  test('asNew must not be combined with an entryId — the two mean opposite things', async () => {
    await expect(editor.saveGraph({ source: 'agent', asNew: true, entryId: 'e1', nodes: [] }))
      .rejects.toThrow(/contradictory/);
  });

  test('a save with neither an entryId nor a live graph refuses instead of guessing', async () => {
    delete process.env.FLOWDESK_AGENT_PROMPT_ENTRY;
    await expect(editor.saveGraph({ source: 'agent', nodes: [] }))
      .rejects.toThrow(/pass asNew/);
    process.env.FLOWDESK_AGENT_PROMPT_ENTRY = 'env-entry';
  });
});
