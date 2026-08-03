'use strict';

/**
 * Two faults from session fdv2-7200be16, which are the same fault twice: something
 * that belongs to ONE turn was treated as belonging to the conversation.
 *
 *   - Rows fetched on turn 3 reappeared under every later answer. `session.controls`
 *     was cleared at the start of each turn and `session.cards`, added beside it, was
 *     not — so the list stayed on the session and was re-emitted for the rest of the
 *     conversation.
 *
 *   - Asked what it could do, the assistant listed catalogue SERVICES. A reasonable
 *     guess with no source behind it: nothing told the model what the assistant
 *     itself can do, so it described the nearest list it had.
 */

const { createAgentTools, createToolSession } = require('../agent-tools');

const ctx = () => ({ sessionId: 's1', session: createToolSession(), lang: 'en' });

const TICKET = { rfsNumber: 'SR-1001', Title: 'Education grant claim', Status: 'Open' };

const mk = (over = {}) => createAgentTools({
  draftService: { get: async () => null, create: async () => null, patch: async () => null, discard: async () => true },
  loadSnapshot: async () => null,
  resolveSearch: async () => [],
  ticketList: { listTickets: async () => ({ tickets: [TICKET], totalCount: 1 }) },
  tasksBackend: { listTasks: async () => ({ tasks: [] }) },
  ...over,
});

describe('what the assistant says it can do', () => {
  test('there is a tool for it, so the answer is not improvised', async () => {
    const out = await mk().TOOLS.describe_capabilities({}, ctx());
    expect(out.ok).toBe(true);
    expect(out.capabilities.length).toBeGreaterThan(0);
  });

  test('every capability it claims has a tool behind it', async () => {
    // The list must describe what WORKS, not the finished product. A user told the
    // assistant can do something, who then finds it cannot, was misled by us.
    const tools = mk();
    const out = await tools.TOOLS.describe_capabilities({}, ctx());
    const byId = {
      raise_request: 'draft_create',
      my_requests: 'list_requests',
      my_tasks: 'list_tasks',
      kb_search: 'kb_search',
      self_help: 'describe_capabilities',
    };

    for (const c of out.capabilities) {
      expect(byId[c.id]).toBeDefined();                       // no capability without a mapping
      expect(typeof tools.TOOLS[byId[c.id]]).toBe('function'); // and none without the tool
    }
  });

  test('the model is told to answer from the list and not from the catalogue', async () => {
    const out = await mk().TOOLS.describe_capabilities({}, ctx());
    expect(out.tellUser).toMatch(/ONLY the list/);
    expect(out.tellUser).toMatch(/[Dd]o not list catalogue services/);
  });

  test('the tool is offered to the model, and says when to use it', () => {
    const schema = mk().TOOL_SCHEMAS.find((t) => t.name === 'describe_capabilities');
    expect(schema).toBeDefined();
    expect(schema.description).toMatch(/what you can do/i);
  });
});

describe('rows belong to the turn that fetched them', () => {
  const { createAgentLoop } = require('../agent-loop.service');

  /** A model that replays a script, as in agent-loop.test.js. */
  const scriptedLlm = (script) => {
    const calls = [];
    return {
      calls,
      messages: async (p) => {
        calls.push(p);
        const next = script[Math.min(calls.length - 1, script.length - 1)];
        return { cost: 0, tokens: 10, stopReason: next.stopReason || 'end_turn', ...next };
      },
    };
  };
  const say = (text) => ({ content: [{ type: 'text', text }] });
  const callTool = (name, input = {}) => ({ content: [{ type: 'tool_use', id: 't1', name, input }], stopReason: 'tool_use' });

  const CARD = { type: 'request', id: 'SR-1001', title: 'Education grant claim' };

  /** Tools whose `list_requests` puts a row on the session, as the real one does. */
  const toolsThatList = () => ({
    TOOL_SCHEMAS: [{ name: 'list_requests', description: 'list', input_schema: { type: 'object' } }],
    execute: async (name, _input, c) => {
      if (name === 'list_requests') { c.session.cards = [CARD]; return { ok: true, items: [], ms: 1 }; }
      return { ok: true, ms: 1 };
    },
  });

  const promptService = { build: async () => ({ text: 'SYSTEM', textHash: 'h', manifest: null }) };
  const turn = (session, userMessage) =>
    ({ sessionId: 's1', history: [], userMessage, lang: 'en', session });

  test('the turn that fetched them carries them', async () => {
    const loop = createAgentLoop({ llm: scriptedLlm([callTool('list_requests'), say('Here it is.')]), tools: toolsThatList(), promptService });
    const session = createToolSession();

    const r = await loop.runTurn(turn(session, 'show my last request'));

    expect(r.cards).toEqual([CARD]);
  });

  test('the NEXT turn does not', async () => {
    // The live symptom: ask once, and the same card is attached to every answer for
    // the rest of the conversation. Driven through the loop, because the reset is the
    // loop's — asserting it by clearing the field in the test would only restate the
    // fix rather than check it happens.
    const loop = createAgentLoop({ llm: scriptedLlm([callTool('list_requests'), say('Here it is.'), say('Sure.')]), tools: toolsThatList(), promptService });
    const session = createToolSession();

    await loop.runTurn(turn(session, 'show my last request'));
    const second = await loop.runTurn(turn(session, 'thanks'));

    expect(second.cards).toBeUndefined();
  });
});
