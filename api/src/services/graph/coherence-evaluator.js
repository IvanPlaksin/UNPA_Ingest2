/**
 * CoherenceEvaluator — uses LLM to assess whether a node cluster
 * forms a coherent logical unit.
 *
 * LLM is required — throws an error if evaluation fails.
 */

const { getScopedProvider } = require('../llm-access-control.service');
const llmProvider = getScopedProvider('graph_services');
const memgraphService = require('../memgraph.service');

const COHERENCE_PROMPT = `You are evaluating whether a group of nodes from a knowledge graph forms a coherent logical unit.

CLUSTER NODES:
{{NODES}}

CLUSTER INTERNAL EDGES:
{{EDGES}}

Evaluate this cluster:
1. Do these nodes belong together conceptually?
2. What is their shared purpose or domain?
3. Rate coherence from 0.0 to 1.0

Respond ONLY in valid JSON (no markdown):
{
  "coherenceScore": 0.85,
  "sharedPurpose": "short description of shared domain",
  "suggestedName": "Cluster Name",
  "reasoning": "brief explanation"
}`;

class CoherenceEvaluator {
  constructor() {
    this.driver = memgraphService.driver;
  }

  _session() {
    if (!this.driver) throw new Error('Memgraph driver not initialised');
    return this.driver.session();
  }

  /**
   * Evaluate coherence of multiple candidate clusters.
   * @param {Array<{nodes: string[], strategy: string}>} candidates
   * @param {string} namespace
   * @param {{ useLlm?: boolean }} opts
   * @returns {Promise<EvaluatedCluster[]>}
   */
  async evaluateClusters(candidates, namespace, opts = {}) {
    const { useLlm = true } = opts;
    const session = this._session();

    try {
      // Preload all node details and edges for the namespace
      const nodesRes = await session.run(`
        MATCH (n) WHERE n.namespace = $ns
          AND NOT labels(n)[0] IN ['SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint']
        RETURN n.id AS id, n.name AS name, labels(n)[0] AS label, n.description AS description
      `, { ns: namespace });

      const edgesRes = await session.run(`
        MATCH (a)-[r]->(b)
        WHERE a.namespace = $ns AND b.namespace = $ns
          AND NOT type(r) IN ['CONTAINS_MEMBER', 'PORT_OF', 'BRIDGES_TO', 'CONNECTS_INTERNAL', 'SUBGRAPH_LINK']
        RETURN a.id AS src, b.id AS tgt, type(r) AS relType
      `, { ns: namespace });

      const nodeMap = new Map();
      for (const rec of nodesRes.records) {
        nodeMap.set(rec.get('id'), {
          id: rec.get('id'),
          name: rec.get('name'),
          label: rec.get('label'),
          description: rec.get('description') || '',
        });
      }

      const allEdges = edgesRes.records.map(r => ({
        source: r.get('src'), target: r.get('tgt'), type: r.get('relType'),
      }));

      const results = [];
      for (const candidate of candidates) {
        const memberSet = new Set(candidate.nodes);
        const memberNodes = candidate.nodes.map(id => nodeMap.get(id)).filter(Boolean);
        const internalEdges = allEdges.filter(e => memberSet.has(e.source) && memberSet.has(e.target));
        const externalEdges = allEdges.filter(e =>
          (memberSet.has(e.source) && !memberSet.has(e.target)) ||
          (!memberSet.has(e.source) && memberSet.has(e.target))
        );

        if (!useLlm) {
          throw new Error('LLM evaluation is required for coherence assessment. Set useLlm=true or ensure LLM service is available.');
        }

        const evaluation = await this._llmEvaluate(memberNodes, internalEdges);
        if (!evaluation) {
          throw new Error(
            `LLM coherence evaluation failed for cluster "${candidate.name || candidate.id || '?'}". ` +
            'Check that the LLM service (Ollama) is running and accessible at the configured endpoint.'
          );
        }

        results.push({
          ...candidate,
          ...evaluation,
          internalEdgeCount: internalEdges.length,
          externalEdgeCount: externalEdges.length,
        });
      }

      return results;
    } finally {
      await session.close();
    }
  }

  /**
   * LLM-based coherence evaluation.
   */
  async _llmEvaluate(nodes, edges) {
    const nodesText = nodes.map(n => `- ${n.name} (${n.label}): ${n.description}`).join('\n');
    const edgesText = edges.map(e => `- ${e.source} --[${e.type}]--> ${e.target}`).join('\n');

    const prompt = COHERENCE_PROMPT
      .replace('{{NODES}}', nodesText || '(none)')
      .replace('{{EDGES}}', edgesText || '(none)');

    try {
      const response = await llmProvider.chat([
        { role: 'user', content: prompt },
      ]);

      const rawContent = response?.content;
      const text = Array.isArray(rawContent)
        ? rawContent.filter(b => b.type === 'text').map(b => b.text).join('')
        : (rawContent || '');
      // Extract JSON from response (handle markdown wrapping)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          coherenceScore: Math.max(0, Math.min(1, parsed.coherenceScore || 0)),
          sharedPurpose: parsed.sharedPurpose || '',
          suggestedName: parsed.suggestedName || '',
          reasoning: parsed.reasoning || '',
          evaluationMethod: 'llm',
        };
      }
    } catch (e) {
      console.error('[CoherenceEvaluator] LLM evaluation failed:', e.message);
      throw new Error(`LLM coherence evaluation error: ${e.message}`);
    }
  }

  /**
   * Heuristic coherence score:
   * - Internal density vs external connections ratio
   * - Label homogeneity (how many distinct labels)
   * - Size penalty (very large clusters less coherent)
   */
  _heuristicEvaluate(nodes, internalEdges, externalEdges) {
    const n = nodes.length;
    if (n === 0) return { coherenceScore: 0, evaluationMethod: 'heuristic' };

    // 1. Internal density: actual edges / max possible
    const maxEdges = n * (n - 1);
    const densityScore = maxEdges > 0 ? Math.min(1, internalEdges.length / maxEdges * 5) : 0;

    // 2. Isolation: ratio of internal to total edges
    const totalEdges = internalEdges.length + externalEdges.length;
    const isolationScore = totalEdges > 0 ? internalEdges.length / totalEdges : 0.5;

    // 3. Label homogeneity
    const labels = new Set(nodes.map(nd => nd.label));
    const homogeneityScore = 1 / labels.size;

    // 4. Size penalty (prefer 3-15 nodes)
    const sizePenalty = n < 2 ? 0.3 : n <= 15 ? 1.0 : Math.max(0.3, 1 - (n - 15) / 50);

    // Weighted combination
    const score = (densityScore * 0.3 + isolationScore * 0.4 + homogeneityScore * 0.15 + sizePenalty * 0.15);

    // Generate name from most common label
    const labelCounts = {};
    for (const nd of nodes) labelCounts[nd.label] = (labelCounts[nd.label] || 0) + 1;
    const dominantLabel = Object.entries(labelCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || 'Unknown';

    return {
      coherenceScore: +Math.max(0, Math.min(1, score)).toFixed(4),
      sharedPurpose: `Group of ${n} nodes, primarily ${dominantLabel}`,
      suggestedName: `${dominantLabel} Cluster`,
      reasoning: `Heuristic: density=${densityScore.toFixed(2)}, isolation=${isolationScore.toFixed(2)}, homogeneity=${homogeneityScore.toFixed(2)}`,
      evaluationMethod: 'heuristic',
    };
  }
}

module.exports = { CoherenceEvaluator };
