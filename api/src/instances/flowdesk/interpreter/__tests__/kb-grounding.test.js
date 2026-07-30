'use strict';

/**
 * FIX-D3 — deterministic KB grounding & refusal (D3).
 *   FIX-D3-001: INFO_QUESTION with zero retrieval → fixed localized refusal, NO LLM call.
 *   FIX-D3-002: KB answer generation pins temperature 0.1 (info/anchor paths).
 * The MockLLMProvider records every call, so "the LLM was not called" and
 * "temperature 0.1 was passed" are both directly assertable.
 */

const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');
const directory = require('../../services/directory');
const { ui: uiStrings } = require('../templates/ui-strings');

const ARTICLE = { type: 'ARTICLE', articleId: 'KB-1', title: 'Home leave', answerSnippet: 'Home leave is granted every 24 months.', sourceCollection: 'altiora_knowledge', score: 0.82 };

function makeKbEngine(resolveSearch) {
  const loadSnapshot = async () => null;
  const store = new Map();
  const draftService = createDraftSRService({
    store: {
      async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; },
      async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; },
    },
    loadSnapshot, graphWrite: async () => [],
    now: () => Date.parse('2026-07-14T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
  });
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => (schema.properties?.route ? { route: 'INFO_QUESTION' } : {}),
    completion: () => 'Grounded answer from the knowledge base.',
  });
  const engine = createEngine({ llm, resolveSearch, draftService, loadSnapshot, directory, injectContext: false });
  return { engine, llm };
}
const completions = (llm) => llm.calls.filter((c) => c.method === 'completion');

describe('FIX-D3-001: deterministic refusal on zero retrieval (infoAnswer)', () => {
  test('zero hits → kbNoAnswer template, NO llm.completion call', async () => {
    const { engine, llm } = makeKbEngine(async () => []);
    const r = await engine.runTurn({ sessionId: 'k1', message: 'what is the home leave policy?', lang: 'en' });
    expect(r.route).toBe('INFO_QUESTION');
    expect(r.responseType).toBe('kb_no_answer');
    expect(r.response).toBe(uiStrings('en').agent.kbNoAnswer);
    expect(r.sources).toEqual([]);
    expect(completions(llm)).toHaveLength(0); // the LLM was never asked to answer
  });

  test('with hits → LLM answers (grounded) and sources[] emitted', async () => {
    const { engine, llm } = makeKbEngine(async () => [ARTICLE]);
    const r = await engine.runTurn({ sessionId: 'k2', message: 'home leave?', lang: 'en' });
    expect(r.route).toBe('INFO_QUESTION');
    expect(r.responseType).not.toBe('kb_no_answer');
    expect(completions(llm)).toHaveLength(1);
    expect(completions(llm)[0].prompt).toContain('Home leave'); // snippet grounded into the prompt
    expect(Array.isArray(r.sources) && r.sources.length).toBeGreaterThan(0);
  });
});

describe('FIX-D3-002: pinned temperature on KB answer generation', () => {
  test('infoAnswer passes temperature 0.1', async () => {
    const { engine, llm } = makeKbEngine(async () => [ARTICLE]);
    await engine.runTurn({ sessionId: 'k3', message: 'home leave?', lang: 'en' });
    expect(completions(llm)[0].opts).toMatchObject({ temperature: 0.1 });
  });

  test('anchorExplain passes temperature 0.1 (semantic fallback path)', async () => {
    const { engine, llm } = makeKbEngine(async () => [ARTICLE]);
    const r = await engine.runTurn({ sessionId: 'k4', anchor: { id: 'anchor.x', title: 'Home leave' }, lang: 'en' });
    expect(r.route).toBe('ANCHOR_EXPLAIN');
    expect(completions(llm)).toHaveLength(1);
    expect(completions(llm)[0].opts).toMatchObject({ temperature: 0.1 });
  });
});

describe('FIX-D3-001: refusal is localized (6 UN languages)', () => {
  test.each(['en', 'ru', 'fr', 'es', 'ar', 'zh'])('zero-hit refusal in %s', async (lang) => {
    const { engine } = makeKbEngine(async () => []);
    const r = await engine.runTurn({ sessionId: `kloc-${lang}`, message: 'unknown topic', lang });
    expect(r.response).toBe(uiStrings(lang).agent.kbNoAnswer);
    expect(r.responseType).toBe('kb_no_answer');
  });
});
