'use strict';

/**
 * Phase 1 "Show sources" — sources[] assembly (unit) + end-to-end emission on the
 * INFO_QUESTION route (integration). Light-fields MVP: id/title/collection/
 * relevance/snippet (no UN provenance yet — PHASE0 F3).
 */

const { buildSources, truncate, round2, MAX_SOURCES, SNIPPET_MAX } = require('../sources');
const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');

const article = (id, score, extra = {}) => ({
  type: 'ARTICLE', articleId: id, title: `Article ${id}`, sourceCollection: 'altiora_knowledge',
  answerSnippet: `Snippet for ${id}`, score, ...extra,
});

describe('buildSources (unit)', () => {
  test('happy path: 3 hits → 3 sources, correct fields, sorted by relevance', () => {
    const out = buildSources([article('a', 0.6), article('b', 0.9), article('c', 0.7)]);
    expect(out.map((s) => s.id)).toEqual(['b', 'c', 'a']); // desc by relevance
    expect(out[0]).toEqual({ id: 'b', title: 'Article b', collection: 'altiora_knowledge', relevance: 0.9, snippet: 'Snippet for b' });
  });

  test('deduplication: same articleId twice → 1 source (highest score kept)', () => {
    const out = buildSources([article('dup', 0.4), article('dup', 0.82), article('other', 0.5)]);
    expect(out).toHaveLength(2);
    const dup = out.find((s) => s.id === 'dup');
    expect(dup.relevance).toBe(0.82);
  });

  test('empty hits → [] (never undefined)', () => {
    expect(buildSources([])).toEqual([]);
    expect(buildSources(null)).toEqual([]);
    expect(buildSources(undefined)).toEqual([]);
  });

  test('truncation: 300-char snippet → ≤200 chars with ellipsis', () => {
    const long = 'x'.repeat(300);
    const [s] = buildSources([article('t', 0.5, { answerSnippet: long })]);
    expect(s.snippet.length).toBe(SNIPPET_MAX);
    expect(s.snippet.endsWith('…')).toBe(true);
  });

  test('max limit: 10 hits → 5 sources (top by relevance)', () => {
    const many = Array.from({ length: 10 }, (_, i) => article(`x${i}`, i / 10));
    const out = buildSources(many);
    expect(out).toHaveLength(MAX_SOURCES);
    expect(out[0].id).toBe('x9'); // 0.9 is highest
    expect(out.map((s) => s.relevance)).toEqual([0.9, 0.8, 0.7, 0.6, 0.5]);
  });

  test('relevance rounding: 0.87654 → 0.88', () => {
    const [s] = buildSources([article('r', 0.87654)]);
    expect(s.relevance).toBe(0.88);
  });

  test('falls back to summary when no answerSnippet; missing fields tolerated', () => {
    const [s] = buildSources([{ type: 'ARTICLE', articleId: 'm', score: 0.5, summary: 'sum' }]);
    expect(s).toEqual({ id: 'm', title: 'm', collection: '', relevance: 0.5, snippet: 'sum' });
  });

  test('entries without an id are ignored', () => {
    expect(buildSources([{ type: 'ARTICLE', title: 'no id', score: 0.9 }])).toEqual([]);
  });
});

describe('helpers (unit)', () => {
  test('truncate: short string unchanged, blank → undefined', () => {
    expect(truncate('hi', 10)).toBe('hi');
    expect(truncate('   ')).toBeUndefined();
    expect(truncate(null)).toBeUndefined();
  });
  test('round2: non-numeric → 0', () => {
    expect(round2('x')).toBe(0);
    expect(round2(0.125)).toBe(0.13);
  });
});

