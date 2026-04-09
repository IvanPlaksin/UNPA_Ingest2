/**
 * AOPEG Executors for Codex Self-Consistency Check
 *
 * Each executor implements a specific validation check and produces findings.
 * Findings have severity: ERROR, WARNING, INFO
 */

const codexService = require('../../services/codex/codex.service');
const blackCodexService = require('../../services/codex/blackcodex.service');

// ============================================================
// FINDING HELPERS
// ============================================================

function finding(severity, code, message, details = {}) {
  return { severity, code, message, details, timestamp: new Date().toISOString() };
}

// ============================================================
// EXECUTOR 1: Load Codex Nodes
// ============================================================

class LoadCodexNodesExecutor {
  static id = 'codex.load_nodes';
  static description = 'Load all Codex and BlackCodex nodes for validation';

  async execute(input = {}) {
    const principles = await codexService.getByType('CodexPrinciple', { status: null });
    const rules = await codexService.getByType('CodexRule', { status: null });
    const sections = await codexService.getByType('CodexSection', { status: null });
    const patterns = await codexService.getByType('CodexPattern', { status: null });
    const proposals = await codexService.getByType('CodexProposal', { status: null });
    const stakeholders = await codexService.getByType('CodexStakeholder', { status: null });
    const blackcodex = await blackCodexService.getAll();

    const unwrap = arr => arr.map(n => n.properties || n);

    return {
      principles: unwrap(principles),
      rules: unwrap(rules),
      sections: unwrap(sections),
      patterns: unwrap(patterns),
      proposals: unwrap(proposals),
      stakeholders: unwrap(stakeholders),
      blackcodex: unwrap(blackcodex),
      counts: {
        principles: principles.length,
        rules: rules.length,
        sections: sections.length,
        patterns: patterns.length,
        proposals: proposals.length,
        stakeholders: stakeholders.length,
        blackcodex: blackcodex.length,
        total: principles.length + rules.length + sections.length + patterns.length +
               proposals.length + stakeholders.length + blackcodex.length
      }
    };
  }
}

// ============================================================
// EXECUTOR 2: Validate Principles
// ============================================================

class ValidatePrinciplesExecutor {
  static id = 'codex.validate_principles';
  static description = 'Validate M3 principles have rules, required fields, FROZEN tier';

  async execute(input = {}) {
    const { principles = [], rules = [] } = input;
    const findings = [];

    for (const p of principles) {
      // Check required narrative fields
      for (const field of ['title', 'summary', 'rationale', 'whyItExists']) {
        if (!p[field]) {
          findings.push(finding('ERROR', 'MISSING_FIELD',
            `Principle ${p.codexId} missing required field: ${field}`,
            { codexId: p.codexId, field }));
        }
      }

      // Check examples
      let examples = p.examples;
      if (typeof examples === 'string') try { examples = JSON.parse(examples); } catch { examples = []; }
      if (!examples || !Array.isArray(examples) || examples.length === 0) {
        findings.push(finding('WARNING', 'MISSING_EXAMPLES',
          `Principle ${p.codexId} has no examples`,
          { codexId: p.codexId }));
      }

      // Check FROZEN tier
      if (p.changeabilityTier !== 'FROZEN') {
        findings.push(finding('ERROR', 'PRINCIPLE_NOT_FROZEN',
          `Principle ${p.codexId} should be FROZEN but is ${p.changeabilityTier}`,
          { codexId: p.codexId, tier: p.changeabilityTier }));
      }

      // Check has derived rules
      const derivedRules = rules.filter(r => r.derivesFromPrinciple === p.codexId);
      if (derivedRules.length === 0) {
        // Also check via graph relationships
        const graphRules = await codexService.getRulesByPrinciple(p.codexId);
        if (graphRules.length === 0) {
          findings.push(finding('WARNING', 'ORPHAN_PRINCIPLE',
            `Principle ${p.codexId} has no derived rules`,
            { codexId: p.codexId }));
        }
      }
    }

    if (principles.length === 0) {
      findings.push(finding('ERROR', 'NO_PRINCIPLES', 'No principles found in Codex'));
    }

    return {
      check: 'validate-principles',
      passed: findings.filter(f => f.severity === 'ERROR').length === 0,
      findings
    };
  }
}

// ============================================================
// EXECUTOR 3: Validate Rules
// ============================================================

class ValidateRulesExecutor {
  static id = 'codex.validate_rules';
  static description = 'Validate rules have DERIVES_FROM, examples, valid modality';

