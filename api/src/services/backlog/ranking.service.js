/**
 * BackLog Ranking Service
 *
 * Scores and ranks BackLog tasks by:
 *   1. Priority (0.25) — P0=1.0, P1=0.75, P2=0.5, P3=0.25
 *   2. Rule Modality (0.20) — MUST=1.0, SHOULD=0.5, MAY=0.25
 *   3. Dependency Score (0.25) — unblocks others + blocked depth
 *   4. Impact Scope (0.15) — related rules, sources, affected files
 *   5. Effort ROI (0.15) — smaller effort = higher ROI
 */

let _memgraph = null;
function mg() {
  if (!_memgraph) _memgraph = require('../memgraph.service');
  return _memgraph;
}

const WEIGHTS = {
  priority: 0.25,
  modality: 0.20,
  dependency: 0.25,
  impact: 0.15,
  effortROI: 0.15,
};

const PRIORITY_SCORES = { P0_CRITICAL: 1.0, P1_HIGH: 0.75, P2_MEDIUM: 0.5, P3_LOW: 0.25 };
const MODALITY_SCORES = { MUST: 1.0, SHOULD: 0.5, MAY: 0.25 };
const EFFORT_ROI = { XS: 1.0, S: 0.85, M: 0.6, L: 0.35, XL: 0.15 };

class RankingService {

  /**
   * Get ranked list of open BackLog tasks with scores and rationale.
   */
  async getRankedTasks(options = {}) {
    const { includeCompleted = false, limit = 50, namespace = null } = options;

    // 1. Load all tasks (filter by namespace if specified)
    const statusFilter = includeCompleted
      ? ''
      : "AND b.status IN ['PROPOSED','APPROVED','IN_PROGRESS','BLOCKED','REVIEW']";
    const nsFilter = namespace ? 'AND b.namespace = $namespace' : '';

    const tasks = await mg().runQuery(`
      MATCH (b:BackLogTask)
      WHERE true ${statusFilter} ${nsFilter}
      OPTIONAL MATCH (b)-[:IMPLEMENTS]->(r:CodexRule)
      OPTIONAL MATCH (b)-[:SOURCED_FROM]->(s:SourceReference)
      RETURN b,
             collect(DISTINCT r.modality) as modalities,
             collect(DISTINCT r.codexId) as ruleIds,
             count(DISTINCT s) as sourceCount
      ORDER BY b.backlogId
    `, namespace ? { namespace } : {});

    // 2. Load dependency graph
    const deps = await this._loadDependencyGraph();

    // 3. Score each task
    const scored = tasks.map(row => {
      const t = row.b?.properties || row.b || {};
      const modalities = row.modalities || [];
      const ruleIds = row.ruleIds || [];
      const sourceCount = row.sourceCount || 0;

      const scores = this._scoreTask(t, modalities, sourceCount, deps);
      const totalScore = this._calculateTotal(scores);
      const rationale = this._generateRationale(t, scores, modalities, ruleIds, deps);
      const detailedRationale = this._generateDetailedRationale(t, scores, modalities, ruleIds, deps);

      return {
        backlogId: t.backlogId,
        title: t.title,
        status: t.status,
        priority: t.priority,
        taskType: t.taskType,
        effort: t.effort,
        namespace: t.namespace || 'CORE',
        targetPath: t.targetPath,
        score: Math.round(totalScore * 1000) / 1000,
        scores,
        rationale,
        detailedRationale,
        relatedRules: ruleIds,
        sourceCount,
        blockedBy: deps.blockedBy[t.backlogId] || [],
        unblocks: deps.unblocks[t.backlogId] || [],
      };
    });

    // 4. Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit);
  }

  /**
   * Get dependency graph data for visualization.
   */
  async getDependencyGraph() {
    const nodes = await mg().runQuery(`
      MATCH (b:BackLogItem)
      WHERE b.namespace = 'CORE' AND b.status IN ['PROPOSED','APPROVED','IN_PROGRESS','BLOCKED','REVIEW']
      RETURN b.backlogId as id, b.title as label, b.status as status, b.priority as priority
    `);

    const edges = await mg().runQuery(`
      MATCH (a:BackLogItem)-[:DEPENDS_ON]->(b:BackLogItem)
      RETURN a.backlogId as source, b.backlogId as target
    `);

    return {
      nodes: nodes.map(n => ({ id: n.id, label: n.label, status: n.status, priority: n.priority })),
      edges: edges.map(e => ({ source: e.source, target: e.target })),
    };
  }

