/**
 * WorkSpace Graph Validator Service (WS2-007)
 *
 * Runs structural, content, contradiction, and graph-type rules over a
 * WorkSpace draft graph and produces a structured ValidationResult.
 *
 * Each rule has a severity:
 *   WARNING  → informational only
 *   ERROR    → graph is invalid (still promotable IF no BLOCKING)
 *   BLOCKING → cannot promote until resolved
 *
 * The service is read-only — it does not mutate any data.
 *
 * @module services/workspace/graph-validator.service
 */

'use strict';

const LOG_PREFIX = '[GraphValidator]';

let _memgraph = null;
let _drafts = null;
let _contradictions = null;
let _ws = null;

function mg()             { if (!_memgraph)       _memgraph       = require('../memgraph.service');                return _memgraph; }
function drafts()         { if (!_drafts)         _drafts         = require('./draft.service');                    return _drafts; }
function contradictions() { if (!_contradictions) _contradictions = require('./contradiction.service');             return _contradictions; }
function ws()             { if (!_ws)             _ws             = require('./workspace.service');                 return _ws; }

const MIN_CONFIDENCE = 0.5;

// ──────────────────────────────────────────────────────────────────
// Rule definitions
// ──────────────────────────────────────────────────────────────────

const RULES = [
  // ── Structure ─────────────────────────────────────────────────
  {
    id: 'REQUIRED_PROPERTIES',
    name: 'Required properties present',
    severity: 'ERROR',
    description: 'All draft nodes must have a non-empty name and a type',
    appliesTo: null, // all
    check: async (ctx) => {
      const offenders = ctx.allDrafts.filter(d => !d.name || !d.type);
      return {
        passed: offenders.length === 0,
        message: offenders.length === 0
          ? 'All nodes have required properties'
          : `${offenders.length} node(s) missing name or type`,
        affectedNodes: offenders.map(d => ({ id: d.id, name: d.name || '(unnamed)', issue: !d.name ? 'missing name' : 'missing type' }))
      };
    }
  },
  {
    id: 'NO_ORPHAN_NODES',
    name: 'No orphan nodes',
    severity: 'WARNING',
    description: 'Every draft node should be connected to at least one other node',
    appliesTo: null,
    check: async (ctx) => {
      const connected = ctx.connectedNodeIds;
      // Single-node graphs are not orphans by definition
      if (ctx.allDrafts.length <= 1) {
        return { passed: true, message: 'Trivial graph (≤1 node), orphan rule skipped', affectedNodes: [] };
      }
      const orphans = ctx.allDrafts.filter(d => !connected.has(d.id));
      return {
        passed: orphans.length === 0,
        message: orphans.length === 0
          ? 'All nodes are connected'
          : `${orphans.length} orphan node(s) found`,
        affectedNodes: orphans.map(d => ({ id: d.id, name: d.name, issue: 'no incoming/outgoing edges' }))
      };
    }
  },
  {
    id: 'NO_DANGLING_EDGES',
    name: 'No dangling edges',
    severity: 'ERROR',
    description: 'All edges must connect nodes that exist in the workspace',
    appliesTo: null,
    check: async (ctx) => {
      const ids = new Set(ctx.allDrafts.map(d => d.id));
      const dangling = ctx.allEdges.filter(e => !ids.has(e.source) || !ids.has(e.target));
      return {
        passed: dangling.length === 0,
        message: dangling.length === 0
          ? 'All edges connect existing nodes'
          : `${dangling.length} dangling edge(s) found`,
        affectedNodes: dangling.map(e => ({ id: `${e.source}→${e.target}`, name: e.type, issue: 'endpoint missing' }))
      };
    }
  },

  // ── Content quality ───────────────────────────────────────────
  {
    id: 'MIN_CONFIDENCE',
    name: 'Minimum confidence threshold',
    severity: 'WARNING',
    description: `Drafts should have confidence ≥ ${MIN_CONFIDENCE}`,
    appliesTo: null,
    check: async (ctx) => {
      const lowConf = ctx.allDrafts.filter(d => (d.confidence ?? 0) < MIN_CONFIDENCE);
      return {
        passed: lowConf.length === 0,
        message: lowConf.length === 0
          ? `All drafts have confidence ≥ ${MIN_CONFIDENCE}`
          : `${lowConf.length} draft(s) below minimum confidence`,
        affectedNodes: lowConf.map(d => ({ id: d.id, name: d.name, issue: `confidence=${d.confidence}` }))
      };
    }
  },
  {
    id: 'NO_EMPTY_CONTENT',
    name: 'No empty content',
    severity: 'WARNING',
    description: 'Drafts should have non-empty content or description',
    appliesTo: null,
    check: async (ctx) => {
      const empty = ctx.allDrafts.filter(d => {
        const hasDesc = d.description && d.description.trim().length > 0;
        const hasContent = d.content && typeof d.content === 'object' && Object.keys(d.content).length > 0;
        return !hasDesc && !hasContent;
      });
      return {
        passed: empty.length === 0,
        message: empty.length === 0
          ? 'All drafts have content or description'
          : `${empty.length} draft(s) with empty content and no description`,
        affectedNodes: empty.map(d => ({ id: d.id, name: d.name, issue: 'no description, empty content' }))
      };
    }
  },

  // ── Contradictions ────────────────────────────────────────────
  {
    id: 'NO_BLOCKING_CONTRADICTIONS',
    name: 'No blocking contradictions',
    severity: 'BLOCKING',
    description: 'All BLOCKING contradictions must be resolved before promotion',
    appliesTo: null,
    check: async (ctx) => {
      const blocking = ctx.allContradictions.filter(c => c.severity === 'BLOCKING' && c.status === 'OPEN');
      return {
        passed: blocking.length === 0,
        message: blocking.length === 0
          ? 'No unresolved BLOCKING contradictions'
          : `${blocking.length} BLOCKING contradiction(s) open`,
        affectedNodes: blocking.map(c => ({
          id: c.id,
          name: c.field || 'contradiction',
          issue: c.description || 'BLOCKING contradiction'
        }))
      };
    }
  },
  {
    id: 'CONTRADICTIONS_REVIEWED',
    name: 'Contradictions reviewed',
    severity: 'WARNING',
    description: 'All contradictions should be resolved, accepted, or deferred',
    appliesTo: null,
    check: async (ctx) => {
      const open = ctx.allContradictions.filter(c => c.status === 'OPEN');
      return {
        passed: open.length === 0,
        message: open.length === 0
          ? 'All contradictions reviewed'
          : `${open.length} contradiction(s) still OPEN`,
        affectedNodes: open.map(c => ({
          id: c.id,
          name: c.field || 'contradiction',
          issue: `${c.severity} – not yet reviewed`
        }))
      };
    }
  },

  // ── Graph type compliance ─────────────────────────────────────
  {
    id: 'EXECUTABLE_HAS_ENTRY_EXIT',
    name: 'EXECUTABLE graphs have entry and exit',
    severity: 'ERROR',
    description: 'EXECUTABLE workspaces must contain workflow.start and workflow.end nodes',
    appliesTo: ['EXECUTABLE'],
    check: async (ctx) => {
      const hasStart = ctx.allDrafts.some(d => d.type === 'workflow' && /start|begin|entry/i.test(d.name || ''));
      const hasEnd   = ctx.allDrafts.some(d => d.type === 'workflow' && /end|finish|exit|complete/i.test(d.name || ''));
      const missing = [];
      if (!hasStart) missing.push('start');
      if (!hasEnd)   missing.push('end');
      return {
        passed: missing.length === 0,
        message: missing.length === 0
          ? 'Has both entry and exit nodes'
          : `Missing ${missing.join(' and ')} workflow node(s)`,
        affectedNodes: []
      };
    }
  },
  {
    id: 'STRUCTURAL_IS_DAG',
    name: 'STRUCTURAL graphs are acyclic',
    severity: 'ERROR',
    description: 'STRUCTURAL workspaces must not contain directed cycles',
    appliesTo: ['STRUCTURAL'],
    check: async (ctx) => {
      const cycles = detectCycles(ctx.allDrafts, ctx.allEdges);
      return {
        passed: cycles.length === 0,
        message: cycles.length === 0
          ? 'Graph is acyclic (DAG)'
          : `${cycles.length} cycle(s) detected`,
        affectedNodes: cycles.slice(0, 5).map(cyc => ({
          id: cyc.join('→'),
          name: 'cycle',
          issue: `${cyc.length}-node cycle`
        }))
      };
    }
  },
  {
    id: 'CONSTRAINT_HAS_TARGET',
    name: 'CONSTRAINT graphs have target schema',
    severity: 'ERROR',
    description: 'CONSTRAINT workspaces must reference at least one schema entity',
    appliesTo: ['CONSTRAINT'],
    check: async (ctx) => {
      const hasSchema = ctx.allDrafts.some(d => d.type === 'schema');
      return {
        passed: hasSchema,
        message: hasSchema
          ? 'Schema target present'
          : 'No schema target found in CONSTRAINT graph',
        affectedNodes: []
      };
    }
  }
];