  async execute(input = {}) {
    const { rules = [], principles = [] } = input;
    const findings = [];
    const validModalities = ['MUST', 'SHOULD', 'MAY', 'MUST_NOT', 'SHOULD_NOT'];
    const validStatuses = ['ACTIVE', 'PROPOSED', 'DEPRECATED', 'SUPERSEDED'];
    const principleIds = new Set(principles.map(p => p.codexId));

    for (const r of rules) {
      // Check required fields
      for (const field of ['title', 'summary', 'rationale', 'whyItExists']) {
        if (!r[field]) {
          findings.push(finding('ERROR', 'MISSING_FIELD',
            `Rule ${r.codexId} missing: ${field}`, { codexId: r.codexId, field }));
        }
      }

      // Check examples
      let examples = r.examples;
      if (typeof examples === 'string') try { examples = JSON.parse(examples); } catch { examples = []; }
      if (!examples || examples.length === 0) {
        findings.push(finding('WARNING', 'MISSING_EXAMPLES',
          `Rule ${r.codexId} has no examples`, { codexId: r.codexId }));
      }

      // Check modality
      if (!validModalities.includes(r.modality)) {
        findings.push(finding('ERROR', 'INVALID_MODALITY',
          `Rule ${r.codexId} has invalid modality: ${r.modality}`,
          { codexId: r.codexId, modality: r.modality }));
      }

      // Check status
      if (r.status && !validStatuses.includes(r.status)) {
        findings.push(finding('ERROR', 'INVALID_STATUS',
          `Rule ${r.codexId} has invalid status: ${r.status}`,
          { codexId: r.codexId, status: r.status }));
      }

      // Check DERIVES_FROM via graph
      const principleRules = await codexService.getRulesByPrinciple(r.codexId);
      // We check the reverse: does this rule link to a principle?
      // Since getRulesByPrinciple goes principle→rules, we check if any principle claims this rule
      let hasDerivesFrom = false;
      for (const pid of principleIds) {
        const derived = await codexService.getRulesByPrinciple(pid);
        if (derived.some(d => (d.properties || d).codexId === r.codexId)) {
          hasDerivesFrom = true;
          break;
        }
      }
      if (!hasDerivesFrom) {
        findings.push(finding('WARNING', 'ORPHAN_RULE',
          `Rule ${r.codexId} has no DERIVES_FROM relationship to any principle`,
          { codexId: r.codexId }));
      }
    }

    return {
      check: 'validate-rules',
      passed: findings.filter(f => f.severity === 'ERROR').length === 0,
      findings
    };
  }
}

// ============================================================
// EXECUTOR 4: Validate Hash Chain
// ============================================================

class ValidateHashChainExecutor {
  static id = 'codex.validate_hash';
  static description = 'Verify contentHash presence on all Codex nodes';

  async execute(input = {}) {
    const findings = [];
    const allNodes = [
      ...(input.principles || []),
      ...(input.rules || []),
      ...(input.sections || []),
      ...(input.patterns || []),
      ...(input.stakeholders || [])
    ];

    for (const node of allNodes) {
      if (!node.contentHash) {
        findings.push(finding('ERROR', 'MISSING_HASH',
          `Node ${node.codexId} missing contentHash`,
          { codexId: node.codexId, nodeType: node.nodeType }));
      }

      if (!node.chainHash) {
        findings.push(finding('WARNING', 'MISSING_CHAIN_HASH',
          `Node ${node.codexId} missing chainHash`,
          { codexId: node.codexId }));
      }
    }

    return {
      check: 'validate-hash',
      passed: findings.filter(f => f.severity === 'ERROR').length === 0,
      findings
    };
  }
}

// ============================================================
// EXECUTOR 5: Validate BlackCodex
// ============================================================

class ValidateBlackCodexExecutor {
  static id = 'codex.validate_blackcodex';
  static description = 'Validate BlackCodex entries reference valid rules';

  async execute(input = {}) {
    const { blackcodex = [], rules = [] } = input;
    const findings = [];
    const ruleIds = new Set(rules.map(r => r.codexId));

    for (const entry of blackcodex) {
      // Check required fields
      for (const field of ['title', 'summary', 'failureContext', 'symptom', 'rootCause', 'refactoringPlan']) {
        if (!entry[field]) {
          findings.push(finding('ERROR', 'MISSING_FIELD',
            `BlackCodex ${entry.codexId} missing: ${field}`,
            { codexId: entry.codexId, field }));
        }
      }

      // Check alternativeTo references valid rule
      if (entry.alternativeTo && entry.alternativeTo.length > 0) {
        if (!ruleIds.has(entry.alternativeTo)) {
          findings.push(finding('WARNING', 'BROKEN_ALTERNATIVE_REF',
            `BlackCodex ${entry.codexId} references non-existent rule: ${entry.alternativeTo}`,
            { codexId: entry.codexId, alternativeTo: entry.alternativeTo }));
        }
      }
    }

    return {
      check: 'validate-blackcodex',
      passed: findings.filter(f => f.severity === 'ERROR').length === 0,
      findings
    };
  }
}

// ============================================================
// EXECUTOR 6: Validate SUPERSEDES Chains
// ============================================================

class ValidateSupersededChainsExecutor {
  static id = 'codex.validate_supersedes';
  static description = 'Detect cycles in SUPERSEDES chains and validate status consistency';