  /**
   * Suggest optimal execution groups (parallelizable batches).
   */
  async getExecutionPlan(rankedTasks = null) {
    if (!rankedTasks) rankedTasks = await this.getRankedTasks();
    const deps = await this._loadDependencyGraph();

    const batches = [];
    const completed = new Set();
    let remaining = rankedTasks.filter(t => !['DONE', 'REJECTED', 'CANCELLED'].includes(t.status));

    while (remaining.length > 0) {
      // Find tasks whose dependencies are all completed
      const ready = remaining.filter(t => {
        const blockers = deps.blockedBy[t.backlogId] || [];
        return blockers.every(b => completed.has(b));
      });

      if (ready.length === 0) {
        // Circular or unresolvable — add remaining as final batch
        batches.push({ batch: batches.length + 1, tasks: remaining.map(t => t.backlogId), note: 'Unresolved dependencies' });
        break;
      }

      batches.push({
        batch: batches.length + 1,
        tasks: ready.map(t => t.backlogId),
        parallelizable: true,
      });

      ready.forEach(t => completed.add(t.backlogId));
      remaining = remaining.filter(t => !completed.has(t.backlogId));
    }

    return batches;
  }

  // ============================================================
  // SCORING INTERNALS
  // ============================================================

  _scoreTask(task, modalities, sourceCount, deps) {
    const priorityScore = PRIORITY_SCORES[task.priority] || 0.5;

    // Highest modality among related rules
    let modalityScore = 0.25; // default if no rules
    for (const m of modalities) {
      const s = MODALITY_SCORES[m] || 0;
      if (s > modalityScore) modalityScore = s;
    }

    // Dependency: how many tasks this unblocks + penalty for being blocked
    const unblockCount = (deps.unblocks[task.backlogId] || []).length;
    const blockedByCount = (deps.blockedBy[task.backlogId] || []).length;
    const maxDep = Math.max(deps.maxUnblocks || 1, 1);
    const depScore = Math.min(1.0, (unblockCount * 2) / (maxDep * 2 + 1)) * (blockedByCount === 0 ? 1.0 : 0.5);

    // Impact: sources + related rules (more = more impactful)
    const impactScore = Math.min(1.0, (sourceCount * 0.3 + (modalities.length > 0 ? 0.4 : 0)));

    // Effort ROI: smaller tasks = higher return
    const effortScore = EFFORT_ROI[task.effort] || 0.5;

    return {
      priority: Math.round(priorityScore * 1000) / 1000,
      modality: Math.round(modalityScore * 1000) / 1000,
      dependency: Math.round(depScore * 1000) / 1000,
      impact: Math.round(impactScore * 1000) / 1000,
      effortROI: Math.round(effortScore * 1000) / 1000,
    };
  }

  _calculateTotal(scores) {
    return Object.entries(WEIGHTS).reduce((total, [key, weight]) => {
      return total + (scores[key] || 0) * weight;
    }, 0);
  }

  _generateRationale(task, scores, modalities, ruleIds, deps) {
    const parts = [];

    // Priority
    if (scores.priority >= 0.75) parts.push(`High priority (${task.priority})`);

    // Modality
    if (modalities.includes('MUST')) parts.push(`Enforces MUST rule${ruleIds.length > 1 ? 's' : ''}: ${ruleIds.join(', ')}`);
    else if (modalities.includes('SHOULD')) parts.push(`Addresses SHOULD rule: ${ruleIds.join(', ')}`);

    // Dependencies
    const unblocks = deps.unblocks[task.backlogId] || [];
    if (unblocks.length > 0) parts.push(`Unblocks ${unblocks.length} other task${unblocks.length > 1 ? 's' : ''}`);
    const blockedBy = deps.blockedBy[task.backlogId] || [];
    if (blockedBy.length > 0) parts.push(`Blocked by: ${blockedBy.join(', ')}`);
    if (blockedBy.length === 0 && unblocks.length > 0) parts.push('No blockers — ready to start');

    // Effort
    if (['XS', 'S'].includes(task.effort)) parts.push(`Quick win (effort: ${task.effort})`);
    else if (['L', 'XL'].includes(task.effort)) parts.push(`Large effort (${task.effort}) — consider splitting`);

    return parts.join('. ') + '.';
  }

  async _loadDependencyGraph() {
    const edges = await mg().runQuery(`
      MATCH (a:BackLogItem)-[:DEPENDS_ON]->(b:BackLogItem)
      RETURN a.backlogId as from, b.backlogId as to
    `);

    const blockedBy = {}; // task → [tasks it depends on]
    const unblocks = {};  // task → [tasks it unblocks]

    for (const e of edges) {
      if (!blockedBy[e.from]) blockedBy[e.from] = [];
      blockedBy[e.from].push(e.to);
      if (!unblocks[e.to]) unblocks[e.to] = [];
      unblocks[e.to].push(e.from);
    }

    const maxUnblocks = Math.max(...Object.values(unblocks).map(a => a.length), 0);

    return { blockedBy, unblocks, maxUnblocks, edges };
  }

