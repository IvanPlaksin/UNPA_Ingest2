'use strict';

const { KHopExpansionStrategy } = require('../k-hop-expansion.strategy');
const { createDefaultStrategies } = require('../index');
const { mergeConfig, DEFAULT_CONFIG } = require('../../contracts/context-bundle');

const silentLogger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };

const node = (id, name, label = 'DraftEntity') => ({ id, name, labels: [label] });

/**
 * Expands node descriptors into the three PARALLEL LISTS the Cypher returns.
 * Memgraph mis-evaluates map literals inside list comprehensions, so the query
 * projects ids/names/labels separately - fixtures mirror that.
 */
const pathLists = (nodes) => ({
  pathNodeIds: nodes.map((n) => n.id),
  pathNodeNames: nodes.map((n) => n.name),
  pathNodeLabels: nodes.map((n) => n.labels)
});

/** A traversal row shaped as the Cypher RETURN produces it. */
const row = (overrides = {}) => ({
  seedId: 'seed1',
  targetId: 't1',
  props: {
    id: 't1',
    name: 'Target One',
    description: 'A neighbouring draft',
    type: 'entity',
    status: 'VALIDATED',
    knowledgeFamily: 'STRUCTURAL'
  },
  labels: ['DraftEntity'],
  ...pathLists([node('seed1', 'Seed One'), node('t1', 'Target One')]),
  edgeTypes: ['DEPENDS_ON'],
  directions: ['outgoing'],
  hops: 1,
  sourceRefId: null,
  sourceRefType: null,
  sourceRefName: null,
  ...overrides
});

const memgraphMock = (rows = []) => ({ runQuery: jest.fn().mockResolvedValue(rows) });

const seed = (id) => ({
  id,
  type: 'entity',
  content: `seed ${id}`,
  score: 0.9,
  provenance: { sourceId: id, sourceType: 'DRAFT_ENTITY' },
  metadata: {}
});

const contextFor = (seeds = [seed('seed1')], config = {}) => ({
  workspaceId: 'ws_1',
  query: 'find approval rules',
  queryEmbedding: new Array(8).fill(0.1),
  config: mergeConfig(config),
  seeds
});

const build = (memgraph) => new KHopExpansionStrategy({
  memgraphService: memgraph,
  logger: silentLogger
});

