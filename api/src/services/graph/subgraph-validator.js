/**
 * SubgraphValidator — AI-based quality validation of consolidated SubGraphs.
 *
 * Uses direct Anthropic API calls (Claude Haiku) to assess:
 *  - Structural integrity
 *  - Boundary correctness
 *  - Semantic coherence
 *  - Naming quality
 *
 * LLM is required — throws an error if validation fails.
 */

const memgraphService = require('../memgraph.service');

const VALIDATION_MODEL = 'haiku';
const { getScopedProvider } = require('../llm-access-control.service');
const llmProvider = getScopedProvider('graph_services');
const VALIDATION_TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = `You are a graph quality auditor validating a SubGraph consolidation operation in a knowledge graph system.
You receive structural data about a SubGraph and must provide a structured quality assessment.

Respond ONLY in valid JSON (no markdown wrapping):
{
  "qualityScore": 0.85,
  "structuralIntegrity": 0.9,
  "boundaryCorrectness": 0.8,
  "semanticCoherence": 0.85,
  "namingQuality": 0.7,
  "issues": ["issue description 1", "issue description 2"],
  "recommendations": ["recommendation 1"],
  "summary": "1-2 sentence overall assessment"
}

Score meanings:
- qualityScore: overall quality (0.0-1.0), weighted average of dimensions
- structuralIntegrity: internal connections well-formed, no isolated orphan nodes
- boundaryCorrectness: external connections properly captured by boundary ports
- semanticCoherence: member nodes logically belong together as a concept
- namingQuality: subgraph name accurately reflects its contents`;

class SubgraphValidator {
  constructor() {
    this.driver = memgraphService.driver;
  }

  _session() {
    if (!this.driver) throw new Error('Memgraph driver not initialised');
    return this.driver.session();
  }

  /**
   * Validate a consolidated SubGraph.
   * @param {string} subgraphId
   * @param {string} namespace
   * @returns {Promise<ValidationResult>}
   */
  async validateSubgraph(subgraphId, namespace) {
    const session = this._session();

    try {
      // 1. Load SubGraph metadata
      const sgRes = await session.run(`
        MATCH (sg:SubGraph {id: $id, namespace: $ns})
        RETURN sg
      `, { id: subgraphId, ns: namespace });

      if (sgRes.records.length === 0) {
        throw new Error(`SubGraph ${subgraphId} not found in namespace "${namespace}"`);
      }

      const sgProps = sgRes.records[0].get('sg').properties;
      const sgMeta = {
        id: sgProps.id,
        name: sgProps.name || 'Unnamed',
        namespace: sgProps.namespace,
        nodeCount: this._num(sgProps.nodeCount),
        internalEdgeCount: this._num(sgProps.internalEdgeCount),
        strategy: sgProps.strategy || 'unknown',
        coherenceScore: parseFloat(sgProps.coherenceScore) || 0,
        status: sgProps.status || 'unknown',
        rewiredEdgeCount: this._num(sgProps.rewiredEdgeCount),
        removedInternalEdgeCount: this._num(sgProps.removedInternalEdgeCount),
      };

      // 2. Load member nodes
      const nodesRes = await session.run(`
        MATCH (sg:SubGraph {id: $id})-[:CONTAINS_MEMBER]->(m)
        RETURN m.id AS id, m.name AS name, labels(m)[0] AS label, m.description AS description
      `, { id: subgraphId });

      const members = nodesRes.records.map(r => ({
        id: r.get('id'),
        name: r.get('name') || r.get('id'),
        label: r.get('label') || 'Node',
        description: r.get('description') || '',
      }));

      // 3. Load internal edges
      const memberIds = members.map(m => m.id);
      const edgesRes = await session.run(`
        MATCH (a)-[r]->(b)
        WHERE a.id IN $ids AND b.id IN $ids
          AND NOT type(r) IN ['CONTAINS_MEMBER', 'PORT_OF', 'BRIDGES_TO', 'CONNECTS_INTERNAL', 'SUBGRAPH_LINK']
        RETURN a.id AS src, b.id AS tgt, type(r) AS relType
      `, { ids: memberIds });

      const edges = edgesRes.records.map(r => ({
        source: r.get('src'),
        target: r.get('tgt'),
        type: r.get('relType'),
      }));

      // 4. Load boundary ports
      const portsRes = await session.run(`
        MATCH (sg:SubGraph {id: $id})-[:PORT_OF]->(p:SubGraphPort)
        RETURN p.direction AS direction, p.externalNodeId AS extNode,
               p.externalEdgeType AS extEdgeType, p.internalNodeId AS intNode
      `, { id: subgraphId });

      const ports = portsRes.records.map(r => ({
        direction: r.get('direction'),
        externalNodeId: r.get('extNode'),
        externalEdgeType: r.get('extEdgeType'),
        internalNodeId: r.get('intNode'),
      }));

      // 5. LLM validation (required)
      const validation = await this._llmValidate(sgMeta, members, edges, ports);
      return validation;
    } finally {
      await session.close();
    }
  }