describe('INFO_QUESTION emits sources[] end-to-end (integration)', () => {
  const makeEngine = (articles) => {
    const llm = new MockLLMProvider({
      structured: (_p, schema) => (schema.properties && schema.properties.route ? { route: 'INFO_QUESTION' } : {}),
      completion: () => 'Here is what the knowledge base says.',
    });
    return createEngine({
      injectContext: false,
      llm,
      resolveSearch: async () => articles,
      draftService: { get: async () => null },
      loadSnapshot: async () => null,
    });
  };

  test('answer carries deduped, sorted sources from ARTICLE hits', async () => {
    const engine = makeEngine([article('kb1', 0.91), article('kb2', 0.7), article('kb1', 0.3)]);
    const r = await engine.runTurn({ sessionId: 'info-1', message: 'what documents do I need for separation?' });
    expect(r.route).toBe('INFO_QUESTION');
    expect(Array.isArray(r.sources)).toBe(true);
    expect(r.sources.map((s) => s.id)).toEqual(['kb1', 'kb2']);
    expect(r.sources[0]).toMatchObject({ id: 'kb1', relevance: 0.91, collection: 'altiora_knowledge' });
  });

  test('no ARTICLE hits → sources is [] (not undefined)', async () => {
    const engine = makeEngine([{ type: 'SERVICE', serviceId: 'svc', title: 'Some service', score: 0.8 }]);
    const r = await engine.runTurn({ sessionId: 'info-2', message: 'how do I request advance home leave?' });
    expect(r.route).toBe('INFO_QUESTION');
    expect(r.sources).toEqual([]);
  });
});

