const { BaseTool } = require('./BaseTool.js');

class FilterTool extends BaseTool {
  getDefinition() {
    return {
      id: 'primitive.filter',
      name: 'Filter Array',
      version: '1.0.0',
      level: 1,
      category: 'primitive',
      description: 'Filter array by predicate',
      inputSchema: {
        type: 'object',
        required: ['data', 'predicate'],
        properties: {
          data: { type: 'array' },
          predicate: {
            type: 'object',
            description: 'Predicate: {field, op, value} or {and: [...]} or {or: [...]}'
          }
        }
      },
      outputSchema: { type: 'array' },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 100, maxMemoryMb: 20 }
    };
  }

  matchPredicate(item, predicate) {
    if (predicate.and) {
      return predicate.and.every(p => this.matchPredicate(item, p));
    }
    if (predicate.or) {
      return predicate.or.some(p => this.matchPredicate(item, p));
    }
    const { field, op, value } = predicate;
    const itemValue = field ? item[field] : item;
    switch (op) {
      case 'eq': return itemValue === value;
      case 'ne': return itemValue !== value;
      case 'gt': return itemValue > value;
      case 'gte': return itemValue >= value;
      case 'lt': return itemValue < value;
      case 'lte': return itemValue <= value;
      case 'in': return Array.isArray(value) && value.includes(itemValue);
      case 'contains': return String(itemValue).includes(String(value));
      case 'exists': return itemValue !== undefined && itemValue !== null;
      default: return false;
    }
  }

  async execute(args, context) {
    const filtered = args.data.filter(item => this.matchPredicate(item, args.predicate));
    return this.success(filtered);
  }
}

module.exports = { FilterTool };