  /**
   * LLM-based validation via Anthropic API.
   */
  async _llmValidate(sgMeta, members, edges, ports) {
    if (!ANTHROPIC_API_KEY) {
      throw new Error(
        'ANTHROPIC_API_KEY is not configured. AI validation requires an Anthropic API key. ' +
        'Set ANTHROPIC_API_KEY in your environment variables.'
      );
    }

    const nodesText = members.map(n => `- ${n.name} (${n.label}): ${n.description || 'no description'}`).join('\n');
    const edgesText = edges.length > 0
      ? edges.slice(0, 50).map(e => `- ${e.source} --[${e.type}]--> ${e.target}`).join('\n')
      : '(none)';
    const portsText = ports.length > 0
      ? ports.slice(0, 30).map(p => `- ${p.direction}: ${p.internalNodeId} <-> ${p.externalNodeId} via ${p.externalEdgeType}`).join('\n')
      : '(no boundary ports)';

    const userMessage = `SUBGRAPH: "${sgMeta.name}" (${sgMeta.nodeCount} nodes, ${sgMeta.internalEdgeCount} internal edges)
Strategy: ${sgMeta.strategy}, Pre-consolidation coherence: ${sgMeta.coherenceScore.toFixed(2)}
Status: ${sgMeta.status}

MEMBER NODES (${members.length}):
${nodesText}

INTERNAL EDGES (${edges.length}):
${edgesText}${edges.length > 50 ? `\n... and ${edges.length - 50} more` : ''}

BOUNDARY PORTS (${ports.length} connections to external graph):
${portsText}${ports.length > 30 ? `\n... and ${ports.length - 30} more` : ''}

CONSOLIDATION STATS:
- Internal edges removed: ${sgMeta.removedInternalEdgeCount}
- Boundary edges rewired: ${sgMeta.rewiredEdgeCount}

Evaluate this subgraph consolidation across all quality dimensions.`;

    try {
      const charToTokens = (c) => Math.ceil(c / 4);
      const sysT = charToTokens(SYSTEM_PROMPT.length);
      const msgT = charToTokens(userMessage.length);
      console.log(`[SubgraphValidator] Calling Claude: model=${VALIDATION_MODEL}, ~${sysT + msgT} input tokens`);

      const llmResp = await Promise.race([
        llmProvider.chat([{ role: 'user', content: userMessage }], {
          model: VALIDATION_MODEL,
          maxTokens: 1024,
          system: SYSTEM_PROMPT,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Validation timeout')), VALIDATION_TIMEOUT_MS))
      ]);

      const text = llmResp.content?.[0]?.text || '';

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          qualityScore: this._clamp(parsed.qualityScore),
          structuralIntegrity: this._clamp(parsed.structuralIntegrity),
          boundaryCorrectness: this._clamp(parsed.boundaryCorrectness),
          semanticCoherence: this._clamp(parsed.semanticCoherence),
          namingQuality: this._clamp(parsed.namingQuality),
          issues: Array.isArray(parsed.issues) ? parsed.issues : [],
          recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
          summary: parsed.summary || '',
          method: 'llm',
        };
      }

      throw new Error(
        'Claude returned a response but it could not be parsed as valid JSON. ' +
        'The AI model may need a clearer prompt or the response was truncated.'
      );
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(
          `SubGraph validation timed out after ${VALIDATION_TIMEOUT_MS / 1000}s. ` +
          'The Claude API may be slow or unreachable.'
        );
      }
      throw err;
    }
  }

  /**
   * Heuristic validation fallback.
   */
  _heuristicValidate(sgMeta, members, edges, ports) {
    const n = members.length;

    // Structural integrity: density-based
    const maxEdges = n * (n - 1);
    const structuralIntegrity = maxEdges > 0
      ? this._clamp(Math.min(1, (edges.length / maxEdges) * 5))
      : 0;

    // Check for isolated nodes (no internal edges)
    const connectedNodes = new Set();
    for (const e of edges) {
      connectedNodes.add(e.source);
      connectedNodes.add(e.target);
    }
    const isolatedCount = members.filter(m => !connectedNodes.has(m.id)).length;

    // Boundary correctness: do ports exist?
    const boundaryCorrectness = sgMeta.rewiredEdgeCount > 0
      ? this._clamp(ports.length / Math.max(1, sgMeta.rewiredEdgeCount))
      : (ports.length > 0 ? 0.8 : 1.0); // no rewired edges = nothing to check

    // Semantic coherence: reuse pre-computed score
    const semanticCoherence = this._clamp(sgMeta.coherenceScore || 0.5);

    // Naming quality: neutral heuristic
    const namingQuality = sgMeta.name && sgMeta.name !== 'Unnamed SubGraph' ? 0.6 : 0.3;

    // Weighted average
    const qualityScore = this._clamp(
      structuralIntegrity * 0.25 +
      boundaryCorrectness * 0.25 +
      semanticCoherence * 0.35 +
      namingQuality * 0.15
    );

    const issues = [];
    if (isolatedCount > 0) issues.push(`${isolatedCount} isolated node(s) with no internal connections`);
    if (structuralIntegrity < 0.3) issues.push('Very low internal connectivity');
    if (boundaryCorrectness < 0.5) issues.push('Missing boundary ports for some external connections');
    if (semanticCoherence < 0.4) issues.push('Low semantic coherence among member nodes');

    const recommendations = [];
    if (isolatedCount > 0) recommendations.push('Consider removing isolated nodes from the subgraph');
    if (structuralIntegrity < 0.5) recommendations.push('Subgraph may need more internal connections to be meaningful');
    if (namingQuality < 0.5) recommendations.push('Provide a descriptive name for the subgraph');

    return {
      qualityScore: +qualityScore.toFixed(3),
      structuralIntegrity: +structuralIntegrity.toFixed(3),
      boundaryCorrectness: +boundaryCorrectness.toFixed(3),
      semanticCoherence: +semanticCoherence.toFixed(3),
      namingQuality: +namingQuality.toFixed(3),
      issues,
      recommendations,
      summary: `Heuristic assessment: ${n} nodes, ${edges.length} edges, ${ports.length} boundary ports. ` +
        (issues.length > 0 ? `Found ${issues.length} issue(s).` : 'No issues detected.'),
      method: 'heuristic',
    };
  }

  _clamp(v) { return Math.max(0, Math.min(1, v || 0)); }

  _num(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (typeof v.toNumber === 'function') return v.toNumber();
    return Number(v) || 0;
  }
}

module.exports = { SubgraphValidator };
