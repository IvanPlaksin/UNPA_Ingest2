'use strict';

/**
 * MetacognitionService — KB self-improvement through structural and semantic analysis
 *
 * Phases: DETECT → EVALUATE → PROPOSE → APPROVE → EXECUTE
 *
 * Autonomy Levels:
 *   L0 Auto         — no approval (add_tag, fix_typo)
 *   L1 Auto+Audit   — 15% sampled (add_entity, add_relationship)
 *   L2 SingleReview  — approval required, 4h SLA (modify_content, merge_duplicates)
 *   L3 ExpertReview  — approval required, 8h SLA (resolve_contradiction)
 *   L4 DualApproval  — 2 reviewers, 24h SLA (modify_schema, bulk_operation)
 */

const crypto = require('crypto');
const memgraphService = require('../memgraph.service');
const redisService = require('../redis.service');
const logger = require('../../utils/logger').child('Metacognition');

// Autonomy level definitions
const AUTONOMY_LEVELS = {
  L0: { name: 'Auto',         approvalRequired: false, sampleRate: 0,    slaHours: null },
  L1: { name: 'Auto+Audit',   approvalRequired: false, sampleRate: 0.15, slaHours: null },
  L2: { name: 'SingleReview', approvalRequired: true,  sampleRate: 1,    slaHours: 4    },
  L3: { name: 'ExpertReview', approvalRequired: true,  sampleRate: 1,    slaHours: 8    },
  L4: { name: 'DualApproval', approvalRequired: true,  sampleRate: 1,    slaHours: 24,  dualApproval: true }
};

// Issue type → autonomy level mapping
const ISSUE_AUTONOMY = {
  'ORPHAN_NODE':         'L0',
  'MISSING_NAMESPACE':   'L1',
  'STALE_NODE':          'L0',
  'MISSING_EDGE':        'L1',
  'TRANSITIVE_GAP':      'L2',
  'DUPLICATE_NODE':      'L2',
  'SEMANTIC_CONFLICT':   'L3',
  'CONTRADICTION':       'L3',
  'SCHEMA_CHANGE':       'L4',
  'BULK_OPERATION':      'L4'
};

// Severity weights for prioritization
const SEVERITY_WEIGHT = { error: 10, warning: 5, info: 1 };

const PROPOSALS_KEY = 'metacognition:proposals';
const STATS_KEY = 'metacognition:stats';