  async execute(input = {}) {
    const findings = [];

    let _memgraph = null;
    try {
      _memgraph = require('../../services/memgraph.service');
    } catch { /* not available */ }

    if (!_memgraph) {
      findings.push(finding('INFO', 'SKIP_SUPERSEDES', 'Memgraph not available for SUPERSEDES check'));
      return { check: 'validate-supersedes', passed: true, findings };
    }

    // Find all SUPERSEDES chains
    const query = `
      MATCH (a)-[:SUPERSEDES]->(b)
      WHERE a.namespace = 'Codex'
      RETURN a.codexId AS from, b.codexId AS to, b.status AS targetStatus
    `;

    const result = await _memgraph.runQuery(query);

    // Build adjacency list and check for cycles
    const graph = {};
    for (const row of result) {
      if (!graph[row.from]) graph[row.from] = [];
      graph[row.from].push(row.to);

      // Target of SUPERSEDES should be SUPERSEDED
      if (row.targetStatus !== 'SUPERSEDED') {
        findings.push(finding('WARNING', 'SUPERSEDED_STATUS_MISMATCH',
          `${row.to} is target of SUPERSEDES but has status: ${row.targetStatus}`,
          { from: row.from, to: row.to, status: row.targetStatus }));
      }
    }

    // DFS cycle detection
    const visited = new Set();
    const inStack = new Set();

    function hasCycle(node) {
      if (inStack.has(node)) return true;
      if (visited.has(node)) return false;
      visited.add(node);
      inStack.add(node);
      for (const next of (graph[node] || [])) {
        if (hasCycle(next)) return true;
      }
      inStack.delete(node);
      return false;
    }

    for (const node of Object.keys(graph)) {
      if (hasCycle(node)) {
        findings.push(finding('ERROR', 'SUPERSEDES_CYCLE',
          `Cycle detected in SUPERSEDES chain starting from ${node}`,
          { startNode: node }));
      }
    }

    return {
      check: 'validate-supersedes',
      passed: findings.filter(f => f.severity === 'ERROR').length === 0,
      findings
    };
  }
}

// ============================================================
// EXECUTOR 7: Generate Report
// ============================================================

class GenerateReportExecutor {
  static id = 'codex.generate_report';
  static description = 'Aggregate all findings into final report';

  async execute(input = {}) {
    // Collect all check results
    const checkKeys = [
      'validate-principles', 'validate-rules', 'validate-hash',
      'validate-blackcodex', 'validate-supersedes'
    ];

    const allFindings = [];
    const checkResults = {};

    for (const [key, value] of Object.entries(input)) {
      if (value && value.check && value.findings) {
        checkResults[value.check] = value;
        allFindings.push(...value.findings.map(f => ({ ...f, executor: value.check })));
      }
    }

    const errors = allFindings.filter(f => f.severity === 'ERROR');
    const warnings = allFindings.filter(f => f.severity === 'WARNING');
    const info = allFindings.filter(f => f.severity === 'INFO');
    const passedChecks = Object.values(checkResults).filter(c => c.passed).length;
    const totalChecks = Object.keys(checkResults).length;

    let status;
    if (errors.length > 0) {
      status = 'FAILED';
    } else if (warnings.length > 0) {
      status = 'PASSED_WITH_WARNINGS';
    } else {
      status = 'PASSED';
    }

    // Generate recommendations
    const recommendations = [];
    if (allFindings.some(f => f.code === 'ORPHAN_PRINCIPLE')) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Add M2 rules for principles without derived rules',
        automated: false
      });
    }
    if (allFindings.some(f => f.code === 'ORPHAN_RULE')) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'Link orphan rules to principles via DERIVES_FROM',
        automated: true,
        script: 'node api/scripts/fix-orphan-rules.js'
      });
    }
    if (allFindings.some(f => f.code === 'MISSING_HASH')) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Recompute contentHash for nodes missing it',
        automated: true,
        script: 'node api/scripts/fix-codex-hashes.js'
      });
    }

    return {
      status,
      summary: {
        totalChecks,
        passedChecks,
        errors: errors.length,
        warnings: warnings.length,
        info: info.length,
        totalFindings: allFindings.length
      },
      findings: allFindings,
      recommendations,
      counts: input.counts || {},
      timestamp: new Date().toISOString()
    };
  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  LoadCodexNodesExecutor,
  ValidatePrinciplesExecutor,
  ValidateRulesExecutor,
  ValidateHashChainExecutor,
  ValidateBlackCodexExecutor,
  ValidateSupersededChainsExecutor,
  GenerateReportExecutor,

  // Registry for dynamic loading
  executors: {
    'codex.load_nodes': LoadCodexNodesExecutor,
    'codex.validate_principles': ValidatePrinciplesExecutor,
    'codex.validate_rules': ValidateRulesExecutor,
    'codex.validate_hash': ValidateHashChainExecutor,
    'codex.validate_blackcodex': ValidateBlackCodexExecutor,
    'codex.validate_supersedes': ValidateSupersededChainsExecutor,
    'codex.generate_report': GenerateReportExecutor
  }
};
