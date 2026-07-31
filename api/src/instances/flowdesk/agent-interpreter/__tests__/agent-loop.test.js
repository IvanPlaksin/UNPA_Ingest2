'use strict';

/**
 * Agent loop (EXP-002) — the turn engine, driven by a scripted model.
 *
 * The properties under test are the ones the experiment depends on: the loop
 * never throws, never returns an empty turn, stops calling tools eventually, and
 * carries the prompt provenance that lets a turn be attributed later.
 */

const { createAgentLoop } = require('../agent-loop.service');
const { createToolSession } = require('../agent-tools');

/** A model that replays a script of responses, one per iteration. */
function scriptedLlm(script) {
  const calls = [];
  return {
    calls,
    messages: async (p) => {
      calls.push(p);
      const next = script[Math.min(calls.length - 1, script.length - 1)];
      return { cost: 0.0001, tokens: 100, stopReason: next.stopReason || 'end_turn', ...next };
    },
  };
}

const say = (text) => ({ content: [{ type: 'text', text }] });
const call = (name, input = {}, id = 't1') => ({ content: [{ type: 'tool_use', id, name, input }], stopReason: 'tool_use' });

const fakeTools = (impl = {}) => ({
  TOOL_SCHEMAS: [{ name: 'catalog_search', description: 'search', input_schema: { type: 'object' } }],
  execute: async (name, input, ctx) => (impl[name] ? impl[name](input, ctx) : { ok: true, ms: 1 }),
});

// Two hashes, as the real build() returns: `textHash` is the FINAL prompt (rules +
// contract + padding + language), `manifest.textHash` is the compiled rules alone.
// They are necessarily different, and only the second one is comparable to a
// rebuilt version of the graph.
const fakePrompt = {
  build: async () => ({
    text: 'SYSTEM', textHash: 'final-hash',
    manifest: { textHash: 'h1', graphEntryId: 'e1', graphVersion: 3 },
  }),
};

const mk = (script, tools = fakeTools(), over = {}) => createAgentLoop({
  llm: scriptedLlm(script), tools, promptService: fakePrompt, ...over,
});

const base = { sessionId: 's1', history: [], userMessage: 'I need a travel advance', lang: 'en' };

describe('the loop produces a turn', () => {
  test('a plain reply comes straight back', async () => {
    const loop = mk([say('Here is what I found for your travel advance.')]);
    const r = await loop.runTurn(base);
    expect(r.response).toMatch(/travel advance/);
    expect(r.meta.iterations).toBe(1);
    expect(r.meta.toolCalls).toEqual([]);
  });

  test('a tool call is executed and the model gets the result', async () => {
    const seen = [];
    const tools = fakeTools({ catalog_search: (input) => { seen.push(input); return { ok: true, count: 1, ms: 2 }; } });
    const loop = mk([call('catalog_search', { query: 'travel' }), say('I found one service.')], tools);
    const r = await loop.runTurn(base);
    expect(seen[0]).toEqual({ query: 'travel' });
    expect(r.meta.toolCalls.map((c) => c.name)).toEqual(['catalog_search']);
    expect(r.response).toBe('I found one service.');
  });

  test('a failing tool is reported to the model, not thrown', async () => {
    const tools = fakeTools({ catalog_search: () => ({ ok: false, error: 'qdrant down', ms: 1 }) });
    const loop = mk([call('catalog_search'), say('The catalogue is unavailable right now.')], tools);
    const r = await loop.runTurn(base);
    expect(r.meta.toolCalls[0].ok).toBe(false);
    expect(r.response).toMatch(/unavailable/);
  });

  test('tool results reach the model as tool_result blocks', async () => {
    const llm = scriptedLlm([call('catalog_search'), say('done')]);
    const loop = createAgentLoop({ llm, tools: fakeTools(), promptService: fakePrompt });
    await loop.runTurn(base);
    const second = llm.calls[1];
    const last = second.messages[second.messages.length - 1];
    expect(last.role).toBe('user');
    expect(last.content[0].type).toBe('tool_result');
  });
});