class MetacognitionService {

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1: DETECT
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Detect structural issues in the Knowledge Graph
   */
  async detectStructuralIssues() {
    const issues = [];
    const startTime = Date.now();

    // 1. Orphan nodes (no relationships)
    try {
      const orphans = await memgraphService.runQuery(`
        MATCH (n)
        WHERE n.namespace IS NOT NULL AND NOT (n)-[]-()
        RETURN n.id AS id, labels(n)[0] AS label, n.name AS name
        LIMIT 50
      `);
      for (const o of orphans) {
        issues.push({
          type: 'ORPHAN_NODE', severity: 'warning',
          nodeId: o.id, label: o.label, name: o.name,
          message: `Orphan node: ${o.name || o.id} (${o.label})`,
          suggestedAction: 'connect_or_remove'
        });
      }
    } catch (err) {
      logger.warn('Orphan detection failed', err.message);
    }

    // 2. Missing namespace violations
    try {
      const noNs = await memgraphService.runQuery(`
        MATCH (n)
        WHERE n.namespace IS NULL AND n.id IS NOT NULL
        RETURN n.id AS id, labels(n)[0] AS label
        LIMIT 30
      `);
      for (const n of noNs) {
        issues.push({
          type: 'MISSING_NAMESPACE', severity: 'error',
          nodeId: n.id, label: n.label,
          message: `Missing namespace on ${n.id} (${n.label})`,
          suggestedAction: 'assign_namespace'
        });
      }
    } catch (err) {
      logger.warn('Namespace check failed', err.message);
    }

    // 3. Transitive gaps (A→B, B→C but no A→C where expected)
    try {
      const gaps = await memgraphService.runQuery(`
        MATCH (a)-[:DEPENDS_ON]->(b)-[:DEPENDS_ON]->(c)
        WHERE NOT (a)-[:DEPENDS_ON]->(c)
          AND a.namespace IS NOT NULL
          AND c.namespace IS NOT NULL
        RETURN a.id AS fromId, c.id AS toId, a.name AS fromName, c.name AS toName
        LIMIT 20
      `);
      for (const g of gaps) {
        issues.push({
          type: 'TRANSITIVE_GAP', severity: 'info',
          fromId: g.fromId, toId: g.toId,
          message: `Transitive gap: ${g.fromName || g.fromId} → ${g.toName || g.toId}`,
          suggestedAction: 'add_transitive_edge'
        });
      }
    } catch (err) {
      logger.warn('Transitive gap check failed', err.message);
    }

    // 4. Stale hub nodes (highly connected but not updated)
    try {
      const staleThreshold = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const staleHubs = await memgraphService.runQuery(`
        MATCH (n)
        WHERE n.namespace IS NOT NULL
        WITH n, size([(n)-[]-() | 1]) AS degree
        WHERE degree > 5
          AND (
            (n.updatedAt IS NOT NULL AND toString(n.updatedAt) < $threshold)
            OR (n.updatedAt IS NULL AND n.createdAt IS NOT NULL AND toString(n.createdAt) < $threshold)
          )
        RETURN n.id AS id, n.name AS name, labels(n)[0] AS label, degree
        ORDER BY degree DESC
        LIMIT 10
      `, { threshold: staleThreshold });
      for (const h of staleHubs) {
        issues.push({
          type: 'STALE_NODE', severity: 'warning',
          nodeId: h.id, label: h.label, name: h.name,
          degree: h.degree,
          message: `Stale hub: ${h.name || h.id} (${h.degree} connections, 90+ days old)`,
          suggestedAction: 'review_and_refresh'
        });
      }
    } catch (err) {
      logger.warn('Stale hub check failed', err.message);
    }

    // 5. Duplicate node candidates (same name, same label)
    try {
      const dupes = await memgraphService.runQuery(`
        MATCH (a), (b)
        WHERE a.name IS NOT NULL AND a.name = b.name
          AND labels(a) = labels(b)
          AND id(a) < id(b)
        RETURN a.id AS id1, b.id AS id2, a.name AS name, labels(a)[0] AS label
        LIMIT 20
      `);
      for (const d of dupes) {
        issues.push({
          type: 'DUPLICATE_NODE', severity: 'warning',
          nodeId: d.id1, duplicateId: d.id2, label: d.label,
          message: `Possible duplicate: "${d.name}" (${d.label})`,
          suggestedAction: 'merge_duplicates'
        });
      }
    } catch (err) {
      logger.warn('Duplicate detection failed', err.message);
    }

    logger.info(`Detection complete: ${issues.length} issues found in ${Date.now() - startTime}ms`);
    await this._incrementStat('detectionsRun');

    return issues;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2: EVALUATE & PRIORITIZE
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Evaluate issues and sort by priority
   */
  evaluateAndPrioritize(issues) {
    return issues
      .map(issue => ({
        ...issue,
        priority: (SEVERITY_WEIGHT[issue.severity] || 1),
        autonomyLevel: ISSUE_AUTONOMY[issue.type] || 'L2'
      }))
      .sort((a, b) => b.priority - a.priority);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 3: PROPOSE
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Create a proposal from a detected issue
   */
  async createProposal(issue) {
    const autonomyLevel = ISSUE_AUTONOMY[issue.type] || 'L2';
    const levelDef = AUTONOMY_LEVELS[autonomyLevel];

    const proposal = {
      id: `METACOG-${crypto.randomUUID().slice(0, 8)}`,
      issue,
      autonomyLevel,
      levelName: levelDef.name,
      approvalRequired: levelDef.approvalRequired,
      slaHours: levelDef.slaHours,
      dualApproval: levelDef.dualApproval || false,
      status: 'PENDING',
      approvals: [],
      rejections: [],
      createdAt: new Date().toISOString(),
      executedAt: null
    };

    // Auto-approve L0 proposals
    if (!levelDef.approvalRequired) {
      proposal.status = 'AUTO_APPROVED';
    }

    // Store in Redis
    await this._saveProposal(proposal);
    await this._incrementStat('proposalsCreated');

    logger.info(`Proposal ${proposal.id} created [${autonomyLevel}]: ${issue.message}`);
    return proposal;
  }

  /**
   * Batch-create proposals from detected issues
   */
  async createProposalsFromIssues(issues) {
    const prioritized = this.evaluateAndPrioritize(issues);
    const proposals = [];

    for (const issue of prioritized) {
      const proposal = await this.createProposal(issue);
      proposals.push(proposal);
    }

    return proposals;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 4: APPROVE / REJECT
  // ═══════════════════════════════════════════════════════════════════

  async approveProposal(proposalId, approver = 'system') {
    const proposal = await this._getProposal(proposalId);
    if (!proposal) throw new Error(`Proposal ${proposalId} not found`);
    if (proposal.status === 'EXECUTED') throw new Error('Already executed');
    if (proposal.status === 'REJECTED') throw new Error('Already rejected');

    proposal.approvals.push({ approver, at: new Date().toISOString() });

    const levelDef = AUTONOMY_LEVELS[proposal.autonomyLevel];
    const needed = levelDef.dualApproval ? 2 : 1;

    if (proposal.approvals.length >= needed) {
      proposal.status = 'APPROVED';
    }

    await this._saveProposal(proposal);
    await this._incrementStat('proposalsApproved');

    logger.info(`Proposal ${proposalId} approved by ${approver} (${proposal.approvals.length}/${needed})`);
    return proposal;
  }

  async rejectProposal(proposalId, rejector = 'system', reason = '') {
    const proposal = await this._getProposal(proposalId);
    if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

    proposal.status = 'REJECTED';
    proposal.rejections.push({ rejector, reason, at: new Date().toISOString() });

    await this._saveProposal(proposal);
    await this._incrementStat('proposalsRejected');

    logger.info(`Proposal ${proposalId} rejected by ${rejector}: ${reason}`);
    return proposal;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 5: EXECUTE
  // ═══════════════════════════════════════════════════════════════════

  async executeProposal(proposalId) {
    const proposal = await this._getProposal(proposalId);
    if (!proposal) throw new Error(`Proposal ${proposalId} not found`);
    if (proposal.status !== 'APPROVED' && proposal.status !== 'AUTO_APPROVED') {
      throw new Error(`Cannot execute proposal with status: ${proposal.status}`);
    }

    const issue = proposal.issue;
    let result;

    try {
      switch (issue.suggestedAction) {
        case 'connect_or_remove':
          result = await this._executeRemoveOrphan(issue);
          break;
        case 'assign_namespace':
          result = await this._executeAssignNamespace(issue);
          break;
        case 'add_transitive_edge':
          result = await this._executeAddTransitiveEdge(issue);
          break;
        case 'review_and_refresh':
          result = await this._executeRefreshTimestamp(issue);
          break;
        case 'merge_duplicates':
          result = {
            action: 'merge_duplicates',
            status: 'requires_manual',
            summary: `Duplicate "${issue.name || issue.nodeId}" (${issue.label}) requires manual merge with ${issue.duplicateId}`,
            nodeId: issue.nodeId,
            duplicateId: issue.duplicateId || null,
            nodeName: issue.name || null,
            nodeLabel: issue.label || null,
            issueType: issue.type,
            issueMessage: issue.message
          };
          break;
        default:
          result = {
            action: issue.suggestedAction || 'unknown',
            status: 'skipped',
            summary: `No executor for action "${issue.suggestedAction}"`,
            issueType: issue.type,
            issueMessage: issue.message
          };
      }

      proposal.status = 'EXECUTED';
      proposal.executedAt = new Date().toISOString();
      proposal.executionResult = result;

      await this._saveProposal(proposal);
      await this._incrementStat('proposalsExecuted');

      logger.info(`Proposal ${proposalId} executed: ${JSON.stringify(result)}`);
    } catch (err) {
      proposal.status = 'EXECUTION_FAILED';
      proposal.executionError = err.message;
      await this._saveProposal(proposal);

      logger.error(`Proposal ${proposalId} execution failed: ${err.message}`);
      throw err;
    }

    return proposal;
  }

  /**
   * Execute all auto-approved proposals
   */
  async executeAutoApproved() {
    const proposals = await this.getProposals({ status: 'AUTO_APPROVED' });
    const results = [];

    for (const p of proposals) {
      try {
        const executed = await this.executeProposal(p.id);
        results.push({ id: p.id, status: 'executed' });
      } catch (err) {
        results.push({ id: p.id, status: 'failed', error: err.message });
      }
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════════════════

  async getProposals(filter = {}) {
    const all = await this._getAllProposals();
    if (!filter.status) return all;
    return all.filter(p => p.status === filter.status);
  }

  async getStats() {
    try {
      const raw = await redisService.get(STATS_KEY);
      const stats = raw ? JSON.parse(raw) : {};
      const proposals = await this._getAllProposals();

      return {
        ...stats,
        pendingCount: proposals.filter(p => p.status === 'PENDING').length,
        autoApprovedCount: proposals.filter(p => p.status === 'AUTO_APPROVED').length,
        approvedCount: proposals.filter(p => p.status === 'APPROVED').length,
        executedCount: proposals.filter(p => p.status === 'EXECUTED').length,
        rejectedCount: proposals.filter(p => p.status === 'REJECTED').length,
        totalProposals: proposals.length
      };
    } catch (err) {
      return { error: err.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // EXECUTION ACTIONS (Private)
  // ═══════════════════════════════════════════════════════════════════

  async _executeRemoveOrphan(issue) {
    const now = new Date().toISOString();
    await memgraphService.runQuery(`
      MATCH (n {id: $nodeId})
      SET n._orphanDetected = true, n._orphanDetectedAt = $now
    `, { nodeId: issue.nodeId, now });

    // Verify post-state
    const verify = await memgraphService.runQuery(`
      MATCH (n {id: $nodeId})
      RETURN n._orphanDetected AS tagged, labels(n)[0] AS label, n.name AS name
    `, { nodeId: issue.nodeId });

    return {
      action: 'connect_or_remove',
      summary: `Tagged orphan node "${issue.name || issue.nodeId}" (${issue.label}) for review`,
      nodeId: issue.nodeId,
      nodeName: issue.name || null,
      nodeLabel: issue.label || null,
      issueType: issue.type,
      issueMessage: issue.message,
      changes: { _orphanDetected: true, _orphanDetectedAt: now },
      verified: verify[0]?.tagged === true
    };
  }

  async _executeAssignNamespace(issue) {
    const LABEL_NS_MAP = {
      'Tool': 'CORE', 'CatalogEntry': 'CORE', 'GraphDefinition': 'CORE',
      'ExecutionRecord': 'META', 'CodexRule': 'CODEX', 'CodexPrinciple': 'CODEX',
      'ADR': 'CODEX', 'CoreComponent': 'CORE', 'YOUNEED': 'PROJECT'
    };
    const ns = LABEL_NS_MAP[issue.label] || 'CORE';
    const mappingRule = LABEL_NS_MAP[issue.label] ? 'explicit' : 'default_fallback';
    const now = new Date().toISOString();

    await memgraphService.runQuery(`
      MATCH (n {id: $nodeId})
      SET n.namespace = $namespace, n.updatedAt = $now
    `, { nodeId: issue.nodeId, namespace: ns, now });

    // Verify post-state
    const verify = await memgraphService.runQuery(`
      MATCH (n {id: $nodeId})
      RETURN n.namespace AS namespace, n.name AS name
    `, { nodeId: issue.nodeId });

    return {
      action: 'assign_namespace',
      summary: `Assigned namespace "${ns}" to ${issue.label} node "${issue.name || issue.nodeId}"`,
      nodeId: issue.nodeId,
      nodeName: issue.name || verify[0]?.name || null,
      nodeLabel: issue.label || null,
      issueType: issue.type,
      issueMessage: issue.message,
      changes: { namespace: { from: null, to: ns } },
      mappingRule: `${issue.label} → ${ns} (${mappingRule})`,
      verified: verify[0]?.namespace === ns
    };
  }

  async _executeAddTransitiveEdge(issue) {
    await memgraphService.runQuery(`
      MATCH (a {id: $fromId}), (c {id: $toId})
      MERGE (a)-[:DEPENDS_ON {inferred: true, createdBy: 'metacognition'}]->(c)
    `, { fromId: issue.fromId, toId: issue.toId });

    // Verify edge exists
    const verify = await memgraphService.runQuery(`
      MATCH (a {id: $fromId})-[r:DEPENDS_ON {inferred: true}]->(c {id: $toId})
      RETURN a.name AS fromName, c.name AS toName, type(r) AS relType
    `, { fromId: issue.fromId, toId: issue.toId });

    const fromName = issue.fromName || verify[0]?.fromName || issue.fromId;
    const toName = issue.toName || verify[0]?.toName || issue.toId;

    return {
      action: 'add_transitive_edge',
      summary: `Created inferred DEPENDS_ON edge: "${fromName}" → "${toName}"`,
      fromId: issue.fromId,
      toId: issue.toId,
      fromName,
      toName,
      issueType: issue.type,
      issueMessage: issue.message,
      changes: { edge: { type: 'DEPENDS_ON', inferred: true, createdBy: 'metacognition' } },
      verified: !!verify[0]
    };
  }

  async _executeRefreshTimestamp(issue) {
    const now = new Date().toISOString();
    await memgraphService.runQuery(`
      MATCH (n {id: $nodeId})
      SET n._lastReviewedAt = $now
    `, { nodeId: issue.nodeId, now });

    return {
      action: 'review_and_refresh',
      summary: `Refreshed review timestamp for stale hub "${issue.name || issue.nodeId}" (${issue.label}, ${issue.degree || '?'} connections)`,
      nodeId: issue.nodeId,
      nodeName: issue.name || null,
      nodeLabel: issue.label || null,
      degree: issue.degree || null,
      issueType: issue.type,
      issueMessage: issue.message,
      changes: { _lastReviewedAt: now },
      verified: true
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // REDIS STORAGE (Private)
  // ═══════════════════════════════════════════════════════════════════

  async _saveProposal(proposal) {
    const all = await this._getAllProposals();
    const idx = all.findIndex(p => p.id === proposal.id);
    if (idx >= 0) {
      all[idx] = proposal;
    } else {
      all.push(proposal);
    }
    // Keep last 500 proposals
    const trimmed = all.slice(-500);
    await redisService.set(PROPOSALS_KEY, JSON.stringify(trimmed), 30 * 24 * 60 * 60);
  }

  async _getProposal(proposalId) {
    const all = await this._getAllProposals();
    return all.find(p => p.id === proposalId) || null;
  }

  async _getAllProposals() {
    try {
      const raw = await redisService.get(PROPOSALS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async _incrementStat(key) {
    try {
      const raw = await redisService.get(STATS_KEY);
      const stats = raw ? JSON.parse(raw) : {};
      stats[key] = (stats[key] || 0) + 1;
      stats.lastUpdated = new Date().toISOString();
      await redisService.set(STATS_KEY, JSON.stringify(stats), 90 * 24 * 60 * 60);
    } catch (err) {
      logger.warn('Failed to increment stat', err.message);
    }
  }
}

// Singleton
let _instance = null;

function getMetacognitionService() {
  if (!_instance) {
    _instance = new MetacognitionService();
  }
  return _instance;
}

module.exports = { MetacognitionService, getMetacognitionService };