// ──────────────────────────────────────────────────────────────────
// Cycle detection (Tarjan SCC simplified — find any cycle)
// ──────────────────────────────────────────────────────────────────

function detectCycles(nodes, edges) {
  const adj = new Map();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (adj.has(e.source) && adj.has(e.target)) adj.get(e.source).push(e.target);
  }

  const visited = new Set();
  const stack = new Set();
  const cycles = [];
  const path = [];

  function dfs(node) {
    visited.add(node);
    stack.add(node);
    path.push(node);

    for (const next of (adj.get(node) || [])) {
      if (!visited.has(next)) {
        dfs(next);
      } else if (stack.has(next)) {
        const start = path.indexOf(next);
        if (start >= 0) cycles.push(path.slice(start).concat(next));
      }
    }
    stack.delete(node);
    path.pop();
  }

  for (const n of nodes) {
    if (!visited.has(n.id)) dfs(n.id);
  }
  return cycles;
}

// ──────────────────────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────────────────────

class GraphValidatorService {

  /**
   * Run all (or selected) validation rules against a workspace.
   *
   * @param {string} workspaceId
   * @param {Object} [options]
   * @param {string[]} [options.rules]              Specific rule IDs to run
   * @param {string}   [options.graphType]          Filter rules by appliesTo
   * @param {boolean}  [options.stopOnFirstError]
   * @returns {Promise<Object>} ValidationResult
   */
  async validateGraph(workspaceId, options = {}) {
    const startedAt = Date.now();
    if (!workspaceId) throw new Error('workspaceId is required');

    // Build context once
    const ctx = await this._buildContext(workspaceId);

    // Filter rules
    let activeRules = RULES.slice();
    if (options.rules && options.rules.length > 0) {
      const wanted = new Set(options.rules);
      activeRules = activeRules.filter(r => wanted.has(r.id));
    }
    if (options.graphType) {
      activeRules = activeRules.filter(r =>
        !r.appliesTo || r.appliesTo.includes(options.graphType)
      );
    }

    const results = [];
    let stop = false;

    for (const rule of activeRules) {
      if (stop) {
        results.push({
          ruleId: rule.id, ruleName: rule.name, severity: rule.severity,
          status: 'SKIP', message: 'Skipped (stopOnFirstError)',
          affectedNodes: [], duration: 0
        });
        continue;
      }

      // Skip rules that don't apply to this graph type
      if (rule.appliesTo && options.graphType && !rule.appliesTo.includes(options.graphType)) {
        results.push({
          ruleId: rule.id, ruleName: rule.name, severity: rule.severity,
          status: 'SKIP', message: `Does not apply to ${options.graphType}`,
          affectedNodes: [], duration: 0
        });
        continue;
      }

      const ruleStart = Date.now();
      try {
        const r = await rule.check(ctx);
        const status = r.passed
          ? 'PASS'
          : (rule.severity === 'WARNING' ? 'WARN' : 'FAIL');
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          status,
          message: r.message,
          affectedNodes: r.affectedNodes || [],
          duration: Date.now() - ruleStart
        });

        if (options.stopOnFirstError && status === 'FAIL') stop = true;
      } catch (err) {
        console.warn(`${LOG_PREFIX} rule ${rule.id} threw: ${err.message}`);
        results.push({
          ruleId: rule.id, ruleName: rule.name, severity: rule.severity,
          status: 'FAIL', message: `Rule error: ${err.message}`,
          affectedNodes: [], duration: Date.now() - ruleStart
        });
      }
    }

    // Aggregate
    const summary = {
      total: results.length,
      passed: results.filter(r => r.status === 'PASS').length,
      warnings: results.filter(r => r.status === 'WARN').length,
      errors: results.filter(r => r.status === 'FAIL' && r.severity === 'ERROR').length,
      blocking: results.filter(r => r.status === 'FAIL' && r.severity === 'BLOCKING').length,
      skipped: results.filter(r => r.status === 'SKIP').length
    };

    const blockers = results.filter(r => r.status === 'FAIL' && r.severity === 'BLOCKING');
    const errors = results.filter(r => r.status === 'FAIL' && r.severity === 'ERROR');
    const warnings = results.filter(r => r.status === 'WARN');

    const valid = summary.errors === 0 && summary.blocking === 0;
    const canPromote = summary.blocking === 0;

    return {
      valid,
      canPromote,
      summary,
      results,
      blockers,
      errors,
      warnings,
      metadata: {
        workspaceId,
        validatedAt: new Date().toISOString(),
        duration: Date.now() - startedAt,
        nodeCount: ctx.allDrafts.length,
        edgeCount: ctx.allEdges.length,
        graphType: options.graphType || null
      }
    };
  }

  /**
   * Validate a single node — checks structural rules limited to that node.
   */
  async validateNode(workspaceId, nodeId) {
    const draft = await drafts().get(workspaceId, nodeId);
    if (!draft) return { valid: false, issues: ['Node not found'] };

    const issues = [];
    if (!draft.name)             issues.push('missing name');
    if (!draft.type)             issues.push('missing type');
    if ((draft.confidence ?? 0) < MIN_CONFIDENCE) issues.push(`confidence below ${MIN_CONFIDENCE}`);

    const hasDesc = draft.description && draft.description.trim().length > 0;
    const hasContent = draft.content && typeof draft.content === 'object' && Object.keys(draft.content).length > 0;
    if (!hasDesc && !hasContent) issues.push('empty content and no description');

    return { valid: issues.length === 0, issues, node: { id: draft.id, name: draft.name, type: draft.type } };
  }

  /**
   * Quick check whether the workspace can be promoted.
   * Returns only BLOCKING issues — fast path.
   */
  async canPromote(workspaceId) {
    const result = await this.validateGraph(workspaceId, {
      rules: ['NO_BLOCKING_CONTRADICTIONS']
    });
    return {
      allowed: result.canPromote,
      blockers: result.blockers
    };
  }

  /**
   * Return all rule definitions (without check functions).
   */
  getRules({ graphType } = {}) {
    return RULES
      .filter(r => !graphType || !r.appliesTo || r.appliesTo.includes(graphType))
      .map(r => ({
        id: r.id,
        name: r.name,
        severity: r.severity,
        description: r.description,
        appliesTo: r.appliesTo
      }));
  }

  /**
   * Run a single rule by id.
   */
  async runRule(workspaceId, ruleId) {
    return this.validateGraph(workspaceId, { rules: [ruleId] });
  }

  // ──────────────────────────────────────────────────────────────
  // Internal: build shared validation context
  // ──────────────────────────────────────────────────────────────

  async _buildContext(workspaceId) {
    const allDrafts = await drafts().listWithSource(workspaceId);

    // Edges between drafts
    const edgeRows = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(s)
       MATCH (w)-[:CONTAINS_DRAFT]->(t)
       MATCH (s)-[r]->(t)
       WHERE type(r) <> 'CONTAINS_DRAFT' AND type(r) <> 'EXTRACTED_FROM' AND type(r) <> 'HAS_CONTRADICTION'
       RETURN s.id as source, t.id as target, type(r) as relType`,
      { wsId: workspaceId }
    );
    const allEdges = (edgeRows || []).map(r => ({ source: r.source, target: r.target, type: r.relType }));

    // Connected nodes
    const connectedNodeIds = new Set();
    for (const e of allEdges) {
      connectedNodeIds.add(e.source);
      connectedNodeIds.add(e.target);
    }

    // Contradictions
    const cRes = await contradictions().getContradictions(workspaceId, { limit: 5000 });
    const allContradictions = cRes?.items || [];

    return {
      workspaceId,
      allDrafts,
      allEdges,
      connectedNodeIds,
      allContradictions
    };
  }
}

const instance = new GraphValidatorService();

module.exports = instance;
module.exports.GraphValidatorService = GraphValidatorService;
module.exports.RULES = RULES.map(r => ({ id: r.id, name: r.name, severity: r.severity, description: r.description, appliesTo: r.appliesTo }));
module.exports.detectCycles = detectCycles;