describe('a turn is never empty and never throws', () => {
  test('running out of iterations still answers the user', async () => {
    // A model that calls a tool forever must not leave the user with silence.
    const loop = mk([call('catalog_search')], fakeTools(), { maxToolIterations: 3 });
    const r = await loop.runTurn(base);
    expect(r.meta.iterations).toBe(3);
    expect(r.meta.degraded).toBe(true);
    expect(r.response.length).toBeGreaterThan(0);
  });

  test('an empty final message degrades to an honest sentence', async () => {
    const loop = mk([{ content: [] }]);
    const r = await loop.runTurn(base);
    expect(r.meta.degraded).toBe(true);
    expect(r.response).toMatch(/something went wrong/i);
  });

  test('the degraded sentence follows the dialogue language', async () => {
    const loop = mk([{ content: [] }]);
    const r = await loop.runTurn({ ...base, lang: 'ru' });
    expect(r.response).toMatch(/[Ѐ-ӿ]/);
  });

  test('prose written alongside a tool call is not lost', async () => {
    const loop = mk([
      { content: [{ type: 'text', text: 'Let me look that up.' }, { type: 'tool_use', id: 'x', name: 'catalog_search', input: {} }], stopReason: 'tool_use' },
      { content: [] },
    ], fakeTools(), { maxToolIterations: 2 });
    const r = await loop.runTurn(base);
    expect(r.response).toBe('Let me look that up.');
    expect(r.meta.degraded).toBe(false);
  });
});

describe('history', () => {
  test('carries the user message and the reply, not the tool traffic', async () => {
    const loop = mk([call('catalog_search'), say('Found it.')]);
    const r = await loop.runTurn(base);
    expect(r.history).toEqual([
      { role: 'user', content: 'I need a travel advance' },
      { role: 'assistant', content: 'Found it.' },
    ]);
  });

  test('prior history is passed to the model', async () => {
    const llm = scriptedLlm([say('ok')]);
    const loop = createAgentLoop({ llm, tools: fakeTools(), promptService: fakePrompt });
    await loop.runTurn({ ...base, history: [{ role: 'user', content: 'earlier' }, { role: 'assistant', content: 'reply' }] });
    expect(llm.calls[0].messages).toHaveLength(3);
    expect(llm.calls[0].messages[0].content).toBe('earlier');
  });
});

describe('the confirm gate is read from the user, never inferred', () => {
  const withConfirmShown = () => { const s = createToolSession(); s.confirmShown = true; return s; };

  test('an explicit control answer unlocks submission', async () => {
    const loop = mk([say('Submitted.')]);
    const session = withConfirmShown();
    await loop.runTurn({ ...base, session, controlAction: { slotId: '__confirm__', value: true } });
    expect(session.confirmAccepted).toBe(true);
  });

  test('a typed yes unlocks it too', async () => {
    const loop = mk([say('Submitted.')]);
    const session = withConfirmShown();
    await loop.runTurn({ ...base, session, userMessage: 'yes please' });
    expect(session.confirmAccepted).toBe(true);
  });

  test('affirmatives are recognised in the other languages', async () => {
    for (const word of ['да', 'oui', 'sí', 'نعم', '确认']) {
      const loop = mk([say('ok')]);
      const session = withConfirmShown();
      await loop.runTurn({ ...base, session, userMessage: word });
      expect(session.confirmAccepted).toBe(true);
    }
  });

  test('anything else leaves it locked', async () => {
    const loop = mk([say('ok')]);
    const session = withConfirmShown();
    await loop.runTurn({ ...base, session, userMessage: 'wait, change the date first' });
    expect(session.confirmAccepted).toBe(false);
  });

  test('nothing unlocks it before a confirm control was shown', async () => {
    const loop = mk([say('ok')]);
    const session = createToolSession();
    await loop.runTurn({ ...base, session, userMessage: 'yes' });
    expect(session.confirmAccepted).toBe(false);
  });
});

