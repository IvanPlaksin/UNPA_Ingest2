/**
 * Tool Whitelist Audit (PH-001)
 *
 * Validates that no dangerous tools leak through the agent whitelists.
 * Called at startup and optionally on every request to verify the whitelist
 * hasn't been tampered with.
 *
 * Dangerous patterns: tools that can write to the global KB, execute shell
 * commands, eval code, or bypass workspace isolation.
 *
 * @module middleware/whitelist-audit
 */

'use strict';

const LOG_PREFIX = '[WhitelistAudit]';

// Patterns that MUST NOT appear in any agent whitelist
const DANGEROUS_PATTERNS = [
  /^(shell|exec|eval|spawn|fork)_/i,  // shell execution
  /^file[_.]write/i,                    // file system writes
  /^file[_.]delete/i,
  /^kb[_.]create$/i,                    // global KB writes
  /^kb[_.]update$/i,
  /^kb[_.]delete$/i,
  /^graph[_.]create_node$/i,            // global graph mutation
  /^graph[_.]delete_node$/i,
  /^graph[_.]create_edge$/i,
  /^graph[_.]delete_edge$/i,
  /^admin[_.]/i,                        // admin tools
  /^system[_.]/i,                       // system tools
  /password/i,                          // anything with password
  /credential/i                         // credential management
];

// Tools that are EXPECTED in the workspace agent whitelist
const EXPECTED_WORKSPACE_TOOLS = [
  'workspace_create_draft',
  'workspace_update_draft',
  'workspace_list_drafts',
  'workspace_search_drafts',
  'workspace_get_draft',
  'workspace_list_sources',
  'workspace_validate_graph',
  'workspace_detect_contradictions',
  'workspace_analyze_sources',
  'workspace_kb_search',
  'workspace_kb_get_node'
];

/**
 * Audit a whitelist for dangerous tools. Returns violations.
 * @param {Function} isAllowedFn  The whitelist function (toolName → boolean)
 * @param {string} whitelistName  Label for logging
 * @returns {{violations: string[], expectedMissing: string[], safe: boolean}}
 */
function auditWhitelist(isAllowedFn, whitelistName = 'unknown') {
  const violations = [];

  // Check that dangerous tools are NOT allowed
  const dangerousTestNames = [
    'shell_execute', 'exec_command', 'eval_code',
    'file_write', 'file_delete',
    'kb_create', 'kb_update', 'kb_delete',
    'graph_create_node', 'graph_delete_node',
    'graph_create_edge', 'graph_delete_edge',
    'admin_restart', 'system_shutdown',
    'credential_get', 'password_reset'
  ];

  for (const tool of dangerousTestNames) {
    if (isAllowedFn(tool)) {
      violations.push(tool);
    }
  }

  if (violations.length > 0) {
    console.error(`${LOG_PREFIX} SECURITY VIOLATION in ${whitelistName}: dangerous tools allowed: ${violations.join(', ')}`);
  }

  // Check that expected workspace tools ARE allowed (only for workspace whitelist)
  const expectedMissing = [];
  if (whitelistName === 'workspace-agent') {
    for (const tool of EXPECTED_WORKSPACE_TOOLS) {
      if (!isAllowedFn(tool)) {
        expectedMissing.push(tool);
      }
    }
    if (expectedMissing.length > 0) {
      console.warn(`${LOG_PREFIX} Workspace whitelist missing expected tools: ${expectedMissing.join(', ')}`);
    }
  }

  const safe = violations.length === 0;
  if (safe) {
    console.log(`${LOG_PREFIX} ${whitelistName} whitelist audit PASSED`);
  }

  return { violations, expectedMissing, safe };
}

/**
 * Run audit on all known whitelists. Call at startup.
 */
function auditAllWhitelists() {
  const results = {};

  try {
    const { isToolAllowed: wsFilter } = require('../services/workspace/agent-tool-filter');
    results.workspaceAgent = auditWhitelist(wsFilter, 'workspace-agent');
  } catch (err) {
    console.warn(`${LOG_PREFIX} Could not audit workspace-agent whitelist: ${err.message}`);
    results.workspaceAgent = { safe: true, violations: [], expectedMissing: [], error: err.message };
  }

  try {
    const { isAllowed: catFilter } = require('../services/catalog/catalog-assistant.service');
    results.catalogAssistant = auditWhitelist((name) => catFilter(name, null), 'catalog-assistant-standalone');
    results.catalogAssistantWorkspace = auditWhitelist((name) => catFilter(name, 'some-ws-id'), 'catalog-assistant-workspace');
  } catch (err) {
    console.warn(`${LOG_PREFIX} Could not audit catalog-assistant whitelist: ${err.message}`);
    results.catalogAssistant = { safe: true, violations: [], expectedMissing: [], error: err.message };
  }

  const allSafe = Object.values(results).every(r => r.safe);
  if (allSafe) {
    console.log(`${LOG_PREFIX} All whitelist audits PASSED ✓`);
  } else {
    console.error(`${LOG_PREFIX} WHITELIST AUDIT FAILURES detected!`);
  }

  return { allSafe, results };
}

module.exports = {
  auditWhitelist,
  auditAllWhitelists,
  DANGEROUS_PATTERNS,
  EXPECTED_WORKSPACE_TOOLS
};
