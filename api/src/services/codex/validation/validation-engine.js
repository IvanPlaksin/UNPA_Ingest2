/**
 * CodexValidationEngine — executes registered checks against Memgraph
 */

class CodexValidationEngine {
  constructor(memgraph) {
    this.memgraph = memgraph;
  }

  /**
   * Execute a single check, return { violations, error? }
   */
  async executeCheck(check) {
    try {
      if (check.type === 'cypher') {
        return this._runCypherCheck(check);
      }
      return { violations: [], error: `Unknown check type: ${check.type}` };
    } catch (err) {
      return { violations: [], error: err.message };
    }
  }

  async _runCypherCheck(check) {
    const violations = [];
    const results = await this.memgraph.runQuery(check.query);

    for (const row of results) {
      violations.push({
        checkId: check.checkId,
        checkName: check.name,
        scope: check.scope,
        severity: check.severity || 'warning',
        nodeId: row.nodeId || '',
        label: row.label || '',
        message: this._format(check.messageTemplate, row),
        data: row
      });
    }

    return { violations };
  }

  _format(template, data) {
    if (!template) return JSON.stringify(data);
    return template.replace(/\{(\w+)\}/g, (_, key) => (data[key] !== undefined ? data[key] : `{${key}}`));
  }
}

module.exports = { CodexValidationEngine };