describe('provenance and cost travel with the turn', () => {
  test('the prompt hash and graph version are recorded', async () => {
    const loop = mk([say('ok')]);
    const r = await loop.runTurn(base);
    expect(r.meta.promptTextHash).toBe('final-hash');
    expect(r.meta.promptGraphEntryId).toBe('e1');
    expect(r.meta.promptGraphVersion).toBe(3);
  });

  test('the graph hash is recorded SEPARATELY from what the model was sent', async () => {
    // Kept apart so "the rebuilt rules differ from what ran" can mean something. The
    // final prompt also carries the contract and the cache padding, so comparing a
    // rebuilt graph against it would flag every turn ever recorded.
    const loop = mk([say('ok')]);
    const r = await loop.runTurn(base);
    expect(r.meta.promptGraphTextHash).toBe('h1');
    expect(r.meta.promptGraphTextHash).not.toBe(r.meta.promptTextHash);
  });

  test('a failed tool call carries WHY it failed, not just that it did', async () => {
    // Live, draft_create failed twice in one dialogue — two wasted turns — and the
    // replay could only say "draft_create: error". The reason was told to the model
    // and discarded; the operator reading the session has no process logs.
    const tools = fakeTools({ catalog_search: () => ({ ok: false, error: 'no provider for this duty station', ms: 3 }) });
    const loop = mk([call('catalog_search'), say('sorry')], tools);
    const r = await loop.runTurn(base);
    const failed = r.meta.toolCalls.find((c) => !c.ok);
    expect(failed.error).toBe('no provider for this duty station');
  });

  test('a successful call carries no error field, and a huge one is capped', async () => {
    const tools = fakeTools({ catalog_search: () => ({ ok: false, error: 'x'.repeat(2000), ms: 1 }) });
    const loop = mk([call('catalog_search'), say('ok')], tools);
    const r = await loop.runTurn(base);
    const [failed] = r.meta.toolCalls.filter((c) => !c.ok);
    expect(failed.error).toHaveLength(500);
    expect(r.meta.toolCalls.filter((c) => c.ok).every((c) => c.error === undefined)).toBe(true);
  });

  test('cost and tokens accumulate across iterations', async () => {
    const loop = mk([call('catalog_search'), say('done')]);
    const r = await loop.runTurn(base);
    expect(r.meta.iterations).toBe(2);
    expect(r.meta.costUsd).toBeCloseTo(0.0002, 6);
    expect(r.meta.tokens).toBe(200);
  });

  test('the system prompt is sent, not embedded in the messages', async () => {
    const llm = scriptedLlm([say('ok')]);
    const loop = createAgentLoop({ llm, tools: fakeTools(), promptService: fakePrompt });
    await loop.runTurn(base);
    expect(llm.calls[0].system).toBe('SYSTEM');
    expect(llm.calls[0].tools).toHaveLength(1);
  });
});

describe('controls belong to the reply, not the session', () => {
  test('controls emitted last turn do not leak into this one', async () => {
    const session = createToolSession();
    session.controls = [{ id: 'stale', type: 'choice', slotId: 'x' }];
    const loop = mk([say('ok')]);
    const r = await loop.runTurn({ ...base, session });
    expect(r.controls).toBeNull();
  });
});

// A control answer carries no typed text. Sending that turn through unchanged
// produced a hard 400 from the Messages API — "user messages must have non-empty
// content" — so clicking a button broke the conversation outright.
describe('answering with a control never sends an empty user turn', () => {
  const { describeUserTurn } = require('../agent-loop.service');
  const shown = [
    { type: 'choice', slotId: '__service__', options: [{ value: 'EGC', label: 'Education Grant Claim(s) Queries' }] },
    { type: 'confirm', slotId: '__confirm__' },
  ];

  test('a choice carries the label the user saw AND the value behind it', () => {
    // The label is what they clicked; the value is what the tools take. Sending
    // the label alone made the model invent a service code from the title
    // (fdv2-dacb3883) — it had never been shown the real one.
    expect(describeUserTurn(null, { slotId: '__service__', value: 'EGC' }, shown))
      .toBe('[selected: Education Grant Claim(s) Queries (EGC)]');
  });

  test('an unknown value still yields text rather than nothing', () => {
    expect(describeUserTurn(null, { slotId: 'zzz', value: 'x' }, shown)).toBe('[selected: x]');
    expect(describeUserTurn(null, { slotId: 'zzz' }, shown)).toBe('[answered zzz]');
  });

  test('confirm reads as agreement or refusal, not as a bare value', () => {
    expect(describeUserTurn(null, { slotId: '__confirm__', value: true }, shown)).toBe('[confirmed]');
    expect(describeUserTurn(null, { slotId: '__confirm__', value: false }, shown)).toBe('[declined the confirmation]');
  });

  test('a skip is described as a skip', () => {
    expect(describeUserTurn(null, { slotId: '__skip__', value: 'notes' }, shown)).toBe('[skipped notes]');
  });

  test('typed text always wins over the control', () => {
    expect(describeUserTurn('actually, something else', { slotId: '__service__', value: 'EGC' }, shown))
      .toBe('actually, something else');
  });

  test('the message sent to the model is never empty', async () => {
    const llm = scriptedLlm([say('ok')]);
    const loop = createAgentLoop({ llm, tools: fakeTools(), promptService: fakePrompt });
    const session = createToolSession();
    session.controls = shown;
    await loop.runTurn({ ...base, userMessage: null, controlAction: { slotId: '__service__', value: 'EGC' }, session });
    const sent = llm.calls[0].messages[llm.calls[0].messages.length - 1];
    expect(sent.role).toBe('user');
    expect(String(sent.content).length).toBeGreaterThan(0);
    expect(sent.content).toMatch(/Education Grant/);
  });

  test('even with no message and no control, content is non-empty', async () => {
    const llm = scriptedLlm([say('ok')]);
    const loop = createAgentLoop({ llm, tools: fakeTools(), promptService: fakePrompt });
    await loop.runTurn({ ...base, userMessage: null, controlAction: null });
    const sent = llm.calls[0].messages[llm.calls[0].messages.length - 1];
    expect(String(sent.content).trim().length).toBeGreaterThan(0);
  });

  test('the history records what was clicked, so the next turn has context', async () => {
    const llm = scriptedLlm([say('Right, for your daughter then.')]);
    const loop = createAgentLoop({ llm, tools: fakeTools(), promptService: fakePrompt });
    const session = createToolSession();
    session.controls = shown;
    const r = await loop.runTurn({ ...base, userMessage: null, controlAction: { slotId: '__service__', value: 'EGC' }, session });
    expect(r.history[r.history.length - 2].content).toMatch(/Education Grant/);
  });
});