describe('ANCHOR_EXPLAIN zero-query (Phase 4, integration)', () => {
  // Spy router: throws if the ROUTER LLM is ever consulted, proving the anchor
  // path bypasses it. Records the search query the handler used.
  const makeEngine = (articles) => {
    const seen = { query: null, routerCalled: false };
    const llm = new MockLLMProvider({
      structured: (_p, schema) => {
        if (schema.properties && schema.properties.route) { seen.routerCalled = true; return { route: 'INFO_QUESTION' }; }
        return {};
      },
      completion: () => 'This element lets you raise a request. Here is how to use it.',
    });
    const engine = createEngine({
      injectContext: false,
      llm,
      resolveSearch: async (q) => { seen.query = q; return articles; },
      draftService: { get: async () => null },
      loadSnapshot: async () => null,
    });
    return { engine, seen };
  };

  test('anchor click explains from KB, carries sources, sets route, and SKIPS the router', async () => {
    const { engine, seen } = makeEngine([article('kbA', 0.88), article('kbB', 0.6)]);
    const r = await engine.runTurn({ sessionId: 'anc-1', anchor: { id: 'altiora.leave.form', title: 'Leave Request Form' } });
    expect(r.route).toBe('ANCHOR_EXPLAIN');
    expect(r.response).toMatch(/element|request/i);
    expect(r.sources.map((s) => s.id)).toEqual(['kbA', 'kbB']);
    expect(seen.routerCalled).toBe(false);          // ROUTER bypassed
    expect(seen.query).toBe('Leave Request Form');   // searched by the anchor title
  });

  test('no KB hits → graceful fallback message, empty sources, still ANCHOR_EXPLAIN', async () => {
    const { engine } = makeEngine([{ type: 'SERVICE', serviceId: 'svc', title: 'x', score: 0.9 }]);
    const r = await engine.runTurn({ sessionId: 'anc-2', anchor: { id: 'altiora.mystery', title: 'Mystery Widget' }, lang: 'en' });
    expect(r.route).toBe('ANCHOR_EXPLAIN');
    expect(r.sources).toEqual([]);
    expect(r.response).toMatch(/don't have specific information about "Mystery Widget"/);
  });

  test('title missing → falls back to the anchor id as the search query', async () => {
    const { engine, seen } = makeEngine([article('kbA', 0.7)]);
    const r = await engine.runTurn({ sessionId: 'anc-3', anchor: { id: 'altiora.only.id' } });
    expect(r.route).toBe('ANCHOR_EXPLAIN');
    expect(seen.query).toBe('altiora.only.id');
  });

  test('a normal turn (no anchor) still goes through the ROUTER', async () => {
    const { engine, seen } = makeEngine([]);
    const r = await engine.runTurn({ sessionId: 'anc-4', message: 'what do I need for separation?' });
    expect(seen.routerCalled).toBe(true);
    expect(r.route).toBe('INFO_QUESTION');
  });

  // Phase 8: graph-driven — anchorExplain explains from EXPLAINS-linked KB first.
  test('graph-driven: curated EXPLAINS edges are used, semantic search is NOT called', async () => {
    let semanticCalled = false;
    const llm = new MockLLMProvider({
      structured: (_p, schema) => (schema.properties && schema.properties.route ? { route: 'INFO_QUESTION' } : {}),
      completion: () => 'Curated explanation of the element.',
    });
    const getAnchorKB = async (id) => (id === 'altiora.requests.list'
      ? [{ articleId: 'KB-GEN-002', title: 'Check status', snippet: 'Give me the SR number.', collection: 'altiora_knowledge' }] : []);
    const engine = createEngine({
      injectContext: false, llm, getAnchorKB,
      resolveSearch: async () => { semanticCalled = true; return []; },
      draftService: { get: async () => null }, loadSnapshot: async () => null,
    });
    const r = await engine.runTurn({ sessionId: 'anc-g1', anchor: { id: 'altiora.requests.list', title: 'Your Requests' } });
    expect(r.route).toBe('ANCHOR_EXPLAIN');
    expect(r.sources.map((s) => s.id)).toEqual(['KB-GEN-002']);
    expect(r.sources[0].relevance).toBe(1);        // curated → authoritative
    expect(semanticCalled).toBe(false);            // graph edges used, no Qdrant
  });

  test('no EXPLAINS edges → falls back to semantic-by-title search', async () => {
    let semanticQuery = null;
    const llm = new MockLLMProvider({
      structured: (_p, schema) => (schema.properties && schema.properties.route ? { route: 'INFO_QUESTION' } : {}),
      completion: () => 'text',
    });
    const engine = createEngine({
      injectContext: false, llm,
      getAnchorKB: async () => [],   // anchor has no curated edges
      resolveSearch: async (q) => { semanticQuery = q; return [article('kbX', 0.7)]; },
      draftService: { get: async () => null }, loadSnapshot: async () => null,
    });
    const r = await engine.runTurn({ sessionId: 'anc-g2', anchor: { id: 'altiora.tasks.list', title: 'Your Tasks' } });
    expect(r.route).toBe('ANCHOR_EXPLAIN');
    expect(semanticQuery).toBe('Your Tasks');
    expect(r.sources.map((s) => s.id)).toEqual(['kbX']);
  });
});

describe('SITE_NAVIGATE (Phase 5, integration)', () => {
  // Router returns SITE_NAVIGATE; the nav extraction returns whatever `pick` says.
  const makeEngine = (pick) => {
    const llm = new MockLLMProvider({
      structured: (_p, schema) => {
        if (schema.properties && schema.properties.route) return { route: 'SITE_NAVIGATE' };
        if (schema.properties && schema.properties.target) return { target: pick };
        return {};
      },
      completion: () => 'text',
    });
    return createEngine({ injectContext: false, llm, resolveSearch: async () => [], draftService: { get: async () => null }, loadSnapshot: async () => null });
  };

  test('valid target → navigate {path, highlight} + friendly text, no sources', async () => {
    const engine = makeEngine('catalog');
    const r = await engine.runTurn({ sessionId: 'nav-1', message: 'open the service catalog', lang: 'en' });
    expect(r.route).toBe('SITE_NAVIGATE');
    expect(r.navigate).toEqual({ path: '/catalog', highlight: 'portal-catalog-search' });
    expect(r.response).toMatch(/Service Catalog/);
    expect(r.sources).toBeUndefined();
  });

  test('target without a highlight → navigate has only path', async () => {
    const engine = makeEngine('home');
    const r = await engine.runTurn({ sessionId: 'nav-2', message: 'go home' });
    expect(r.navigate).toEqual({ path: '/' });
  });

  test('NONE / unknown target → text only, no navigate field', async () => {
    const engine = makeEngine('NONE');
    const r = await engine.runTurn({ sessionId: 'nav-3', message: 'take me to the secret menu', lang: 'en' });
    expect(r.route).toBe('SITE_NAVIGATE');
    expect(r.navigate).toBeUndefined();
    expect(r.response).toMatch(/not sure which page/i);
  });
});
