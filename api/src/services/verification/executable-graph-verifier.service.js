/**
 * ExecutableGraphVerifier — unified verification stack for executable GXE graphs.
 *
 * Part of GXE 2.0 "Graph = Program" concept v3.0 (Phase 1 / TASK-P1-003).
 *
 * Levels:
 *   L1  (Structural): GraphValidator (entry/exit, cycles, connectivity, …) + EXECUTOR_EXISTS
 *   L2  (Semantic):   BRANCH_DISCIPLINE (GXE-050..054), TEMPLATE_REFS_EXIST
 *   L2.5 (Dynamic):   MockExecutionMode — Phase 2 (not yet implemented)
 *   L3  (Formal):     IR soundness via pm4py ProcessTree — Phase 3 (not yet implemented)
 *
 * The grading contract mirrors the extraction-domain GraphVerifier (see VERIFY-07):
 * weighted per-dimension scores → letter grade, structured issues[] as reflection feedback.
 *
 * Result contract:
 *   { pass, grade, score, levels: { l1, l2 }, issues: Issue[], suggestions: string[] }
 *
 * @module services/verification/executable-graph-verifier
 */

'use strict';

// ── Grading configuration (generation domain) ────────────────────────────────

const WEIGHTS = {
  structure: 0.25,        // L1 structural (GraphValidator)
  executors: 0.20,        // L1 EXECUTOR_EXISTS
  templates: 0.20,        // L2 TEMPLATE_REFS_EXIST (static)
  branches: 0.15,         // L2 BRANCH_DISCIPLINE
  dynamicTemplates: 0.20, // L2.5 MockExecutionMode dry-run
};

const THRESHOLDS = { A: 0.95, B: 0.85, C: 0.70, D: 0.50 };

// Structural marker pseudo-types that are not real executors and must not be
// flagged as phantom (anchors emitted by compilers / IO markers).
const ANCHOR_TYPES = new Set(['start', 'end', 'input', 'output']);

// Executor types that perform conditional branching (must have labelled out-edges).
const CONDITION_TYPES = new Set(['workflow.condition', 'common.conditional']);