  // ============================================================
  // DETAILED RATIONALE
  // ============================================================

  _generateDetailedRationale(task, scores, modalities, ruleIds, deps) {
    const lines = [`Score: ${this._calculateTotal(scores).toFixed(3)}/1.000`];
    lines.push(`• Priority: ${task.priority} (${scores.priority}) — weight ${WEIGHTS.priority}`);
    lines.push(`• Modality: ${modalities.includes('MUST') ? 'MUST rule' : modalities.includes('SHOULD') ? 'SHOULD rule' : 'no linked rule'} (${scores.modality})${ruleIds.length ? ' — ' + ruleIds.join(', ') : ''}`);

    const unblocks = deps.unblocks[task.backlogId] || [];
    const blockedBy = deps.blockedBy[task.backlogId] || [];
    lines.push(`• Dependencies: ${unblocks.length ? 'unblocks ' + unblocks.length + ' tasks' : 'unblocks none'}${blockedBy.length ? ', blocked by ' + blockedBy.join(', ') : ', no blockers'} (${scores.dependency})`);
    lines.push(`• Impact: ${task.sourceCount || 0} sources (${scores.impact})`);
    lines.push(`• Effort ROI: ${task.effort || '?'} (${scores.effortROI}) — ${['XS', 'S'].includes(task.effort) ? 'quick win' : ['L', 'XL'].includes(task.effort) ? 'large, consider splitting' : 'moderate'}`);

    return lines.join('\n');
  }

  // ============================================================
  // PERSISTENCE — Save rankings to KB
  // ============================================================

  /**
   * Save ranking results to Memgraph as RankingRecord nodes.
   */
  async saveRankings(rankedTasks) {
    const now = new Date().toISOString();
    let saved = 0;

    for (let i = 0; i < rankedTasks.length; i++) {
      const t = rankedTasks[i];
      try {
        // Upsert RankingRecord
        await mg().runQuery(`
          MATCH (b:BackLogTask {backlogId: $backlogId})
          MERGE (b)-[:HAS_RANKING]->(r:RankingRecord {backlogId: $backlogId})
          SET r.score = $score,
              r.priorityScore = $priorityScore,
              r.modalityScore = $modalityScore,
              r.dependencyScore = $dependencyScore,
              r.impactScore = $impactScore,
              r.effortScore = $effortScore,
              r.rationale = $rationale,
              r.detailedRationale = $detailedRationale,
              r.namespace = $namespace,
              r.executionOrder = $order,
              r.rankedAt = $now,
              r.rankedBy = 'ranking-service'
        `, {
          backlogId: t.backlogId,
          score: t.score,
          priorityScore: t.scores.priority,
          modalityScore: t.scores.modality,
          dependencyScore: t.scores.dependency,
          impactScore: t.scores.impact,
          effortScore: t.scores.effortROI,
          rationale: t.rationale,
          detailedRationale: t.detailedRationale,
          namespace: t.namespace,
          order: i + 1,
          now
        });
        saved++;
      } catch (e) {
        console.warn(`[Ranking] Failed to save ${t.backlogId}:`, e.message);
      }
    }

    return { saved, total: rankedTasks.length, rankedAt: now };
  }

  /**
   * Get ranked tasks grouped by namespace.
   */
  async getRankedByNamespace(options = {}) {
    const ranked = await this.getRankedTasks(options);
    const grouped = {};

    for (const t of ranked) {
      const ns = t.namespace || 'CORE';
      if (!grouped[ns]) grouped[ns] = [];
      grouped[ns].push(t);
    }

    // Sort within each namespace by score
    for (const ns of Object.keys(grouped)) {
      grouped[ns].sort((a, b) => b.score - a.score);
    }

    // Namespace order: CORE first, then alphabetical
    const ordered = {};
    const keys = Object.keys(grouped).sort((a, b) => {
      if (a === 'CORE') return -1;
      if (b === 'CORE') return 1;
      return a.localeCompare(b);
    });
    for (const k of keys) ordered[k] = grouped[k];

    return ordered;
  }

  /**
   * Get available namespaces with task counts.
   */
  async getNamespaces() {
    const result = await mg().runQuery(`
      MATCH (b:BackLogTask)
      WHERE b.status IN ['PROPOSED','APPROVED','IN_PROGRESS','BLOCKED','REVIEW']
      RETURN b.namespace as namespace, count(b) as count
      ORDER BY count DESC
    `);
    return result.map(r => ({ namespace: r.namespace || 'CORE', count: r.count }));
  }
}

module.exports = new RankingService();
