/**
 * Codex Governance Service
 *
 * Implements Graduated Autonomy model:
 * - L1: Agent proposes, human executes all changes
 * - L2: Agent proposes, human approves, system executes
 * - L3: Agent executes within boundaries, human monitors (future)
 */

const codexService = require('./codex.service');
const blackCodexService = require('./blackcodex.service');

let _memgraph = null;
function getMemgraph() {
  if (!_memgraph) {
    _memgraph = require('../memgraph.service');
  }
  return _memgraph;
}

class CodexGovernanceService {
  constructor() {
    this.namespace = 'Codex';
  }

  static STATUSES = {
    PENDING: 'PENDING',
    UNDER_REVIEW: 'UNDER_REVIEW',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    WITHDRAWN: 'WITHDRAWN',
    APPLIED: 'APPLIED'
  };

  static TRANSITIONS = {
    PENDING: ['UNDER_REVIEW', 'WITHDRAWN'],
    UNDER_REVIEW: ['APPROVED', 'REJECTED', 'PENDING'],
    APPROVED: ['APPLIED', 'REJECTED'],
    REJECTED: [],
    WITHDRAWN: [],
    APPLIED: []
  };

  /**
   * Submit a new proposal from an agent
   */
  async submitProposal(proposal, context = {}) {
    const {
      proposalType,
      targetCodexId,
      proposedChanges,
      rationale,
      agentConfidence = 0.7
    } = proposal;

    const validTypes = ['CREATE', 'MODIFY', 'DEPRECATE', 'SUPERSEDE'];
    if (!validTypes.includes(proposalType)) {
      throw new Error(`Invalid proposalType: ${proposalType}`);
    }

    // For MODIFY/DEPRECATE/SUPERSEDE, target must exist
    if (['MODIFY', 'DEPRECATE', 'SUPERSEDE'].includes(proposalType)) {
      if (!targetCodexId) {
        throw new Error(`targetCodexId required for ${proposalType} proposal`);
      }
      const target = await codexService.getByCodexId(targetCodexId);
      if (!target) {
        throw new Error(`Target node not found: ${targetCodexId}`);
      }
      const targetProps = target.properties || target;
      if (targetProps.changeabilityTier === 'FROZEN') {
        throw new Error(`Cannot modify FROZEN node: ${targetCodexId}`);
      }
    }

    const proposalNode = await codexService.createNode('CodexProposal', {
      title: `${proposalType}: ${proposal.title || targetCodexId || 'New node'}`,
      summary: proposal.summary || `Proposal to ${proposalType.toLowerCase()} Codex content`,
      rationale: rationale,
      whyItExists: `Agent ${context.agentId || 'unknown'} identified need for this change`,
      examples: proposal.examples || ['Submitted via Proposal Engine'],
      proposalType,
      targetCodexId: targetCodexId || '',
      proposedChanges: typeof proposedChanges === 'string' ? proposedChanges : JSON.stringify(proposedChanges || {}),
      agentConfidence,
      reviewStatus: 'PENDING',
      changeabilityTier: 'REVIEWED',
      tags: ['proposal', proposalType.toLowerCase()]
    }, {
      isAdmin: true,
      createdBy: context.agentId || 'agent'
    });

    const proposalCodexId = proposalNode.codexId || (proposalNode.properties && proposalNode.properties.codexId);

    // Link to target if exists
    if (targetCodexId && proposalCodexId) {
      await codexService.createRelationship(
        proposalCodexId,
        targetCodexId,
        'PROPOSES_CHANGE_TO',
        { proposalType }
      );
    }

    return {
      proposal: { ...proposalNode, codexId: proposalCodexId },
      status: 'PENDING',
      message: 'Proposal submitted successfully. Awaiting human review.'
    };
  }

  async getPendingProposals() {
    const mg = getMemgraph();
    const query = `
      MATCH (p:CodexProposal)
      WHERE p.reviewStatus = 'PENDING' OR p.reviewStatus = 'UNDER_REVIEW'
      OPTIONAL MATCH (p)-[:PROPOSES_CHANGE_TO]->(target)
      RETURN p, target
      ORDER BY p.createdAt ASC
    `;
    const result = await mg.runQuery(query);
    return result.map(r => ({ proposal: r.p, target: r.target }));
  }

