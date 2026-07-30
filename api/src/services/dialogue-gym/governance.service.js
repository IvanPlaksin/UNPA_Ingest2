'use strict';

/**
 * GovernanceService (ШАГ 7A) — the ratification gate for GEPA-optimized prompts.
 * NOTHING auto-applies. A winning candidate can be APPROVED, which SAVES it as a
 * new version in the CHAT_PROMPT catalog (via the editor's saveGraph) — going
 * LIVE still requires a separate, human "Apply" in the Prompt Editor. This keeps
 * the optimizer a proposer, never a deployer.
 *
 * @module services/dialogue-gym/governance.service
 */

const GOVERNANCE_STATUS = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected' };

/** Rule-key diff between two prompt graphs (pure). */
function computePromptDiff(oldGraph, newGraph) {
  const dataByKey = (g) => new Map(((g && g.nodes) || []).filter((n) => n.data).map((n) => [n.data.key, n.data]));
  const oldMap = dataByKey(oldGraph);
  const newMap = dataByKey(newGraph);
  const diff = { added: [], removed: [], modified: [] };
  for (const [k, d] of newMap) if (!oldMap.has(k)) diff.added.push(d);
  for (const [k, d] of oldMap) if (!newMap.has(k)) diff.removed.push(d);
  for (const [k, nd] of newMap) {
    const od = oldMap.get(k);
    if (od && JSON.stringify(od) !== JSON.stringify(nd)) diff.modified.push({ key: k, old: od, new: nd });
  }
  return diff;
}

function createGovernanceService(deps = {}) {
  const candidates = deps.candidateStore || require('./candidate-store');
  const comparison = deps.comparison || require('./comparison.service');
  const promptEditor = deps.promptEditor || require('../../instances/flowdesk/services/prompt-editor.service');

  async function baselineFor(optimizationId) {
    const all = await candidates.getCandidatesForOptimization(optimizationId);
    return all.find((c) => !c.parentCandidateId) || all.sort((a, b) => a.iteration - b.iteration)[0] || null;
  }

  /** Build a human-review payload: diff vs baseline + metric comparison + sample runs. */
  async function createApprovalRequest(candidateId) {
    const candidate = await candidates.getCandidate(candidateId);
    if (!candidate) throw Object.assign(new Error('candidate not found'), { status: 404 });
    const baseline = await baselineFor(candidate.optimizationId);
    const diff = baseline ? computePromptDiff(baseline.promptGraph, candidate.promptGraph) : { added: [], removed: [], modified: [] };
    const cmp = baseline ? comparison.compareCandidates(candidate, baseline) : null;
    const improvementPercent = (baseline && typeof baseline.aggregateScore === 'number' && baseline.aggregateScore > 0 && typeof candidate.aggregateScore === 'number')
      ? ((candidate.aggregateScore - baseline.aggregateScore) / baseline.aggregateScore) * 100 : null;
    return {
      candidateId, optimizationId: candidate.optimizationId,
      status: candidate.governanceStatus || GOVERNANCE_STATUS.PENDING,
      diff, comparison: cmp, improvementPercent,
      sampleRunIds: (candidate.arenaRunIds || []).slice(0, 5),
      candidateMetrics: { aggregateScore: candidate.aggregateScore, intentAccuracyRate: candidate.intentAccuracyRate },
      baselineMetrics: baseline ? { aggregateScore: baseline.aggregateScore, intentAccuracyRate: baseline.intentAccuracyRate } : null,
    };
  }

  /**
   * Approve a candidate → SAVE it as a new CHAT_PROMPT version (does NOT apply).
   * @param {string} candidateId
   * @param {string} approvedBy
   */
  async function approve(candidateId, approvedBy) {
    const candidate = await candidates.getCandidate(candidateId);
    if (!candidate) throw Object.assign(new Error('candidate not found'), { status: 404 });
    const g = candidate.promptGraph || { nodes: [], edges: [] };
    const imp = candidate.aggregateScore != null ? candidate.aggregateScore.toFixed(3) : '?';
    const saved = await promptEditor.saveGraph({
      entryId: candidate.promptEntryId || undefined,
      nodes: g.nodes, edges: g.edges,
      changelog: `GEPA optimization (candidate ${candidateId.slice(0, 8)}, score ${imp})`,
      createdBy: approvedBy || 'gepa',
    });
    const savedAsVersion = (saved && (saved.versionNumber || saved.version)) || null;
    await candidates.updateCandidate(candidateId, { governanceStatus: GOVERNANCE_STATUS.APPROVED, savedAsVersion });
    return {
      success: true, candidateId, savedAsVersion,
      message: `Saved as version ${savedAsVersion ?? '(new)'}. Go live via the Prompt Editor "Apply" — not applied automatically.`,
    };
  }

  async function reject(candidateId, rejectedBy, reason) {
    const candidate = await candidates.getCandidate(candidateId);
    if (!candidate) throw Object.assign(new Error('candidate not found'), { status: 404 });
    await candidates.updateCandidate(candidateId, { governanceStatus: GOVERNANCE_STATUS.REJECTED });
    return { success: true, candidateId, status: GOVERNANCE_STATUS.REJECTED, rejectedBy: rejectedBy || 'admin', reason: reason || null };
  }

  return { GOVERNANCE_STATUS, computePromptDiff, createApprovalRequest, approve, reject };
}

const singleton = createGovernanceService();
module.exports = singleton;
module.exports.createGovernanceService = createGovernanceService;
module.exports.computePromptDiff = computePromptDiff;
module.exports.GOVERNANCE_STATUS = GOVERNANCE_STATUS;
