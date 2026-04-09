/**
 * Routing Evaluate Executor — config-driven rule evaluation
 *
 * Evaluates input data against a set of routing rules passed as parameters.
 * Rules, targets, and conditions are defined in the graph, not in code.
 *
 * Modes:
 * - first-match: return first matching rule's target (default)
 * - all-matches: return all matching rules' targets
 * - highest-priority: sort by priority, return best match
 *
 * Supported operators: eq, ne, gt, gte, lt, lte, in, notIn, contains,
 *   startsWith, endsWith, exists, notExists, regex
 */

const { BaseExecutor } = require('../../plugin-base');

class RoutingEvaluateExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'routing.evaluate';
    this.displayName = 'Evaluate Routing Rules';
    this.description = 'Evaluate input against configurable routing rules and return target';
    this.domain = 'common';

    this.parameterSchema = {
      type: 'object',
      properties: {
        input: { type: 'object', description: 'Data to evaluate against rules' },
        rules: {
          type: 'array',
          description: 'Routing rules: [{id, conditions: [{field, operator, value}], target, priority}]',
          items: { type: 'object' },
        },
        defaultTarget: { type: 'object', description: 'Fallback target if no rules match' },
        mode: {
          type: 'string',
          enum: ['first-match', 'all-matches', 'highest-priority'],
          default: 'first-match',
        },
      },
      required: ['input', 'rules'],
    };
  }

  async execute(parameters, context) {
    const input = this.getRequiredParam(parameters, 'input');
    const rules = this.getRequiredParam(parameters, 'rules');
    const defaultTarget = this.getParam(parameters, 'defaultTarget', null);
    const mode = this.getParam(parameters, 'mode', 'first-match');

    // Sort by priority descending
    const sorted = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));

    const matches = [];

    for (const rule of sorted) {
      if (this._evaluateRule(rule, input)) {
        matches.push({
          ruleId: rule.id || null,
          target: rule.target,
          priority: rule.priority || 0,
        });
        if (mode === 'first-match') break;
      }
    }

    if (matches.length === 0) {
      return this.success({
        matched: false,
        target: defaultTarget,
        matchedRule: null,
        rulesEvaluated: sorted.length,
        branch: 'no_match',
      });
    }

    if (mode === 'all-matches') {
      return this.success({
        matched: true,
        targets: matches.map(m => m.target),
        matchedRules: matches.map(m => m.ruleId),
        matchCount: matches.length,
        rulesEvaluated: sorted.length,
        branch: 'matched',
      });
    }

    return this.success({
      matched: true,
      target: matches[0].target,
      matchedRule: matches[0].ruleId,
      rulesEvaluated: sorted.length,
      branch: 'matched',
    });
  }

  _evaluateRule(rule, input) {
    const { conditions = [] } = rule;
    // All conditions must match (AND)
    return conditions.every(c => this._evaluateCondition(c, input));
  }

  _evaluateCondition(cond, input) {
    const { field, operator, value } = cond;
    const actual = this._getNestedValue(input, field);

    switch (operator) {
      case 'eq': return actual === value;
      case 'ne': return actual !== value;
      case 'gt': return actual > value;
      case 'gte': return actual >= value;
      case 'lt': return actual < value;
      case 'lte': return actual <= value;
      case 'in': return Array.isArray(value) && value.includes(actual);
      case 'notIn': return Array.isArray(value) && !value.includes(actual);
      case 'contains': return typeof actual === 'string' && actual.includes(value);
      case 'startsWith': return typeof actual === 'string' && actual.startsWith(value);
      case 'endsWith': return typeof actual === 'string' && actual.endsWith(value);
      case 'exists': return actual !== undefined && actual !== null;
      case 'notExists': return actual === undefined || actual === null;
      case 'regex': return new RegExp(value).test(String(actual ?? ''));
      default: return false;
    }
  }

  _getNestedValue(obj, path) {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  }
}

module.exports = { RoutingEvaluateExecutor };