  async getProposal(codexId) {
    const node = await codexService.getByCodexId(codexId);
    return node ? (node.properties || node) : null;
  }

  async transitionProposal(codexId, newStatus, context = {}) {
    const proposal = await this.getProposal(codexId);
    if (!proposal) {
      throw new Error(`Proposal not found: ${codexId}`);
    }

    const currentStatus = proposal.reviewStatus;
    const allowed = CodexGovernanceService.TRANSITIONS[currentStatus];

    if (!allowed || !allowed.includes(newStatus)) {
      throw new Error(`Invalid transition: ${currentStatus} -> ${newStatus}. Allowed: ${(allowed || []).join(', ')}`);
    }

    const mg = getMemgraph();
    const query = `
      MATCH (p:CodexProposal {codexId: $codexId})
      SET p.reviewStatus = $newStatus,
          p.reviewedBy = $reviewedBy,
          p.reviewedAt = $now,
          p.reviewNotes = $notes
      RETURN p
    `;

    const result = await mg.runQuery(query, {
      codexId,
      newStatus,
      reviewedBy: context.reviewedBy || 'admin',
      now: new Date().toISOString(),
      notes: context.notes || ''
    });

    return result[0]?.p?.properties || result[0]?.p;
  }

  async startReview(codexId, reviewerId) {
    return this.transitionProposal(codexId, 'UNDER_REVIEW', {
      reviewedBy: reviewerId,
      notes: 'Review started'
    });
  }

  async approveProposal(codexId, reviewerId, notes = '') {
    const proposal = await this.transitionProposal(codexId, 'APPROVED', {
      reviewedBy: reviewerId,
      notes: notes || 'Approved'
    });
    return {
      proposal,
      nextStep: 'Call applyProposal() to execute the approved changes'
    };
  }

  async rejectProposal(codexId, reviewerId, reason) {
    if (!reason) {
      throw new Error('Rejection reason required');
    }

    const proposal = await this.getProposal(codexId);

    await blackCodexService.createEntry('RejectedProposal', {
      title: `Rejected: ${proposal.title}`,
      summary: proposal.summary,
      failureContext: `Proposal ${codexId} was rejected during review`,
      symptom: 'Proposal did not meet approval criteria',
      rootCause: reason,
      refactoringPlan: 'Revise proposal based on feedback and resubmit',
      tags: ['rejected-proposal']
    }, { createdBy: reviewerId });

    return this.transitionProposal(codexId, 'REJECTED', {
      reviewedBy: reviewerId,
      notes: reason
    });
  }

  async applyProposal(codexId, adminContext = {}) {
    const proposal = await this.getProposal(codexId);

    if (!proposal) {
      throw new Error(`Proposal not found: ${codexId}`);
    }
    if (proposal.reviewStatus !== 'APPROVED') {
      throw new Error(`Proposal must be APPROVED to apply. Current: ${proposal.reviewStatus}`);
    }

    let proposedChanges = proposal.proposedChanges;
    if (typeof proposedChanges === 'string') {
      try { proposedChanges = JSON.parse(proposedChanges); } catch { proposedChanges = {}; }
    }
    const proposalType = proposal.proposalType;
    const targetCodexId = proposal.targetCodexId;

    let result;

    switch (proposalType) {
      case 'CREATE':
        result = await codexService.createNode(
          proposedChanges.nodeType || 'CodexRule',
          proposedChanges,
          { isAdmin: true, createdBy: `proposal:${codexId}` }
        );
        break;

      case 'MODIFY':
        result = await this._applyModification(targetCodexId, proposedChanges);
        break;

      case 'DEPRECATE':
        result = await this._applyDeprecation(targetCodexId, proposal.rationale);
        break;

      case 'SUPERSEDE':
        result = await this._applySupersede(targetCodexId, proposedChanges);
        break;

      default:
        throw new Error(`Unknown proposal type: ${proposalType}`);
    }

    await this.transitionProposal(codexId, 'APPLIED', {
      reviewedBy: adminContext.adminId || 'system',
      notes: `Applied successfully`
    });

    // Auto-bump Codex patch version on every applied proposal
    let newVersion = null;
    try {
      newVersion = await this._bumpCodexVersion(codexId);
      console.log(`[CodexGovernance] Version bumped to ${newVersion} (trigger: ${codexId})`);
    } catch (bumpErr) {
      console.error(`[CodexGovernance] Version bump failed: ${bumpErr.message}`);
    }

    return { proposal, result, status: 'APPLIED', codexVersion: newVersion };
  }

