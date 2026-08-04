'use strict';

const {
  WorkspaceHybridRetriever,
  RadixRetriever,
  createRadixRetriever,
  MockStrategy,
  createDefaultStrategies
} = require('../index');
const { validateContextBundle, DEFAULT_CONFIG } = require('../contracts/context-bundle');

const silentLogger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };

const embedding = () => new Array(8).fill(0.1);

/** Embedding service that mirrors the real one's return shape. */
const okEmbedder = () => ({ embed: jest.fn().mockResolvedValue({ embedding: embedding() }) });

const candidate = (id, score = 0.9, metadata = {}) => ({
  id,
  type: 'entity',
  content: `Description of ${id}`,
  contentRaw: null,
  score,
  provenance: { sourceId: `src_${id}`, sourceType: 'DRAFT_ENTITY' },
  metadata: { name: id, ...metadata }
});

const seedStrategy = (name, candidates, options = {}) => new MockStrategy(
  { logger: silentLogger },
  {
    metadata: { name, type: 'seed', description: name, version: '1.0.0' },
    candidates,
    ...options
  }
);

const expansionStrategy = (name, candidates, options = {}) => new MockStrategy(
  { logger: silentLogger },
  {
    metadata: { name, type: 'expansion', description: name, version: '1.0.0' },
    candidates,
    ...options
  }
);

/**
 * Pass-through reranker. These tests are about orchestration, and the real
 * RerankerService would reach for a live LLM — turning unit tests into network
 * tests and making the timing assertions below meaningless.
 */
const noopReranker = () => ({
  rerank: jest.fn().mockImplementation(
    async (query, candidates) => ({ candidates, reranked: false, rerankedCount: 0, ms: 0 })
  )
});

/**
 * No connectors → single default section. Injected so these tests never reach a
 * live Memgraph: the production factory resolves a real connector service, and
 * letting that default through turns unit tests into integration tests.
 */
const noConnectors = () => ({ resolveForRetrieval: jest.fn().mockResolvedValue([]) });

const build = (strategies, deps = {}) => new WorkspaceHybridRetriever({
  strategies,
  embeddingService: okEmbedder(),
  reranker: noopReranker(),
  connectorService: noConnectors(),
  logger: silentLogger,
  ...deps
});