// Edge labels accepted as valid branch routing (case-insensitive).
const VALID_BRANCH_LABELS = new Set([
  'true', 'false', 'default',
  'success', 'failure', 'yes', 'no',
  'approved', 'rejected', 'valid', 'invalid',
  'found', 'not_found', 'high_confidence', 'low_confidence',
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function edgeSource(e) { return e.source || e.sourceNodeId; }
function edgeTarget(e) { return e.target || e.targetNodeId; }

function nodeExecutorType(n) {
  return n.executorType || n.data?.executorType || n.data?.toolId || n.data?.tool || n.type || null;
}

function edgeLabel(e) {
  return e.label || e.data?.label || (e.data?.condition && e.data.condition.type) || null;
}

// ── ExecutableGraphVerifier ──────────────────────────────────────────────────

class ExecutableGraphVerifier {
  /**
   * @param {Object} [deps]
   * @param {Object} [deps.pluginRegistry] - AOPEG plugin registry (for EXECUTOR_EXISTS).
   *        If omitted, resolved lazily from core/aopeg. Falls back to a soft warning
   *        when unavailable so verification never hard-crashes on registry access.
   * @param {Function} [deps.GraphValidator] - GraphValidator class (for structural checks).
   */
  constructor(deps = {}) {
    this._pluginRegistry = deps.pluginRegistry || null;
    this._GraphValidator = deps.GraphValidator || null;
    // L2.5 dynamic validation needs an MCP tool registry to build a RuntimeEngine.
    // When absent, verifyLevel2_5 degrades gracefully (skipped, non-blocking).
    this._mcpRegistry = deps.mcpRegistry || null;
    this._RuntimeEngine = deps.RuntimeEngine || null;
  }

  async _getPluginRegistry() {
    if (this._pluginRegistry) return this._pluginRegistry;
    try {
      const aopeg = require('../../core/aopeg/index.js');
      if (aopeg.isAOPEGInitialized && !aopeg.isAOPEGInitialized() && aopeg.initializeAOPEG) {
        await aopeg.initializeAOPEG();
      }
      this._pluginRegistry = aopeg.pluginRegistry || null;
    } catch (e) {
      this._pluginRegistry = null;
    }
    return this._pluginRegistry;
  }

  _getGraphValidator() {
    if (this._GraphValidator) return this._GraphValidator;
    try {
      this._GraphValidator = require('../graph/graph-validator').GraphValidator;
    } catch (e) {
      this._GraphValidator = null;
    }
    return this._GraphValidator;
  }

  // ── LEVEL 1: STRUCTURAL ────────────────────────────────────────────────────

  /**
   * @param {{nodes: Array, edges: Array}} graph
   * @returns {Promise<{pass, errors, warnings, score: {structure, executors}}>}
   */
  async verifyLevel1(graph) {
    const errors = [];
    const warnings = [];
    const nodes = graph?.nodes || [];

    // 1a. Structural validation via existing GraphValidator (delegate, no dup logic)
    let structureScore = 1;
    const GraphValidator = this._getGraphValidator();
    if (GraphValidator) {
      const validator = new GraphValidator();
      const structural = validator.validate({ nodes, edges: graph?.edges || [] });
      for (const e of (structural.errors || [])) {
        errors.push({ code: e.code, severity: 'error', message: e.message, suggestion: 'Fix structural error' });
      }
      for (const w of (structural.warnings || [])) {
        warnings.push({ code: w.code, severity: 'warning', message: w.message, suggestion: 'Review structural warning' });
      }
      structureScore = structural.valid ? 1 : 0;
    } else {
      warnings.push({ code: 'STRUCTURAL_VALIDATOR_UNAVAILABLE', severity: 'warning', message: 'GraphValidator not available', suggestion: 'Ensure graph-validator service is loadable' });
    }

    // 1b. EXECUTOR_EXISTS — reuse pluginRegistry.validateGraphExecutors
    let executorsScore = 1;
    const execTypeByNode = [];
    for (const n of nodes) {
      const t = nodeExecutorType(n);
      if (t && !ANCHOR_TYPES.has(t)) execTypeByNode.push({ nodeId: n.id, type: t });
    }
    const distinctTypes = [...new Set(execTypeByNode.map(x => x.type))];

    if (distinctTypes.length > 0) {
      const registry = await this._getPluginRegistry();
      if (registry && typeof registry.validateGraphExecutors === 'function') {
        const validation = registry.validateGraphExecutors(distinctTypes);
        const missing = new Set(validation.missingExecutors || []);
        if (missing.size > 0) {
          for (const { nodeId, type } of execTypeByNode) {
            if (missing.has(type)) {
              errors.push({
                code: 'PHANTOM_EXECUTOR',
                severity: 'error',
                nodeId,
                message: `Executor type "${type}" is not registered`,
                suggestion: 'Use a valid executor type from the registry (see /aopeg/registry/executors)',
              });
            }
          }
          const phantomNodes = execTypeByNode.filter(x => missing.has(x.type)).length;
          executorsScore = execTypeByNode.length > 0
            ? (execTypeByNode.length - phantomNodes) / execTypeByNode.length
            : 1;
        }
      } else {
        warnings.push({ code: 'EXECUTOR_REGISTRY_UNAVAILABLE', severity: 'warning', message: 'Executor registry unavailable — EXECUTOR_EXISTS skipped', suggestion: 'Ensure AOPEG is initialized' });
      }
    }

    return {
      pass: errors.length === 0,
      errors,
      warnings,
      score: { structure: structureScore, executors: executorsScore },
    };
  }

  // ── LEVEL 2: SEMANTIC ──────────────────────────────────────────────────────

  /**
   * @param {{nodes: Array, edges: Array}} graph
   * @returns {{pass, errors, warnings, score: {templates, branches}}}
   */
  verifyLevel2(graph) {
    const errors = [];
    const warnings = [];
    const nodes = graph?.nodes || [];
    const edges = graph?.edges || [];
    const nodeIds = new Set(nodes.map(n => n.id));

    // 2a. BRANCH_DISCIPLINE (GXE-050..054): condition nodes must route via labelled edges
    let condNodes = 0;
    let condBad = 0;
    for (const n of nodes) {
      const t = nodeExecutorType(n);
      if (!t || !CONDITION_TYPES.has(t)) continue;
      condNodes++;
      const outEdges = edges.filter(e => edgeSource(e) === n.id);
      const labelled = outEdges.filter(e => {
        const l = edgeLabel(e);
        return l && VALID_BRANCH_LABELS.has(String(l).toLowerCase().trim());
      });
      if (outEdges.length === 0) {
        condBad++;
        errors.push({ code: 'CONDITION_NO_OUTGOING', severity: 'error', nodeId: n.id, message: `Condition node "${n.id}" has no outgoing edges`, suggestion: 'Add labelled outgoing edges (e.g. true/false)' });
      } else if (labelled.length === 0) {
        condBad++;
        errors.push({ code: 'MISSING_BRANCH_LABELS', severity: 'error', nodeId: n.id, message: `Condition node "${n.id}" has no labelled outgoing edges`, suggestion: 'Add TRUE/FALSE (or synonym) labels to outgoing edges' });
      }
    }

    // 2b. TEMPLATE_REFS_EXIST: {{nodeId.field}} refs must point to an existing node
    let refCount = 0;
    let refBad = 0;
    const TEMPLATE_RE = /\{\{\s*([A-Za-z0-9_]+)\.[^}]*\}\}|\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
    for (const n of nodes) {
      const paramsStr = JSON.stringify(n.parameters ?? n.data?.config ?? n.data ?? {});
      let m;
      TEMPLATE_RE.lastIndex = 0;
      while ((m = TEMPLATE_RE.exec(paramsStr)) !== null) {
        const ref = m[1] || m[2];
        if (!ref || ref === 'input') continue; // {{input.*}} is always valid (entry payload)
        refCount++;
        if (!nodeIds.has(ref)) {
          refBad++;
          errors.push({ code: 'INVALID_TEMPLATE_REF', severity: 'error', nodeId: n.id, ref, message: `Template reference "{{${ref}...}}" in node "${n.id}" points to a non-existent node`, suggestion: 'Reference an existing upstream node id, or fix the template' });
        }
      }
    }

    const branchesScore = condNodes > 0 ? (condNodes - condBad) / condNodes : 1;
    const templatesScore = refCount > 0 ? (refCount - refBad) / refCount : 1;

    return {
      pass: errors.length === 0,
      errors,
      warnings,
      score: { templates: templatesScore, branches: branchesScore },
    };
  }

  // ── LEVEL 2.5: DYNAMIC (MockExecutionMode dry-run) ──────────────────────────

  _getRuntimeEngine() {
    if (!this._mcpRegistry) return null;
    let RuntimeEngine = this._RuntimeEngine;
    if (!RuntimeEngine) {
      try { RuntimeEngine = require('../../runtime/RuntimeEngine').RuntimeEngine; }
      catch { return null; }
    }
    try { return new RuntimeEngine(this._mcpRegistry, { enableValidation: false, recordExecutions: false }); }
    catch { return null; }
  }

  /**
   * Dry-run the graph through RuntimeEngine in MockExecutionMode and classify the
   * per-node outcomes. Catches data-flow defects a static pass cannot: field-level
   * UNRESOLVED_TEMPLATE, undeclared output contracts, and skip-cascades.
   *
   * Graceful degradation: if no MCP registry is available, returns skipped=true
   * (non-blocking), mirroring the Petri soundness gate.
   *
   * @param {{nodes: Array, edges: Array}} graph
   * @returns {Promise<{pass, skipped?, reason?, errors, warnings, score: {dynamicTemplates}}>}
   */
  async verifyLevel2_5(graph) {
    const engine = this._getRuntimeEngine();
    if (!engine) {
      return { pass: true, skipped: true, reason: 'RUNTIME_UNAVAILABLE', errors: [], warnings: [], score: { dynamicTemplates: 1 } };
    }

    const errors = [];
    const warnings = [];
    let result;
    try {
      const dag = { nodes: graph?.nodes || [], edges: graph?.edges || [], graphType: 'EXECUTABLE' };
      result = await engine.execute(dag, {}, { mode: 'mock' });
    } catch (err) {
      errors.push({ code: 'MOCK_EXECUTION_ERROR', severity: 'error', message: `Mock execution threw: ${err.message}`, suggestion: 'Fix graph structure before dynamic validation' });
      return { pass: false, errors, warnings, score: { dynamicTemplates: 0 } };
    }

    const nodeResults = result.nodeResults || {};
    let refCount = 0;
    let hardFail = 0;

    for (const [nodeId, nr] of Object.entries(nodeResults)) {
      if (nr.status === 'FAILED' && nr.error === 'UNRESOLVED_TEMPLATE') {
        refCount++;
        const ref = this._extractRefFromDetails(nr.details);
        const upstreamId = ref ? ref.split('.')[0] : null;
        const upstreamHasSchema = upstreamId ? this._upstreamHasOutputSchema(graph, upstreamId) : false;

        if (upstreamHasSchema) {
          hardFail++;
          errors.push({
            code: 'INVALID_TEMPLATE_REF',
            severity: 'error',
            nodeId,
            ref,
            message: `Template {{${ref || '?'}}} in "${nodeId}" cannot be resolved: field not produced by upstream (declared) outputSchema`,
            suggestion: 'Fix the reference or ensure the upstream executor produces that field',
          });
        } else {
          warnings.push({
            code: 'UNDECLARED_OUTPUT_CONTRACT',
            severity: 'warning',
            nodeId,
            ref,
            message: `Template {{${ref || '?'}}} in "${nodeId}" is unverifiable: upstream node lacks an outputSchema`,
            suggestion: 'Declare an outputSchema on the upstream executor to enable field-level validation',
          });
        }
      } else if (nr.status === 'SKIPPED') {
        warnings.push({
          code: 'SKIP_CASCADE',
          severity: 'warning',
          nodeId,
          message: `Node "${nodeId}" was skipped during mock execution (upstream failure or untaken branch)`,
          suggestion: 'Review upstream failures and branch routing',
        });
      } else if (nr.status === 'FAILED' && nr.error !== 'UNRESOLVED_TEMPLATE') {
        errors.push({
          code: 'MOCK_NODE_FAILED',
          severity: 'error',
          nodeId,
          message: `Node "${nodeId}" failed during mock execution: ${nr.error}`,
          suggestion: 'Review node configuration / data flow',
        });
      }
    }

    const dynamicTemplates = refCount > 0 ? (refCount - hardFail) / refCount : 1;
    return { pass: errors.length === 0, errors, warnings, score: { dynamicTemplates } };
  }

  _extractRefFromDetails(details) {
    const s = details?.error || (typeof details === 'string' ? details : '');
    const m = /\{\{\s*([^}]+?)\s*\}\}/.exec(s);
    return m ? m[1] : null;
  }

  _upstreamHasOutputSchema(graph, upstreamId) {
    if (upstreamId === 'input') return true;
    const node = (graph?.nodes || []).find(n => n.id === upstreamId);
    if (!node) return false;
    const type = nodeExecutorType(node);
    if (!type || !this._mcpRegistry?.getTool) return false;
    try {
      const tool = this._mcpRegistry.getTool(type);
      const def = tool?.getDefinition?.();
      const os = def?.outputSchema;
      return !!(os && os.properties && Object.keys(os.properties).length > 0);
    } catch { return false; }
  }

  // ── GRADING ────────────────────────────────────────────────────────────────

  _computeGrade(scores) {
    const weighted = Object.entries(WEIGHTS)
      .reduce((sum, [k, w]) => sum + (scores[k] ?? 1) * w, 0);
    let grade = 'F';
    if (weighted >= THRESHOLDS.A) grade = 'A';
    else if (weighted >= THRESHOLDS.B) grade = 'B';
    else if (weighted >= THRESHOLDS.C) grade = 'C';
    else if (weighted >= THRESHOLDS.D) grade = 'D';
    return { grade, score: Math.round(weighted * 1000) / 1000 };
  }

  // ── PUBLIC: FULL VERIFY ──────────────────────────────────────────────────────

  /**
   * Run the full (currently L1 + L2) verification stack.
   * @param {{nodes: Array, edges: Array}} graph
   * @param {Object} [options]
   * @returns {Promise<VerificationResult>}
   */
  async verify(graph, options = {}) {
    const l1 = await this.verifyLevel1(graph);
    const l2 = this.verifyLevel2(graph);

    // Only mock-run once the static levels pass — no point dry-running a broken graph.
    let l2_5 = { pass: true, skipped: true, errors: [], warnings: [], score: { dynamicTemplates: 1 } };
    if (l1.pass && l2.pass && options.includeDynamic !== false) {
      l2_5 = await this.verifyLevel2_5(graph);
    }

    const scores = { ...l1.score, ...l2.score, ...l2_5.score };
    const { grade, score } = this._computeGrade(scores);

    const issues = [
      ...l1.errors, ...l1.warnings,
      ...l2.errors, ...l2.warnings,
      ...(l2_5.errors || []), ...(l2_5.warnings || []),
    ];
    const suggestions = [...new Set(issues.map(i => i.suggestion).filter(Boolean))];

    return {
      pass: l1.pass && l2.pass && (l2_5.pass !== false),
      grade,
      score,
      scores,
      levels: { l1, l2, l2_5 },
      issues,
      suggestions,
    };
  }
}

// ── Factory / singleton ──────────────────────────────────────────────────────

let _instance = null;
function getExecutableGraphVerifier() {
  if (!_instance) _instance = new ExecutableGraphVerifier();
  return _instance;
}

module.exports = {
  ExecutableGraphVerifier,
  getExecutableGraphVerifier,
  WEIGHTS,
  THRESHOLDS,
};
