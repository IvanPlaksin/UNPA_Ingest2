/**
 * ViolationToIssueService — converts validation violations into KB issues
 * and enables creating Proposals from issues.
 *
 * Full cycle: Validation → Issues (Redis) → Proposals (Redis) → Execute
 */

const redis = require('../../redis.service');

const ISSUES_KEY = 'issues:validation:latest';
const SUMMARY_KEY = 'issues:validation:summary';
const PROPOSALS_KEY = 'proposals:validation';
const TTL = 7 * 24 * 60 * 60; // 7 days

const ISSUE_TYPE_MAP = {
  'Valid Namespace':                'INVALID_NAMESPACE',
  'Namespace Required for Domain Nodes': 'MISSING_NAMESPACE',
  'Tool Required Fields':           'SCHEMA_VIOLATION',
  'CatalogEntry Required Fields':   'SCHEMA_VIOLATION',
  'CodexRule Required Fields':      'SCHEMA_VIOLATION',
  'Orphan CodexSection':            'ORPHAN_NODE',
  'Orphan CodexRule':               'ORPHAN_NODE',
  'Tool without Category':          'MISSING_RELATIONSHIP',
  'Missing createdAt':              'MISSING_TIMESTAMP',
  'Orphan Nodes (no relationships)':'ORPHAN_NODE',
  'Duplicate Tool executorId':      'DUPLICATE_VALUE',
  'Duplicate CatalogEntry name':    'DUPLICATE_VALUE',
  'ADR Valid Status':               'INVALID_VALUE',
};

const AUTO_FIXABLE = new Set(['MISSING_TIMESTAMP', 'MISSING_NAMESPACE']);

const SUGGESTED_ACTIONS = {
  INVALID_NAMESPACE:    'set_namespace',
  MISSING_NAMESPACE:    'set_namespace',
  SCHEMA_VIOLATION:     'add_required_field',
  ORPHAN_NODE:          'create_relationship',
  MISSING_RELATIONSHIP: 'create_relationship',
  MISSING_TIMESTAMP:    'set_timestamp',
  DUPLICATE_VALUE:      'rename_or_merge',
  INVALID_VALUE:        'fix_value',
};

const AUTONOMY_MAP = {
  set_timestamp:        'L0',
  set_namespace:        'L1',
  add_required_field:   'L2',
  create_relationship:  'L2',
  fix_value:            'L2',
  rename_or_merge:      'L3',
  manual_review:        'L3',
};

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(16).slice(0, 8);
}

class ViolationToIssueService {

  /**
   * Convert violations array → issues, store in Redis
   */
  async syncViolationsToIssues(violations) {
    const now = new Date().toISOString();
    const issues = violations.map(v => {
      const issueType = ISSUE_TYPE_MAP[v.checkName] || 'VALIDATION_ERROR';
      const suggestedAction = SUGGESTED_ACTIONS[issueType] || 'manual_review';
      return {
        id: `issue-val-${hash(`${v.checkName}-${v.nodeId}-${v.message}`)}`,
        source: 'validation',
        type: issueType,
        severity: v.severity,
        nodeId: v.nodeId,
        label: v.label,
        checkId: v.checkId,
        checkName: v.checkName,
        message: v.message,
        suggestedAction,
        autoFixable: AUTO_FIXABLE.has(issueType),
        autonomyLevel: AUTONOMY_MAP[suggestedAction] || 'L3',
        detectedAt: now,
        status: 'open'
      };
    });

    await redis.set(ISSUES_KEY, JSON.stringify(issues), TTL);

    const summary = {
      total: issues.length,
      errors: issues.filter(i => i.severity === 'error').length,
      warnings: issues.filter(i => i.severity === 'warning').length,
      info: issues.filter(i => i.severity === 'info').length,
      autoFixable: issues.filter(i => i.autoFixable).length,
      syncedAt: now
    };
    await redis.set(SUMMARY_KEY, JSON.stringify(summary), TTL);

    console.log(`[ViolationToIssue] Synced ${issues.length} issues (${summary.autoFixable} auto-fixable)`);
    return { synced: issues.length, summary };
  }

  /**
   * Get stored issues with optional filters
   */
  async getIssues(filters = {}) {
    const raw = await redis.get(ISSUES_KEY);
    if (!raw) return [];
    let issues = JSON.parse(raw);

    if (filters.severity) issues = issues.filter(i => i.severity === filters.severity);
    if (filters.autoFixable !== undefined) issues = issues.filter(i => i.autoFixable === filters.autoFixable);
    if (filters.type) issues = issues.filter(i => i.type === filters.type);
    return issues;
  }

  /**
   * Get summary
   */
  async getSummary() {
    const raw = await redis.get(SUMMARY_KEY);
    return raw ? JSON.parse(raw) : { total: 0, errors: 0, warnings: 0, info: 0, autoFixable: 0 };
  }

  /**
   * Create a Proposal from an issue
   */
  async createProposalFromIssue(issueId) {
    const issues = await this.getIssues();
    const issue = issues.find(i => i.id === issueId);
    if (!issue) return null;

    const proposal = {
      id: `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      issueId: issue.id,
      source: 'validation',
      type: issue.suggestedAction,
      autonomyLevel: issue.autonomyLevel,
      status: issue.autonomyLevel === 'L0' ? 'AUTO_APPROVED' : 'PROPOSED',
      proposedAt: new Date().toISOString(),
      change: this._generateChange(issue),
      evidence: { checkName: issue.checkName, severity: issue.severity, message: issue.message },
      autoFixable: issue.autoFixable
    };

    // Store proposal
    const existing = await redis.get(PROPOSALS_KEY);
    const proposals = existing ? JSON.parse(existing) : [];
    proposals.push(proposal);
    await redis.set(PROPOSALS_KEY, JSON.stringify(proposals), TTL);

    return proposal;
  }

  /**
   * Batch create proposals for all auto-fixable issues
   */
  async createAutoFixProposals() {
    const issues = await this.getIssues({ autoFixable: true });
    const proposals = [];
    for (const issue of issues) {
      const p = await this.createProposalFromIssue(issue.id);
      if (p) proposals.push(p);
    }
    return { created: proposals.length, proposals };
  }

  /**
   * Get all proposals
   */
  async getProposals() {
    const raw = await redis.get(PROPOSALS_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  _generateChange(issue) {
    const label = issue.label || 'Unknown';
    switch (issue.suggestedAction) {
      case 'set_timestamp':
        return { operation: 'SET_PROPERTY', nodeId: issue.nodeId, label, property: 'createdAt', value: new Date().toISOString() };
      case 'set_namespace':
        return { operation: 'SET_PROPERTY', nodeId: issue.nodeId, label, property: 'namespace', value: this._inferNamespace(label) };
      case 'add_required_field':
        return { operation: 'ADD_FIELD', nodeId: issue.nodeId, label, details: issue.message };
      case 'create_relationship':
        return { operation: 'CREATE_RELATIONSHIP', nodeId: issue.nodeId, label, details: issue.message };
      default:
        return { operation: 'MANUAL_REVIEW', issue: { id: issue.id, message: issue.message } };
    }
  }

  _inferNamespace(label) {
    const map = { Tool: 'CORE', CatalogEntry: 'GXE', CodexRule: 'CORE', CodexSection: 'CORE', CodexPart: 'CORE', CodexADR: 'META', FlowDeskTicket: 'FLOWDESK' };
    return map[label] || 'PROJECT';
  }
}

module.exports = { ViolationToIssueService };