describe('Radix Strategies: KHopExpansionStrategy', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('metadata', () => {
    it('is an expansion strategy named k-hop-expansion', () => {
      const s = build(memgraphMock());
      expect(s.name).toBe('k-hop-expansion');
      expect(s.type).toBe('expansion');
    });
  });

  describe('empty and failing input', () => {
    it('returns nothing for empty seeds without touching Memgraph', async () => {
      const memgraph = memgraphMock([]);
      const result = await build(memgraph).execute(contextFor([]));

      expect(result.success).toBe(true);
      expect(result.candidates).toEqual([]);
      expect(memgraph.runQuery).not.toHaveBeenCalled();
      expect(result.debug.seedCount).toBe(0);
    });

    it('contains a Memgraph failure instead of aborting retrieval', async () => {
      const memgraph = { runQuery: jest.fn().mockRejectedValue(new Error('Memgraph down')) };
      const result = await build(memgraph).execute(contextFor());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Memgraph down');
      expect(result.candidates).toEqual([]);
    });

    it('fails cleanly when no memgraphService was injected', async () => {
      const result = await new KHopExpansionStrategy({ logger: silentLogger })
        .execute(contextFor());

      expect(result.success).toBe(false);
      expect(result.error).toMatch('requires a memgraphService');
    });

    it('tolerates a null result set', async () => {
      const memgraph = { runQuery: jest.fn().mockResolvedValue(null) };
      const result = await build(memgraph).execute(contextFor());

      expect(result.success).toBe(true);
      expect(result.candidates).toEqual([]);
    });

    it('drops rows with no edges', async () => {
      const result = await build(memgraphMock([row({ edgeTypes: [] })])).execute(contextFor());
      expect(result.candidates).toEqual([]);
    });
  });

  describe('the Cypher query', () => {
    it('traverses in both directions (no arrow on the variable-length pattern)', async () => {
      const memgraph = memgraphMock([]);
      await build(memgraph).execute(contextFor());

      const [cypher] = memgraph.runQuery.mock.calls[0];
      expect(cypher).toMatch(/\(seed\)-\[rels:DRAFT_RELATES_TO\*1\.\.2\]-\(target\)/);
      expect(cypher).not.toMatch(/\*1\.\.2\]->\(target\)/);
    });

    it('pins the walk to DRAFT_RELATES_TO so it cannot climb the WorkSpace node', async () => {
      const memgraph = memgraphMock([]);
      await build(memgraph).execute(contextFor());

      // An untyped variable-length pattern also walks CONTAINS_DRAFT up to the
      // WorkSpace and back down, making every draft 2 hops from every other.
      const [cypher] = memgraph.runQuery.mock.calls[0];
      expect(cypher).toContain('[rels:DRAFT_RELATES_TO*');
    });

    it('reads the semantic relation from r.type, not the relationship label', async () => {
      const memgraph = memgraphMock([]);
      await build(memgraph).execute(contextFor());

      // Every draft edge shares one label; the meaning lives in the property.
      expect(memgraph.runQuery.mock.calls[0][0])
        .toContain('[r IN rels | coalesce(r.type, type(r))]');
    });

    it('interpolates graphMaxDepth as a literal bound', async () => {
      const memgraph = memgraphMock([]);
      await build(memgraph).execute(contextFor([seed('s1')], { graphMaxDepth: 3 }));

      expect(memgraph.runQuery.mock.calls[0][0]).toContain('rels:DRAFT_RELATES_TO*1..3');
    });

    it('clamps an out-of-range depth rather than emitting it', async () => {
      const memgraph = memgraphMock([]);
      await build(memgraph).execute(contextFor([seed('s1')], { graphMaxDepth: 99 }));

      expect(memgraph.runQuery.mock.calls[0][0]).toContain('rels:DRAFT_RELATES_TO*1..5');
    });

    it('caps the result set with a literal LIMIT', async () => {
      const memgraph = memgraphMock([]);
      await build(memgraph).execute(contextFor([seed('s1')], { graphMaxResults: 42 }));

      expect(memgraph.runQuery.mock.calls[0][0]).toContain('LIMIT 42');
    });

    it('scopes both seed and target to the workspace', async () => {
      const memgraph = memgraphMock([]);
      await build(memgraph).execute(contextFor());

      const [cypher, params] = memgraph.runQuery.mock.calls[0];
      expect(cypher).toContain('MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(seed)');
      expect(cypher).toContain('MATCH (w)-[:CONTAINS_DRAFT]->(target)');
      expect(params.wsId).toBe('ws_1');
      expect(params.seedIds).toEqual(['seed1']);
    });

    it('excludes the same draft statuses the vector path excludes', async () => {
      const memgraph = memgraphMock([]);
      await build(memgraph).execute(contextFor());

      const [cypher, params] = memgraph.runQuery.mock.calls[0];
      expect(cypher).toContain('NOT coalesce(target.status, \'\') IN $excludeStatuses');
      expect(params.excludeStatuses).toEqual(['REJECTED', 'PROMOTED']);
    });

    it('adds an edge-type filter only when one is configured', async () => {
      const noFilter = memgraphMock([]);
      await build(noFilter).execute(contextFor());
      expect(noFilter.runQuery.mock.calls[0][0]).not.toContain('ALL(r IN rels');

      const withFilter = memgraphMock([]);
      await build(withFilter).execute(
        contextFor([seed('s1')], { graphEdgeTypes: ['GOVERNS', 'IMPLEMENTS'] })
      );
      const [cypher, params] = withFilter.runQuery.mock.calls[0];
      expect(cypher).toContain('ALL(r IN rels WHERE coalesce(r.type, type(r)) IN $edgeTypes)');
      expect(params.edgeTypes).toEqual(['GOVERNS', 'IMPLEMENTS']);
    });

    it('derives hop direction by comparing startNode to the path position', async () => {
      const memgraph = memgraphMock([]);
      await build(memgraph).execute(contextFor());

      expect(memgraph.runQuery.mock.calls[0][0])
        .toContain("CASE WHEN startNode(rels[i]) = nodes(path)[i]");
    });
  });

  describe('scoring', () => {
    it('scores a single hop as that edge weight', async () => {
      const result = await build(memgraphMock([row({ edgeTypes: ['DEPENDS_ON'] })]))
        .execute(contextFor());

      expect(result.candidates[0].score).toBeCloseTo(0.9, 10);
    });

    it('scores a two-hop path as the product of its edge weights', async () => {
      const r = row({
        edgeTypes: ['DEPENDS_ON', 'GOVERNS'], // 0.9 Ã— 0.8
        directions: ['outgoing', 'incoming'],
        hops: 2,
        ...pathLists([node('seed1', 'Seed'), node('mid', 'Middle'), node('t1', 'Target One')])
      });

      const result = await build(memgraphMock([r])).execute(contextFor());
      expect(result.candidates[0].score).toBeCloseTo(0.72, 10);
    });

    it('applies no extra depth decay beyond the product', async () => {
      const two = row({
        edgeTypes: ['IMPLEMENTS', 'IMPLEMENTS'], // 1.0 Ã— 1.0
        directions: ['outgoing', 'outgoing'],
        hops: 2,
        ...pathLists([node('seed1', 'S'), node('m', 'M'), node('t1', 'T')])
      });

      const result = await build(memgraphMock([two])).execute(contextFor());
      expect(result.candidates[0].score).toBe(1);
    });

    it('uses the fallback weight for a custom edge type', async () => {
      const result = await build(memgraphMock([row({ edgeTypes: ['MY_CUSTOM_EDGE'] })]))
        .execute(contextFor());

      expect(result.candidates[0].score).toBeCloseTo(0.3, 10);
    });

    it('honours caller-supplied edge weights', async () => {
      const result = await build(memgraphMock([row({ edgeTypes: ['DEPENDS_ON'] })]))
        .execute(contextFor([seed('seed1')], { edgeWeights: { DEPENDS_ON: 0.1 } }));

      expect(result.candidates[0].score).toBeCloseTo(0.1, 10);
    });

    it('returns candidates ordered by score descending', async () => {
      const rows = [
        row({ targetId: 'weak', props: { id: 'weak', name: 'Weak' }, edgeTypes: ['BELONGS_TO'], ...pathLists([node('seed1', 'S'), node('weak', 'Weak')]) }),
        row({ targetId: 'strong', props: { id: 'strong', name: 'Strong' }, edgeTypes: ['IMPLEMENTS'], ...pathLists([node('seed1', 'S'), node('strong', 'Strong')]) })
      ];

      const result = await build(memgraphMock(rows)).execute(contextFor());
      expect(result.candidates.map((c) => c.id)).toEqual(['strong', 'weak']);
    });
  });

  describe('path deduplication', () => {
    it('keeps the highest-scoring path to a target, not the shortest', async () => {
      const shortWeak = row({
        targetId: 't1',
        edgeTypes: ['BELONGS_TO'], // 0.4, one hop
        directions: ['outgoing'],
        hops: 1,
        ...pathLists([node('seed1', 'S'), node('t1', 'Target One')])
      });
      const longStrong = row({
        targetId: 't1',
        edgeTypes: ['IMPLEMENTS', 'IMPLEMENTS'], // 1.0, two hops
        directions: ['outgoing', 'outgoing'],
        hops: 2,
        ...pathLists([node('seed1', 'S'), node('mid', 'Middle'), node('t1', 'Target One')])
      });

      const result = await build(memgraphMock([shortWeak, longStrong])).execute(contextFor());

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].score).toBe(1);
      expect(result.candidates[0].metadata.hops).toBe(2);
      expect(result.candidates[0].metadata.expansionPath).toHaveLength(3);
    });

    it('emits one candidate per target regardless of how many paths reach it', async () => {
      const rows = [
        row({ targetId: 't1', seedId: 'seed1' }),
        row({ targetId: 't1', seedId: 'seed2' }),
        row({ targetId: 't2', props: { id: 't2', name: 'Two' }, ...pathLists([node('seed1', 'S'), node('t2', 'Two')]) })
      ];

      const result = await build(memgraphMock(rows)).execute(contextFor());

      expect(result.candidates.map((c) => c.id).sort()).toEqual(['t1', 't2']);
      expect(result.debug.targets).toBe(2);
    });
  });

  describe('corroboration', () => {
    it('does NOT filter out a target that is already a seed', async () => {
      const r = row({ targetId: 'seed1', props: { id: 'seed1', name: 'Seed One' }, seedId: 'seed2' });
      const result = await build(memgraphMock([r]))
        .execute(contextFor([seed('seed1'), seed('seed2')]));

      // Found by vector AND by graph â€” RRF turns that into a rank boost.
      expect(result.candidates.map((c) => c.id)).toEqual(['seed1']);
      expect(result.candidates[0].metadata.alsoSeed).toBe(true);
    });

    it('marks a target that is not a seed', async () => {
      const result = await build(memgraphMock([row()])).execute(contextFor());
      expect(result.candidates[0].metadata.alsoSeed).toBe(false);
    });
  });

  describe('ExpansionMetadata', () => {
    it('carries the full chain, not just the last edge', async () => {
      const r = row({
        edgeTypes: ['DEPENDS_ON', 'GOVERNS'],
        directions: ['outgoing', 'incoming'],
        hops: 2,
        ...pathLists([
          node('draft_1', 'User'),
          node('draft_7', 'Session'),
          node('draft_12', 'SessionTimeout', 'DraftBusinessRule')
        ]),
        targetId: 'draft_12',
        props: { id: 'draft_12', name: 'SessionTimeout', type: 'business_rule' }
      });

      const meta = (await build(memgraphMock([r])).execute(contextFor())).candidates[0].metadata;

      expect(meta.expansionPath).toEqual([
        { nodeId: 'draft_1', nodeType: 'entity', nodeName: 'User', edgeType: null, edgeDirection: null },
        { nodeId: 'draft_7', nodeType: 'entity', nodeName: 'Session', edgeType: 'DEPENDS_ON', edgeDirection: 'outgoing' },
        { nodeId: 'draft_12', nodeType: 'business_rule', nodeName: 'SessionTimeout', edgeType: 'GOVERNS', edgeDirection: 'incoming' }
      ]);
      expect(meta.hops).toBe(2);
      expect(meta.seedId).toBe('seed1');
      expect(meta.terminalEdgeType).toBe('GOVERNS');
    });

    it('records an incoming hop as such', async () => {
      const result = await build(memgraphMock([row({ directions: ['incoming'] })]))
        .execute(contextFor());

      expect(result.candidates[0].metadata.expansionPath[1].edgeDirection).toBe('incoming');
    });

    it('adds no conflict block for an ordinary edge', async () => {
      const result = await build(memgraphMock([row()])).execute(contextFor());
      expect(result.candidates[0].metadata.conflict).toBeUndefined();
    });
  });

  describe('contradictions', () => {
    it('builds a conflict block when the last edge is CONFLICTS_WITH', async () => {
      const r = row({
        edgeTypes: ['CONFLICTS_WITH'],
        targetId: 'rule_b',
        props: { id: 'rule_b', name: 'RuleB', type: 'business_rule' },
        ...pathLists([node('seed1', 'RuleA', 'DraftBusinessRule'), node('rule_b', 'RuleB', 'DraftBusinessRule')])
      });

      const meta = (await build(memgraphMock([r])).execute(contextFor())).candidates[0].metadata;

      expect(meta.terminalEdgeType).toBe('CONFLICTS_WITH');
      expect(meta.conflict).toEqual({
        withNodeId: 'seed1',
        withNodeName: 'RuleA',
        conflictType: 'semantic'
      });
    });

    it('names the immediate counterpart, not the seed, on a multi-hop conflict', async () => {
      const r = row({
        edgeTypes: ['DEPENDS_ON', 'CONFLICTS_WITH'],
        directions: ['outgoing', 'outgoing'],
        hops: 2,
        targetId: 'rule_c',
        props: { id: 'rule_c', name: 'RuleC' },
        ...pathLists([node('seed1', 'Seed'), node('rule_b', 'RuleB'), node('rule_c', 'RuleC')])
      });

      const meta = (await build(memgraphMock([r])).execute(contextFor())).candidates[0].metadata;

      // RuleC contradicts RuleB, not the seed.
      expect(meta.conflict.withNodeId).toBe('rule_b');
      expect(meta.conflict.withNodeName).toBe('RuleB');
    });

    it('scores a conflict edge high â€” it is a signal, not noise', async () => {
      const result = await build(memgraphMock([row({ edgeTypes: ['CONFLICTS_WITH'] })]))
        .execute(contextFor());

      expect(result.candidates[0].score).toBeCloseTo(0.85, 10);
    });
  });

  describe('content and provenance', () => {
    it('builds content from the traversal row â€” no second query', async () => {
      const memgraph = memgraphMock([row()]);
      const result = await build(memgraph).execute(contextFor());

      expect(memgraph.runQuery).toHaveBeenCalledTimes(1);
      expect(result.candidates[0].content).toBe('Target One. A neighbouring draft');
      expect(result.candidates[0].metadata.hydrated).toBe(true);
    });

    it('lifts content fields the same way the vector path does', async () => {
      const r = row({
        props: {
          id: 't1',
          name: 'Approval limit',
          description: 'Caps approvals',
          type: 'business_rule',
          content: JSON.stringify({ condition: 'amount > 50000', action: 'escalate' })
        }
      });

      const content = (await build(memgraphMock([r])).execute(contextFor())).candidates[0].content;

      expect(content).toContain('condition: amount > 50000');
      expect(content).toContain('action: escalate');
    });

    it('resolves provenance to the SourceReference when present', async () => {
      const r = row({
        sourceRefId: 'src_9',
        sourceRefType: 'FILE',
        sourceRefName: 'policy.pdf'
      });

      const c = (await build(memgraphMock([r])).execute(contextFor())).candidates[0];

      expect(c.provenance).toEqual({ sourceId: 'src_9', sourceType: 'FILE', draftId: 't1' });
      expect(c.metadata.sourceRefName).toBe('policy.pdf');
    });

    it('falls back to draft provenance with no SourceReference', async () => {
      const c = (await build(memgraphMock([row()])).execute(contextFor())).candidates[0];
      expect(c.provenance).toEqual({ sourceId: 't1', sourceType: 'DRAFT_ENTITY' });
    });

    it('derives the draft type from labels when the property is absent', async () => {
      const r = row({
        props: { id: 't1', name: 'Rule' },
        labels: ['DraftBusinessRule']
      });

      const c = (await build(memgraphMock([r])).execute(contextFor())).candidates[0];

      expect(c.metadata.draftType).toBe('business_rule');
      expect(c.type).toBe('rule');
    });
  });

  describe('debug and limits', () => {
    it('flags when the row cap was hit', async () => {
      const rows = Array.from({ length: 5 }, (_, i) => row({
        targetId: `t${i}`,
        props: { id: `t${i}`, name: `T${i}` },
        ...pathLists([node('seed1', 'S'), node(`t${i}`, `T${i}`)])
      }));

      const result = await build(memgraphMock(rows))
        .execute(contextFor([seed('seed1')], { graphMaxResults: 5 }));

      expect(result.debug.truncatedByLimit).toBe(true);
      expect(result.debug.rows).toBe(5);
    });

    it('does not flag truncation below the cap', async () => {
      const result = await build(memgraphMock([row()]))
        .execute(contextFor([seed('seed1')], { graphMaxResults: 100 }));

      expect(result.debug.truncatedByLimit).toBe(false);
    });
  });

  describe('registration and config', () => {
    it('is in the default strategy registry', () => {
      const registry = createDefaultStrategies({ logger: silentLogger });
      expect(registry.has('k-hop-expansion')).toBe(true);
      expect(registry.get('k-hop-expansion')).toBeInstanceOf(KHopExpansionStrategy);
    });

    it('strategyTimeoutMs default was raised to survive a cold start', () => {
      expect(DEFAULT_CONFIG.strategyTimeoutMs).toBe(800);
    });

    it('graphMaxResults defaults to 200 and is clamped', () => {
      expect(DEFAULT_CONFIG.graphMaxResults).toBe(200);
      expect(mergeConfig({ graphMaxResults: 99999 }).graphMaxResults).toBe(2000);
      expect(mergeConfig({ graphMaxResults: 0 }).graphMaxResults).toBe(1);
    });
  });
});

