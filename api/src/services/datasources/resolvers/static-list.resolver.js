/**
 * Resolves static lists from config.
 */
const { BaseResolver } = require('./base.resolver');

class StaticListResolver extends BaseResolver {
  async resolve(config) {
    const items = config.items || [];
    const vf = config.valueField || 'value';
    const lf = config.labelField || 'label';

    const normalized = items.map(item => {
      if (typeof item === 'string') return { value: item, label: item };
      return {
        value: item[vf] ?? item.value ?? item.id,
        label: item[lf] ?? item.label ?? item.name ?? String(item[vf]),
      };
    });

    return { items: normalized };
  }

  validate(config) {
    const errors = [];
    if (!config.items || !Array.isArray(config.items)) errors.push('items array is required');
    return { valid: errors.length === 0, errors };
  }
}

module.exports = { StaticListResolver };