describe('Radix Orchestrator: WorkspaceHybridRetriever', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('happy path', () => {
    it('returns a valid ContextBundle', async () => {
      const retriever = build([seedStrategy('vector-seed', [candidate('a'), candidate('b')])]);
      const bundle = await retriever.retrieve('ws_1', 'find auth logic');

      expect(validateContextBundle(bundle)).toEqual({ valid: true, errors: [] });
      expect(bundle.workspaceId).toBe('ws_1');
      expect(bundle.query).toBe('find auth logic');
      expect(bundle.elements).toHaveLength(2);
      expect(bundle.assembledContext).toContain('Relevant context');
    });

    it('embeds the query once and hands it to seed strategies', async () => {
      const embedder = okEmbedder();
      const strategy = seedStrategy('vector-seed', [candidate('a')]);
      const spy = jest.spyOn(strategy, '_execute');

      const retriever = build([strategy], { embeddingService: embedder });
      await retriever.retrieve('ws_1', 'query text');

      expect(embedder.embed).toHaveBeenCalledTimes(1);
      expect(embedder.embed).toHaveBeenCalledWith('query text');
      expect(spy.mock.calls[0][0].queryEmbedding).toEqual(embedding());
    });

    it('feeds merged seeds into the expansion phase', async () => {
      const expansion = expansionStrategy('k-hop-expansion', [candidate('c')]);
      const spy = jest.spyOn(expansion, '_execute');

      const retriever = build([
        seedStrategy('vector-seed', [candidate('a')]),
        seedStrategy('fulltext-seed', [candidate('b')]),
        expansion
      ]);
      await retriever.retrieve('ws_1', 'query');

      const seedsSeen = spy.mock.calls[0][0].seeds;
      expect(seedsSeen.map((s) => s.id).sort()).toEqual(['a', 'b']);
    });

    it('omits queryEmbedding unless asked for it', async () => {
      const retriever = build([seedStrategy('vector-seed', [candidate('a')])]);

      const off = await retriever.retrieve('ws_1', 'q');
      expect(off.queryEmbedding).toBeNull();

      const on = await retriever.retrieve('ws_1', 'q', { includeQueryEmbedding: true });
      expect(on.queryEmbedding).toEqual(embedding());
    });
  });

  describe('parallelism', () => {
    it('runs seed strategies concurrently, not one after another', async () => {
      const retriever = build([
        seedStrategy('s1', [candidate('a')], { delayMs: 60 }),
        seedStrategy('s2', [candidate('b')], { delayMs: 60 }),
        seedStrategy('s3', [candidate('c')], { delayMs: 60 })
      ]);

      const started = Date.now();
      const bundle = await retriever.retrieve('ws_1', 'q', { strategyTimeoutMs: 1000 });
      const elapsed = Date.now() - started;

      expect(bundle.elements).toHaveLength(3);
      expect(elapsed).toBeLessThan(150); // sequential would be ~180ms
    });

    it('runs expansion strategies concurrently', async () => {
      const retriever = build([
        seedStrategy('s1', [candidate('a')]),
        expansionStrategy('e1', [candidate('b')], { delayMs: 60 }),
        expansionStrategy('e2', [candidate('c')], { delayMs: 60 })
      ]);

      const started = Date.now();
      await retriever.retrieve('ws_1', 'q', { strategyTimeoutMs: 1000 });

      expect(Date.now() - started).toBeLessThan(150);
    });

    it('runs the phases in order — expansion cannot start before seeds finish', async () => {
      const order = [];
      const seed = seedStrategy('s1', [candidate('a')], { delayMs: 40 });
      const expansion = expansionStrategy('e1', [candidate('b')]);

      jest.spyOn(seed, '_execute').mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 40));
        order.push('seed');
        return [candidate('a')];
      });
      jest.spyOn(expansion, '_execute').mockImplementation(async () => {
        order.push('expansion');
        return [candidate('b')];
      });

      await build([expansion, seed]).retrieve('ws_1', 'q', { strategyTimeoutMs: 1000 });

      expect(order).toEqual(['seed', 'expansion']);
    });
  });

  describe('timeouts', () => {
    it('fails a strategy that overruns its budget', async () => {
      const retriever = build([
        seedStrategy('fast', [candidate('a')]),
        seedStrategy('slow', [candidate('b')], { delayMs: 300 })
      ]);

      const bundle = await retriever.retrieve('ws_1', 'q', { strategyTimeoutMs: 50 });

      expect(bundle.stats.failedStrategies).toEqual(['slow']);
      expect(bundle.elements.map((e) => e.id)).toEqual(['a']);
    });

    it('one slow strategy does not hold up the phase', async () => {
      const retriever = build([
        seedStrategy('fast', [candidate('a')]),
        seedStrategy('slow', [candidate('b')], { delayMs: 5000 })
      ]);

      const started = Date.now();
      await retriever.retrieve('ws_1', 'q', { strategyTimeoutMs: 60 });

      expect(Date.now() - started).toBeLessThan(400);
    });

    it('a timed-out strategy contributes no candidates', async () => {
      const retriever = build([
        seedStrategy('slow', [candidate('a'), candidate('b')], { delayMs: 300 })
      ]);

      const bundle = await retriever.retrieve('ws_1', 'q', { strategyTimeoutMs: 40 });

      expect(bundle.elements).toEqual([]);
      expect(bundle.stats.candidatesFromSeed).toBe(0);
    });
  });

  describe('graceful degradation', () => {
    it('returns an empty bundle when every strategy fails, without throwing', async () => {
      const retriever = build([
        seedStrategy('s1', [], { throwError: new Error('Qdrant unavailable') }),
        expansionStrategy('e1', [], { throwError: new Error('Memgraph unavailable') })
      ]);

      const bundle = await retriever.retrieve('ws_1', 'q');

      expect(bundle.elements).toEqual([]);
      expect(bundle.assembledContext).toBe('');
      expect(bundle.stats.failedStrategies).toEqual(['s1', 'e1']);
    });

    it('distinguishes "nothing found" from "retrieval broken"', async () => {
      const empty = await build([seedStrategy('s1', [])]).retrieve('ws_1', 'q');
      expect(empty.elements).toEqual([]);
      expect(empty.stats.failedStrategies).toEqual([]);

      const broken = await build([
        seedStrategy('s1', [], { throwError: new Error('down') })
      ]).retrieve('ws_1', 'q');
      expect(broken.elements).toEqual([]);
      expect(broken.stats.failedStrategies).toEqual(['s1']);
    });

    it('still returns results from the strategies that survived', async () => {
      const retriever = build([
        seedStrategy('ok', [candidate('a')]),
        seedStrategy('broken', [], { throwError: new Error('down') })
      ]);

      const bundle = await retriever.retrieve('ws_1', 'q');

      expect(bundle.elements.map((e) => e.id)).toEqual(['a']);
      expect(bundle.stats.failedStrategies).toEqual(['broken']);
    });

    it('skips seed strategies when the query embedding fails', async () => {
      const strategy = seedStrategy('vector-seed', [candidate('a')]);
      const spy = jest.spyOn(strategy, '_execute');

      const retriever = build([strategy], {
        embeddingService: { embed: jest.fn().mockResolvedValue({ embedding: [], error: 'boom' }) }
      });
      const bundle = await retriever.retrieve('ws_1', 'q');

      expect(spy).not.toHaveBeenCalled();
      expect(bundle.stats.failedStrategies).toEqual(['query-embedding', 'vector-seed']);
      expect(bundle.elements).toEqual([]);
    });

    it('treats an embedding-service throw as a failure, not a crash', async () => {
      const retriever = build([seedStrategy('vector-seed', [candidate('a')])], {
        embeddingService: { embed: jest.fn().mockRejectedValue(new Error('timeout')) }
      });

      const bundle = await retriever.retrieve('ws_1', 'q');
      expect(bundle.stats.failedStrategies).toContain('query-embedding');
    });

    it('treats a missing embedding service as a failure', async () => {
      const retriever = new WorkspaceHybridRetriever({
        strategies: [seedStrategy('vector-seed', [candidate('a')])],
        logger: silentLogger
      });

      const bundle = await retriever.retrieve('ws_1', 'q');
      expect(bundle.stats.failedStrategies).toContain('query-embedding');
    });

    it('still runs expansion strategies when seeds are empty', async () => {
      const expansion = expansionStrategy('e1', []);
      const spy = jest.spyOn(expansion, '_execute');

      await build([seedStrategy('s1', []), expansion]).retrieve('ws_1', 'q');

      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0].seeds).toEqual([]);
    });
  });

  describe('fail-fast on caller mistakes', () => {
    it('throws on a missing workspaceId', async () => {
      await expect(build([]).retrieve('', 'q')).rejects.toThrow('requires workspaceId');
    });

    it('throws on an empty query', async () => {
      await expect(build([]).retrieve('ws_1', '   ')).rejects.toThrow('non-empty queryText');
      await expect(build([]).retrieve('ws_1', null)).rejects.toThrow('non-empty queryText');
    });

    it('throws on an unknown strategy name', async () => {
      const retriever = build([seedStrategy('vector-seed', [candidate('a')])]);
      await expect(retriever.retrieve('ws_1', 'q', { strategies: ['nope'] }))
        .rejects.toThrow('Unknown strategy: nope');
    });

    it('rejects an unimplemented assemblyFormat before running any strategy', async () => {
      const strategy = seedStrategy('vector-seed', [candidate('a')]);
      const spy = jest.spyOn(strategy, '_execute');

      await expect(build([strategy]).retrieve('ws_1', 'q', { assemblyFormat: 'compact' }))
        .rejects.toThrow('not implemented yet');
      expect(spy).not.toHaveBeenCalled();
    });

    it('rejects an unimplemented fusion method before running any strategy', async () => {
      const strategy = seedStrategy('vector-seed', [candidate('a')]);
      const spy = jest.spyOn(strategy, '_execute');

      await expect(build([strategy]).retrieve('ws_1', 'q', { fusionMethod: 'linear' }))
        .rejects.toThrow('not implemented for heterogeneous');
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('strategy registry', () => {
    it('accepts an array of strategies', () => {
      const retriever = build([seedStrategy('a', []), seedStrategy('b', [])]);
      expect(retriever.getRegisteredStrategies()).toEqual(['a', 'b']);
    });

    it('accepts a Map of strategies', () => {
      const s = seedStrategy('a', []);
      const retriever = build(new Map([['a', s]]));
      expect(retriever.getRegisteredStrategies()).toEqual(['a']);
    });

    it('rejects anything else', () => {
      expect(() => new WorkspaceHybridRetriever({ strategies: 'nope' }))
        .toThrow('must be a Map or an array');
    });

    it('registers a strategy at runtime', async () => {
      const retriever = build([]);
      retriever.registerStrategy(seedStrategy('late', [candidate('a')]));

      expect(retriever.getRegisteredStrategies()).toEqual(['late']);
      const bundle = await retriever.retrieve('ws_1', 'q');
      expect(bundle.elements).toHaveLength(1);
    });

    it('rejects registering a nameless strategy', () => {
      expect(() => build([]).registerStrategy({})).toThrow('requires a strategy with a name');
    });

    it('runs every registered strategy when config.strategies is null', async () => {
      const bundle = await build([
        seedStrategy('s1', [candidate('a')]),
        seedStrategy('s2', [candidate('b')])
      ]).retrieve('ws_1', 'q');

      expect(bundle.strategiesUsed.sort()).toEqual(['s1', 's2']);
    });

    it('runs only the named strategies when config.strategies is set', async () => {
      const bundle = await build([
        seedStrategy('s1', [candidate('a')]),
        seedStrategy('s2', [candidate('b')])
      ]).retrieve('ws_1', 'q', { strategies: ['s1'] });

      expect(bundle.strategiesUsed).toEqual(['s1']);
      expect(bundle.elements.map((e) => e.id)).toEqual(['a']);
    });

    it('does not mutate a caller-supplied Map', () => {
      const source = new Map();
      const retriever = build(source);
      retriever.registerStrategy(seedStrategy('late', []));

      expect(source.size).toBe(0);
    });

    it('tolerates having no strategies at all', async () => {
      const bundle = await build([]).retrieve('ws_1', 'q');
      expect(bundle.elements).toEqual([]);
      expect(bundle.strategiesUsed).toEqual([]);
    });
  });

  describe('timing and stats', () => {
    it('reports total time and per-strategy time', async () => {
      const bundle = await build([
        seedStrategy('s1', [candidate('a')], { delayMs: 30 }),
        expansionStrategy('e1', [candidate('b')])
      ]).retrieve('ws_1', 'q', { strategyTimeoutMs: 1000 });

      expect(bundle.timing.totalMs).toBeGreaterThanOrEqual(30);
      expect(bundle.timing.byStrategy.s1).toBeGreaterThanOrEqual(25);
      expect(bundle.timing.byStrategy).toHaveProperty('e1');
      expect(bundle.timing.assemblyMs).toBeGreaterThanOrEqual(0);
      expect(bundle.timing.fusionMs).toBeGreaterThanOrEqual(0);
      expect(bundle.timing.embeddingMs).toBeGreaterThanOrEqual(0);
    });

    it('charges embedding time to its own bucket, not to fusion', async () => {
      const slowEmbedder = {
        embed: jest.fn().mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 60));
          return { embedding: embedding() };
        })
      };

      const bundle = await build([seedStrategy('s1', [candidate('a')])], {
        embeddingService: slowEmbedder
      }).retrieve('ws_1', 'q');

      expect(bundle.timing.embeddingMs).toBeGreaterThanOrEqual(50);
      // Fusing a single candidate is sub-millisecond work; if embedding time
      // leaked into this bucket the profile would be unreadable.
      expect(bundle.timing.fusionMs).toBeLessThan(40);
    });

    it('splits candidate counts by phase, not by strategy name', async () => {
      const bundle = await build([
        seedStrategy('s1', [candidate('a'), candidate('b')]),
        seedStrategy('s2', [candidate('c')]),
        expansionStrategy('e1', [candidate('d')])
      ]).retrieve('ws_1', 'q');

      expect(bundle.stats.candidatesFromSeed).toBe(3);
      expect(bundle.stats.candidatesFromExpansion).toBe(1);
    });

    it('counts the pool and the final selection separately', async () => {
      const many = Array.from({ length: 30 }, (_, i) => candidate(`n${i}`, 1 - i / 30));
      const bundle = await build([seedStrategy('s1', many)])
        .retrieve('ws_1', 'q', { maxElements: 5 });

      expect(bundle.stats.afterFusion).toBe(30);
      expect(bundle.stats.afterTruncation).toBe(5);
      expect(bundle.truncated).toBe(true);
    });

    it('excludes strategies that found nothing from strategiesUsed', async () => {
      const bundle = await build([
        seedStrategy('productive', [candidate('a')]),
        seedStrategy('barren', [])
      ]).retrieve('ws_1', 'q');

      expect(bundle.strategiesUsed).toEqual(['productive']);
      expect(bundle.stats.failedStrategies).toEqual([]);
    });

    it('records the config actually used', async () => {
      const bundle = await build([]).retrieve('ws_1', 'q', { maxElements: 3 });

      expect(bundle.config.maxElements).toBe(3);
      expect(bundle.config.rrfK).toBe(DEFAULT_CONFIG.rrfK);
    });
  });

  describe('cross-strategy corroboration end to end', () => {
    it('lifts a candidate found by both phases above a single-phase top hit', async () => {
      const bundle = await build([
        seedStrategy('vector-seed', [candidate('solo'), candidate('both')]),
        expansionStrategy('k-hop-expansion', [candidate('both')])
      ]).retrieve('ws_1', 'q');

      expect(bundle.elements[0].id).toBe('both');
      expect(bundle.elements[0].strategies).toHaveLength(2);
      expect(bundle.elements[0].score).toBe(1);
    });

    it('sends conflicts to the end of the assembled context', async () => {
      const conflict = candidate('ConflictingRule', 0.9, {
        terminalEdgeType: 'CONFLICTS_WITH',
        seedId: 'a',
        hops: 1,
        conflict: { withNodeId: 'x', withNodeName: 'OtherRule', conflictType: 'value' }
      });

      const bundle = await build([
        seedStrategy('vector-seed', [candidate('PlainFact')]),
        expansionStrategy('k-hop-expansion', [conflict])
      ]).retrieve('ws_1', 'q');

      const ctx = bundle.assembledContext;
      expect(ctx.indexOf('PlainFact')).toBeLessThan(ctx.indexOf('ConflictingRule'));
      expect(ctx).toContain('OtherRule');
    });
  });

  describe('module surface', () => {
    it('exposes RadixRetriever as an alias of the orchestrator', () => {
      expect(RadixRetriever).toBe(WorkspaceHybridRetriever);
    });

    it('createRadixRetriever builds a working instance', async () => {
      const retriever = createRadixRetriever({
        embeddingService: okEmbedder(),
        logger: silentLogger,
        connectorService: noConnectors(),
        strategies: [seedStrategy('s1', [candidate('a')])]
      });

      const bundle = await retriever.retrieve('ws_1', 'q');
      expect(bundle.elements).toHaveLength(1);
    });

    it('the default registry carries the strategies landed so far', () => {
      expect(Array.from(createDefaultStrategies({}).keys()))
        .toEqual(['vector-seed', 'source-chunk-seed', 'k-hop-expansion']);
    });

    it('degrades instead of throwing when a default strategy has no backing service', async () => {
      // No qdrantService injected → vector-seed fails; with no seeds, k-hop
      // returns empty cleanly rather than failing.
      const retriever = createRadixRetriever({
        embeddingService: okEmbedder(),
        logger: silentLogger,
        connectorService: noConnectors(),
        memgraphService: { runQuery: jest.fn().mockResolvedValue([]) }
      });

      const bundle = await retriever.retrieve('ws_1', 'q');
      expect(bundle.elements).toEqual([]);
      // Both seed strategies need Qdrant; the expansion one gets no seeds and
      // returns cleanly rather than failing.
      expect(bundle.stats.failedStrategies).toEqual(['vector-seed', 'source-chunk-seed']);
    });
  });

  describe('extensibility (R0 gate)', () => {
    it('accepts a brand-new strategy with no change to orchestrator, fusion or assembly', async () => {
      const retriever = build([seedStrategy('vector-seed', [candidate('a')])]);

      // A hypothetical future strategy — registered at runtime, nothing else touched.
      retriever.registerStrategy(seedStrategy('fulltext-seed', [candidate('b')]));
      retriever.registerStrategy(expansionStrategy('ppr-approximation', [candidate('c')]));

      const bundle = await retriever.retrieve('ws_1', 'q');

      expect(bundle.strategiesUsed.sort())
        .toEqual(['fulltext-seed', 'ppr-approximation', 'vector-seed']);
      expect(bundle.elements.map((e) => e.id).sort()).toEqual(['a', 'b', 'c']);
      expect(bundle.stats.candidatesFromSeed).toBe(2);
      expect(bundle.stats.candidatesFromExpansion).toBe(1);
    });
  });
});