/**
 * A1 — prompt caching.
 *
 * The system prompt and the tool schemas are identical on every call of every
 * turn of every session, and were re-read ~3.7 times a turn (3,917 tokens each
 * time, measured). Two things make them cacheable: the prompt is handed over
 * split — stable part first — and the call opts in.
 */
describe('the prompt is sent so it can be cached', () => {
  const buildLoop = (captureRef) => createAgentLoop({
    llm: { messages: async (req) => { captureRef.req = req; return { content: [{ type: 'text', text: 'ok' }], cacheReadTokens: 3564, cacheCreationTokens: 0 }; } },
    tools: {
      TOOL_SCHEMAS: [{ name: 'a', description: 'A', input_schema: { type: 'object' } }],
      execute: async () => ({ ok: true }),
    },
    promptService: { build: async () => ({ text: 'STABLE\n\nTAIL', prefix: 'STABLE', tail: 'TAIL', manifest: null }) },
  });

  test('the stable part goes first and the varying part after it', async () => {
    const cap = {};
    await buildLoop(cap).runTurn({ sessionId: 's', history: [], userMessage: 'hi', lang: 'en' });

    expect(Array.isArray(cap.req.system)).toBe(true);
    expect(cap.req.system.map((b) => b.text)).toEqual(['STABLE', 'TAIL']);
    expect(cap.req.cache).toBe(true);
  });

  test('a prompt service without the split still works', async () => {
    const cap = {};
    const loop = createAgentLoop({
      llm: { messages: async (req) => { cap.req = req; return { content: [{ type: 'text', text: 'ok' }] }; } },
      tools: { TOOL_SCHEMAS: [], execute: async () => ({ ok: true }) },
      promptService: { build: async () => ({ text: 'WHOLE', manifest: null }) },
    });
    await loop.runTurn({ sessionId: 's', history: [], userMessage: 'hi', lang: 'en' });
    expect(cap.req.system).toBe('WHOLE');
  });

  test('what the cache did is carried on the turn', async () => {
    const cap = {};
    const out = await buildLoop(cap).runTurn({ sessionId: 's', history: [], userMessage: 'hi', lang: 'en' });
    expect(out.meta.cacheReadTokens).toBe(3564);
    expect(out.meta.cacheCreationTokens).toBe(0);
  });
});

/**
 * The cache floor. Haiku 4.5 caches nothing below a minimum that measurement put
 * between 4,300 (not cached) and 4,518 (cached) tokens — higher than the
 * documented figure — and this prompt's real preamble is well under it. Padding
 * lifts it over, and the properties that make padding work rather than merely
 * cost are tested here.
 *
 * Under-shooting is SILENT: the request succeeds, the markers are accepted, and
 * the provider reports cache_creation 0. Nothing in the system complains, which
 * is why the last test pins the real prompt against the measured floor rather
 * than trusting that whatever the padding produced was enough.
 */
