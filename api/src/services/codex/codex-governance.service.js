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
   * Submit a new proposal from an agent.
   *
   * Accepts structured fields matching the Information Contract:
   *   title, summary, rationale, whyItExists, examples, scope, modality, etc.
   * These fields are stored both on the proposal itself (for review)
   * and inside proposedChanges (for apply-time node creation).
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
      throw new Error(`Invalid proposalType: ${proposalType}. Valid: ${validTypes.join(', ')}`);
    }

    // Validate narrative fields — refuse incomplete proposals
    if (!proposal.rationale && !rationale) {
      throw new Error('Proposal rejected: "rationale" is required. Explain WHY this rule must exist.');
    }
    if (!proposal.summary) {
      throw new Error('Proposal rejected: "summary" is required. Describe what this rule prescribes in 1-2 sentences.');
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

    // Build enriched proposedChanges: merge explicit proposedChanges with
    // top-level structured fields so apply-time CREATE has full data
    let enrichedChanges = typeof proposedChanges === 'string'
      ? (() => { try { return JSON.parse(proposedChanges); } catch { return {}; } })()
      : { ...(proposedChanges || {}) };

    // Narrative fields from proposal override sparse proposedChanges
    if (proposal.title && !enrichedChanges.title) enrichedChanges.title = proposal.title;
    if (proposal.summary && !enrichedChanges.summary) enrichedChanges.summary = proposal.summary;
    if (proposal.rationale && !enrichedChanges.rationale) enrichedChanges.rationale = proposal.rationale;
    if (proposal.whyItExists && !enrichedChanges.whyItExists) enrichedChanges.whyItExists = proposal.whyItExists;
    if (proposal.examples?.length && !enrichedChanges.examples?.length) enrichedChanges.examples = proposal.examples;
    if (proposal.scope?.length && !enrichedChanges.scope?.length) enrichedChanges.scope = proposal.scope;
    if (proposal.modality && !enrichedChanges.modality) enrichedChanges.modality = proposal.modality;
    if (proposal.ruleKind && !enrichedChanges.ruleKind) enrichedChanges.ruleKind = proposal.ruleKind;
    if (proposal.derivesFromPrinciple && !enrichedChanges.derivesFromPrinciple) {
      enrichedChanges.derivesFromPrinciple = proposal.derivesFromPrinciple;
    }

    const proposalNode = await codexService.createNode('CodexProposal', {
      title: `${proposalType}: ${proposal.title || targetCodexId || 'New node'}`,
      summary: proposal.summary,
      rationale: proposal.rationale || rationale,
      whyItExists: proposal.whyItExists || `Agent ${context.agentId || 'unknown'} identified need for this change`,
      examples: (proposal.examples?.length) ? proposal.examples : ['No examples provided — reviewer should request'],
      proposalType,
      targetCodexId: targetCodexId || '',
      proposedChanges: JSON.stringify(enrichedChanges),
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

    // === APPLY-TIME ENRICHMENT ===
    // Defense-in-depth: pull narrative fields from the proposal node itself
    // into proposedChanges. Covers old proposals with sparse proposedChanges
    // and any future edge case where submit-time enrichment was incomplete.
    const _deserialize = (v) => {
      if (typeof v !== 'string') return v;
      try { const p = JSON.parse(v); return Array.isArray(p) ? p : v; } catch { return v; }
    };

    const narrativeFields = ['title', 'summary', 'rationale', 'whyItExists'];
    for (const field of narrativeFields) {
      if (!proposedChanges[field] && proposal[field]) {
        // Strip proposal-specific prefixes from title (e.g., "CREATE: ...")
        let value = proposal[field];
        if (field === 'title' && typeof value === 'string') {
          value = value.replace(/^(CREATE|MODIFY|DEPRECATE|SUPERSEDE):\s*/i, '');
        }
        proposedChanges[field] = value;
      }
    }
    // Arrays need deserialization (stored as JSON strings in Memgraph)
    if (!proposedChanges.examples || !proposedChanges.examples.length) {
      const pExamples = _deserialize(proposal.examples);
      if (Array.isArray(pExamples) && pExamples.length > 0
          && pExamples[0] !== 'Submitted via Proposal Engine'
          && pExamples[0] !== 'No examples provided — reviewer should request') {
        proposedChanges.examples = pExamples;
      }
    }
    if (!proposedChanges.scope || !proposedChanges.scope.length) {
      const pScope = _deserialize(proposal.scope);
      if (Array.isArray(pScope) && pScope.length > 0) {
        proposedChanges.scope = pScope;
      }
    }
    const optionalFields = ['modality', 'ruleKind', 'derivesFromPrinciple'];
    for (const field of optionalFields) {
      if (!proposedChanges[field] && proposal[field]) {
        proposedChanges[field] = proposal[field];
      }
    }

    // === APPLY-TIME VALIDATION ===
    // Refuse to create empty shells — require minimum content quality
    const proposalType = proposal.proposalType;
    if (proposalType === 'CREATE') {
      const missing = [];
      if (!proposedChanges.summary || proposedChanges.summary.length < 10) missing.push('summary (min 10 chars)');
      if (!proposedChanges.rationale || proposedChanges.rationale.length < 15) missing.push('rationale (min 15 chars)');
      if (missing.length > 0) {
        throw new Error(
          `Cannot apply proposal ${codexId}: created node would be incomplete. ` +
          `Missing required fields: ${missing.join(', ')}. ` +
          `Re-submit the proposal with complete data using codex_propose_change tool.`
        );
      }

      // Validate derivesFromPrinciple references an existing principle — prevent dangling refs
      if (proposedChanges.derivesFromPrinciple) {
        const mg = getMemgraph();
        const exists = await mg.runQuery(
          'MATCH (p:CodexPrinciple {codexId: $pid}) RETURN p.codexId AS id',
          { pid: proposedChanges.derivesFromPrinciple }
        );
        if (exists.length === 0) {
          // Strip invalid reference rather than reject — link can be added later
          console.warn(`[CodexGovernance] derivesFromPrinciple '${proposedChanges.derivesFromPrinciple}' does not exist — removing from proposedChanges`);
          delete proposedChanges.derivesFromPrinciple;
        }
      }
    }

    const targetCodexId = proposal.targetCodexId;

    let result;

    switch (proposalType) {
      case 'CREATE':
        result = await codexService.createNode(
          proposedChanges.nodeType || 'CodexRule',
          proposedChanges,
          { isAdmin: true, createdBy: `proposal:${codexId}` }
        );
        // Create graph relationships so the new node is visible in UI
        await this._linkNewNode(result, proposedChanges);
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
   * Link a newly created node into the Codex graph so it appears in UI views.
   * Creates DERIVES_FROM relationship to principle (for graph view)
   * and optionally links to a governance section (for hierarchy view).
   */
  async _linkNewNode(createdNode, proposedChanges) {
    const mg = getMemgraph();
    const nodeProps = createdNode?.properties || createdNode || {};
    const newCodexId = nodeProps.codexId;
    if (!newCodexId) return;

    // 1. Create DERIVES_FROM → Principle relationship (makes node visible in graph view)
    const principleId = proposedChanges.derivesFromPrinciple;
    if (principleId) {
      try {
        await mg.runQuery(`
          MATCH (r {codexId: $newCodexId, namespace: 'Codex'})
          MATCH (p:CodexPrinciple {codexId: $principleId, namespace: 'Codex'})
          MERGE (r)-[:DERIVES_FROM {strength: 'direct', createdAt: $now}]->(p)
        `, { newCodexId, principleId, now: new Date().toISOString() });
      } catch (err) {
        console.warn(`[CodexGovernance] Could not link to principle ${principleId}: ${err.message}`);
      }
    }

    // 2. Ensure a "Governance Rules" section exists and link the rule to it
    //    (makes node visible in hierarchy/tree view)
    const nodeType = proposedChanges.nodeType || 'CodexRule';
    if (['CodexRule', 'CodexPattern', 'CodexDefinition', 'CodexConstraint'].includes(nodeType)) {
      try {
        await mg.runQuery(`
          MERGE (gp:CodexPart {partId: 'GOVERNANCE'})
          ON CREATE SET gp.title = 'Governance Rules',
                        gp.namespace = 'Codex',
                        gp.description = 'Rules created through the Codex governance proposal system',
                        gp.order = 999
          MERGE (gs:CodexSection {codexId: 'CODEX-SECTION-GOV'})
          ON CREATE SET gs.sectionId = 'GOV-PROPOSALS',
                        gs.namespace = 'Codex',
                        gs.title = 'Approved Proposals',
                        gs.description = 'Rules approved via governance workflow',
                        gs.order = 1
          MERGE (gp)-[:HAS_SECTION]->(gs)
          WITH gs
          MATCH (r {codexId: $newCodexId, namespace: 'Codex'})
          MERGE (gs)-[:CONTAINS_RULE]->(r)
        `, { newCodexId });
      } catch (err) {
        console.warn(`[CodexGovernance] Could not link to governance section: ${err.message}`);
      }
    }
  }

  /**
   * Increment Codex patch version (0.1.3 → 0.1.4) and record the triggering proposal.
   * Uses MERGE to auto-create CodexMetadata node if it doesn't exist.
   */
  async _bumpCodexVersion(triggerProposalId) {
    const mg = getMemgraph();

    // MERGE ensures the metadata node exists (creates if missing)
    const result = await mg.runQuery(`
      MERGE (m:CodexMetadata {id: 'codex-metadata'})
      ON CREATE SET m.version = '0.1.0', m.createdAt = $now
      RETURN m.version AS version
    `, { now: new Date().toISOString() });

    const current = result[0]?.version || '0.1.0';
    const parts = current.split('.');
    const patch = parseInt(parts[2] || '0', 10) + 1;
    const newVersion = `${parts[0]}.${parts[1]}.${patch}`;

    await mg.runQuery(`
      MERGE (m:CodexMetadata {id: 'codex-metadata'})
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
