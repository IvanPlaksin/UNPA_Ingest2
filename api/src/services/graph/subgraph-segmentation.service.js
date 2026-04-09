/**
 * SubgraphSegmentationService — orchestrates all Phase 1 components:
 *   GraphAnalyzer → CommunityDetector → SemanticClusterer
 *   → OntologyLayerSplitter → CoherenceEvaluator
 *
 * Produces a unified analysis with ranked candidate segments
 * ready for Phase 2 extraction.
 */

const { GraphAnalyzer } = require('./graph-analyzer');
const { CommunityDetector } = require('./community-detector');
const { SemanticClusterer } = require('./semantic-clusterer');
const { OntologyLayerSplitter } = require('./ontology-layer-splitter');
const { CoherenceEvaluator } = require('./coherence-evaluator');

class SubgraphSegmentationService {
  constructor() {
    this.analyzer = new GraphAnalyzer();
    this.communityDetector = new CommunityDetector();
    this.semanticClusterer = new SemanticClusterer();
    this.ontologySplitter = new OntologyLayerSplitter();
    this.coherenceEvaluator = new CoherenceEvaluator();
  }

  /**
   * Full analysis pipeline for a namespace.
   * @param {string} namespace
   * @param {{ strategies?: string[], useLlm?: boolean }} opts
   *   strategies: subset of ['community', 'semantic', 'ontology'] (default: all)
   *   useLlm: whether to use LLM for coherence (default: true)
   * @returns {Promise<SegmentationResult>}
   */
  async analyze(namespace, opts = {}) {
    const {
      strategies = ['community', 'semantic', 'ontology'],
      useLlm = true,
    } = opts;
    const start = Date.now();

    // ── Step 1: Structural analysis ─────────────────────────
    console.log(`[Segmentation] Analyzing structure of namespace "${namespace}"...`);
    const structural = await this.analyzer.analyze(namespace);
    console.log(`[Segmentation]   ${structural.nodeCount} nodes, ${structural.edgeCount} edges, density=${structural.density}`);

    if (structural.nodeCount < 3) {
      return {
        structural,
        candidates: [],
        bestCandidate: null,
        durationMs: Date.now() - start,
        error: 'Too few nodes for segmentation',
      };
    }

    // ── Step 2: Run selected strategies in parallel ─────────
    const strategyResults = {};

    const tasks = [];
    if (strategies.includes('community')) {
      tasks.push(
        this.communityDetector.detect(namespace)
          .then(r => { strategyResults.community = r; })
          .catch(e => { strategyResults.community = { clusters: [], error: e.message }; })
      );
    }
    if (strategies.includes('semantic')) {
      tasks.push(
        this.semanticClusterer.cluster(namespace)
          .then(r => { strategyResults.semantic = r; })
          .catch(e => { strategyResults.semantic = { clusters: [], error: e.message }; })
      );
    }
    if (strategies.includes('ontology')) {
      tasks.push(
        this.ontologySplitter.split(namespace)
          .then(r => { strategyResults.ontology = r; })
          .catch(e => { strategyResults.ontology = { clusters: [], error: e.message }; })
      );
    }

    await Promise.all(tasks);

    // ── Step 3: Collect all candidate clusters ──────────────
    const allCandidates = [];

    for (const [strategy, result] of Object.entries(strategyResults)) {
      if (!result.clusters) continue;
      for (const cluster of result.clusters) {
        allCandidates.push({
          strategy: cluster.strategy || strategy,
          nodes: cluster.nodes,
          nodeDetails: cluster.nodeDetails,
          nodeCount: cluster.nodeCount || cluster.nodes.length,
          layer: cluster.layer, // only for ontology
          communityId: cluster.communityId,
          clusterId: cluster.clusterId,
        });
      }
    }

    console.log(`[Segmentation]   ${allCandidates.length} candidate clusters found across ${Object.keys(strategyResults).length} strategies`);

    // ── Step 4: Evaluate coherence ──────────────────────────
    let evaluatedCandidates = allCandidates;
    if (allCandidates.length > 0) {
      console.log(`[Segmentation]   Evaluating coherence (useLlm=${useLlm})...`);
      evaluatedCandidates = await this.coherenceEvaluator.evaluateClusters(
        allCandidates, namespace, { useLlm }
      );
    }

    // ── Step 5: Rank by coherence score ─────────────────────
    evaluatedCandidates.sort((a, b) => (b.coherenceScore || 0) - (a.coherenceScore || 0));

    const result = {
      structural,
      strategies: strategyResults,
      candidates: evaluatedCandidates,
      bestCandidate: evaluatedCandidates[0] || null,
      durationMs: Date.now() - start,
    };

    console.log(`[Segmentation] Done in ${result.durationMs}ms. Best candidate: "${evaluatedCandidates[0]?.suggestedName}" (score=${evaluatedCandidates[0]?.coherenceScore})`);
    return result;
  }
}

// Singleton
const subgraphSegmentationService = new SubgraphSegmentationService();

module.exports = { SubgraphSegmentationService, subgraphSegmentationService };
