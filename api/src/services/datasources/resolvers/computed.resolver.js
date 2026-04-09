/**
 * Resolves data via JSONata transformation.
 * Note: requires 'jsonata' npm package. Falls back to error if not installed.
 */
const { BaseResolver } = require('./base.resolver');

let jsonata = null;
try {
  jsonata = require('jsonata');
} catch {
  // jsonata not installed — will throw on resolve()
}

class ComputedResolver extends BaseResolver {
  async resolve(config, context) {
    if (!jsonata) throw new Error('jsonata package is not installed. Run: npm install jsonata');

    const expression = jsonata(config.expression);
    const result = await expression.evaluate(context);

    let items = Array.isArray(result) ? result : result != null ? [result] : [];
    const vf = config.valueField || 'value';
    const lf = config.labelField || 'label';

    items = items.filter(Boolean).map(item => {
      if (typeof item === 'string' || typeof item === 'number') {
        return { value: item, label: String(item) };
      }
      return {
        value: item[vf] ?? item.value ?? item.id,
        label: item[lf] ?? item.label ?? item.name ?? String(item[vf]),
        ...item,
      };
    });

    return { items, source: 'COMPUTED' };
  }

  validate(config) {
    const errors = [];
    if (!config.expression) errors.push('JSONata expression is required');
    if (jsonata && config.expression) {
      try { jsonata(config.expression); } catch (e) {
        errors.push(`Invalid JSONata expression: ${e.message}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }
}

module.exports = { ComputedResolver };