  async _applyModification(targetCodexId, changes) {
    const mg = getMemgraph();
    const safeKeys = Object.keys(changes)
      .filter(k => !['id', 'codexId', 'namespace', 'createdAt'].includes(k));

    if (safeKeys.length === 0) return null;

    const setParts = safeKeys.map(k => `n.${k} = $changes.${k}`).join(', ');
    const query = `
      MATCH (n {codexId: $targetCodexId, namespace: 'Codex'})
      SET ${setParts}, n.updatedAt = $now
      RETURN n
    `;

    const result = await mg.runQuery(query, {
      targetCodexId,
      changes,
      now: new Date().toISOString()
    });

    return result[0]?.n;
  }

  async _applyDeprecation(targetCodexId, reason) {
    const mg = getMemgraph();
    const query = `
      MATCH (n {codexId: $targetCodexId, namespace: 'Codex'})
      SET n.status = 'DEPRECATED',
          n.deprecatedAt = $now,
          n.deprecationReason = $reason
      RETURN n
    `;
    const result = await mg.runQuery(query, {
      targetCodexId,
      now: new Date().toISOString(),
      reason
    });
    return result[0]?.n;
  }

  async _applySupersede(targetCodexId, newNodeData) {
    const newNode = await codexService.createNode(
      newNodeData.nodeType || 'CodexRule',
      { ...newNodeData, previousVersion: targetCodexId },
      { isAdmin: true, createdBy: 'governance-supersede' }
    );

    const mg = getMemgraph();
    const newCodexId = newNode.codexId || (newNode.properties && newNode.properties.codexId);
    await mg.runQuery(`
      MATCH (old {codexId: $targetCodexId, namespace: 'Codex'})
      MATCH (new {codexId: $newCodexId, namespace: 'Codex'})
      SET old.status = 'SUPERSEDED'
      CREATE (new)-[:SUPERSEDES {since: $now, reason: 'Governance approval'}]->(old)
    `, {
      targetCodexId,
      newCodexId,
      now: new Date().toISOString()
    });

    return newNode;
  }

  /**
   * Increment Codex patch version (0.1.3 → 0.1.4) and record the triggering proposal
   */
  async _bumpCodexVersion(triggerProposalId) {
    const mg = getMemgraph();
    const result = await mg.runQuery(`
      MATCH (m:CodexMetadata {id: 'codex-metadata'})
      RETURN m.version AS version
    `);

    const current = result[0]?.version || '0.1.0';
    const parts = current.split('.');
    const patch = parseInt(parts[2] || '0', 10) + 1;
    const newVersion = `${parts[0]}.${parts[1]}.${patch}`;

    await mg.runQuery(`
      MATCH (m:CodexMetadata {id: 'codex-metadata'})
      SET m.version = $newVersion,
          m.lastBumpAt = $now,
          m.lastBumpTrigger = $trigger
    `, {
      newVersion,
      now: new Date().toISOString(),
      trigger: triggerProposalId
    });

    return newVersion;
  }

  /**
   * Get current Codex version from metadata node
   */
  async getCodexVersion() {
    const mg = getMemgraph();
    const result = await mg.runQuery(`
      MATCH (m:CodexMetadata {id: 'codex-metadata'})
      RETURN m.version AS version
    `);
    return result[0]?.version || '0.1.0';
  }

  async getProposalStats() {
    const mg = getMemgraph();
    const query = `
      MATCH (p:CodexProposal)
      RETURN p.reviewStatus AS status, p.proposalType AS type, count(*) AS count
    `;
    const result = await mg.runQuery(query);
    const stats = { total: 0, byStatus: {}, byType: {} };
    for (const row of result) {
      stats.total += row.count;
      stats.byStatus[row.status] = (stats.byStatus[row.status] || 0) + row.count;
      stats.byType[row.type] = (stats.byType[row.type] || 0) + row.count;
    }
    return stats;
  }
}

module.exports = new CodexGovernanceService();