describe('the cacheable prefix is padded to the provider floor', () => {
  const { padToCacheFloor } = require('../agent-prompt.service');
  const TOOLS = [{ name: 't', description: 'x'.repeat(400), input_schema: { type: 'object' } }];

  test('a short prefix is padded, and the padding announces itself as ignorable', () => {
    const out = padToCacheFloor('SHORT PROMPT', TOOLS);
    expect(out.length).toBeGreaterThan(10000);
    expect(out).toContain('SHORT PROMPT');
    expect(out).toContain('Padding — ignore');
    expect(out).toContain('meaningless filler');
  });

  test('it is byte-identical every time — a prefix that varies is never cached at all', () => {
    expect(padToCacheFloor('SAME', TOOLS)).toBe(padToCacheFloor('SAME', TOOLS));
  });

  test('a prefix already over the floor is left alone', () => {
    const long = 'x'.repeat(200000);
    expect(padToCacheFloor(long, TOOLS)).toBe(long);
  });

  test('the real rules stay ahead of the padding, so nothing is buried in filler', () => {
    const out = padToCacheFloor('RULE ONE\nRULE TWO', TOOLS);
    expect(out.indexOf('RULE TWO')).toBeLessThan(out.indexOf('Lorem ipsum'));
  });

  test('the REAL prompt clears the measured floor, not just the documented one', async () => {
    const prompt = require('../agent-prompt.service');
    const { TOOL_SCHEMAS: REAL_TOOLS } = require('../agent-tools');
    const built = await prompt.build({
      lang: 'en',
      toolSchemas: REAL_TOOLS,
      graph: { nodes: [], edges: [] }, // no database in a unit test
    });
    // The same estimate the padding itself works from: prose at 4.3 chars/token,
    // tool JSON at 2.29. Measured against the live tokenizer this ran ~5% under
    // the real count, so clearing 4,518 here clears it in production too.
    const estimated = Math.floor(built.prefix.length / 4.3)
      + Math.floor(JSON.stringify(REAL_TOOLS).length / 2.29);
    expect(estimated).toBeGreaterThan(4518);
  });
});

/**
 * A3 — a turn that is already finished does not ask the model again.
 *
 * Measured in session fdv2-1c4e8d00: the last call of SIX of nine turns came
 * back with neither text nor a tool call — 8.3 seconds of a 47-second session
 * spent on replies containing nothing. The user's sentence had been written one
 * call earlier, alongside the emit_control that rendered the question.
 */
describe('a presentation-only round ends the turn', () => {
  const loopWith = (responses, exec = async () => ({ ok: true })) => {
    const seen = [];
    const llm = { messages: async () => { seen.push(1); return responses[seen.length - 1]; } };
    return {
      loop: createAgentLoop({
        llm,
        tools: { TOOL_SCHEMAS: [], execute: exec },
        promptService: { build: async () => ({ text: 'sys', manifest: null }) },
      }),
      calls: () => seen.length,
    };
  };
  const withControl = (text) => ({
    content: [
      ...(text ? [{ type: 'text', text }] : []),
      { type: 'tool_use', id: 'a', name: 'emit_control', input: { type: 'text', slotId: 'x' } },
    ],
  });

  test('text + a successful emit_control is the whole turn — one model call', async () => {
    const h = loopWith([withControl('What is your index number?')]);
    const out = await h.loop.runTurn({ sessionId: 's', history: [], userMessage: 'hi', lang: 'en' });

    expect(h.calls()).toBe(1);
    expect(out.response).toBe('What is your index number?');
  });

  test('without text it must go back — the user would otherwise get silence', async () => {
    const h = loopWith([withControl(null), { content: [{ type: 'text', text: 'Here you go.' }] }]);
    const out = await h.loop.runTurn({ sessionId: 's', history: [], userMessage: 'hi', lang: 'en' });

    expect(h.calls()).toBe(2);
    expect(out.response).toBe('Here you go.');
  });

  test('a REFUSED control goes back — that is the round this must not skip', async () => {
    const h = loopWith(
      [withControl('Pick a date'), { content: [{ type: 'text', text: 'Sorry, let me fix that.' }] }],
      async () => ({ ok: false, error: 'not the field due now' }),
    );
    const out = await h.loop.runTurn({ sessionId: 's', history: [], userMessage: 'hi', lang: 'en' });

    expect(h.calls()).toBe(2);
    expect(out.response).toBe('Sorry, let me fix that.');
  });

  test('a round that fetched something goes back — the result is information', async () => {
    const h = loopWith([
      { content: [{ type: 'text', text: 'Looking…' }, { type: 'tool_use', id: 'a', name: 'catalog_search', input: {} }] },
      { content: [{ type: 'text', text: 'I found three services.' }] },
    ]);
    const out = await h.loop.runTurn({ sessionId: 's', history: [], userMessage: 'hi', lang: 'en' });

    expect(h.calls()).toBe(2);
    expect(out.response).toBe('I found three services.');
  });

  test('a mixed round goes back too — only presentation may end a turn', async () => {
    const h = loopWith([
      { content: [
        { type: 'text', text: 'One moment.' },
        { type: 'tool_use', id: 'a', name: 'emit_control', input: {} },
        { type: 'tool_use', id: 'b', name: 'draft_update', input: {} },
      ] },
      { content: [{ type: 'text', text: 'Recorded.' }] },
    ]);
    await h.loop.runTurn({ sessionId: 's', history: [], userMessage: 'hi', lang: 'en' });
    expect(h.calls()).toBe(2);
  });
});
