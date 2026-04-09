/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BUILT-IN DATA TRANSFORMERS
 * Core provides these basic transformers; plugins can add more
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { pluginRegistry } = require('../registry/plugin-registry');

const CORE_PLUGIN = {
  name: 'aopeg-core',
  version: '1.0.0',
  domain: 'core',
  description: 'AOPEG Core built-in components',
};

// ────────────────────────────────────────────────────────────────────────────
// IDENTITY - Pass through unchanged
// ────────────────────────────────────────────────────────────────────────────

class IdentityTransformer {
  constructor() {
    this.type = 'identity';
  }

  async transform(input) {
    return input;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// JSON_PATH - Extract using JSONPath-like syntax
// ────────────────────────────────────────────────────────────────────────────

class JsonPathTransformer {
  constructor() {
    this.type = 'json_path';
  }

  async transform(input, config) {
    const path = config.path;
    if (!path) return input;

    const parts = path.split('.');
    let value = input;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        // Handle array index: field[0], field[1], etc.
        const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
        if (arrayMatch) {
          const [, key, index] = arrayMatch;
          value = value[key];
          if (Array.isArray(value)) {
            value = value[parseInt(index)];
          }
        } else {
          value = value[part];
        }
      } else {
        return undefined;
      }
    }

    return value;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// MAP - Transform array elements
// ────────────────────────────────────────────────────────────────────────────

class MapTransformer {
  constructor() {
    this.type = 'map';
  }

  async transform(input, config) {
    if (!Array.isArray(input)) return input;

    const field = config.field;
    if (!field) return input;

    return input.map(item => {
      if (item && typeof item === 'object') {
        return item[field];
      }
      return item;
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// FILTER - Filter array elements
// ────────────────────────────────────────────────────────────────────────────

class FilterTransformer {
  constructor() {
    this.type = 'filter';
  }

  async transform(input, config) {
    if (!Array.isArray(input)) return input;

    const field = config.field;
    const operator = config.operator;
    const value = config.value;

    return input.filter(item => {
      let itemValue = item;
      if (field && item && typeof item === 'object') {
        itemValue = item[field];
      }

      switch (operator) {
        case 'eq': return itemValue === value;
        case 'ne': return itemValue !== value;
        case 'gt': return itemValue > value;
        case 'gte': return itemValue >= value;
        case 'lt': return itemValue < value;
        case 'lte': return itemValue <= value;
        case 'contains': return String(itemValue).includes(String(value));
        case 'exists': return itemValue !== undefined && itemValue !== null;
        case 'not_exists': return itemValue === undefined || itemValue === null;
        case 'in': return Array.isArray(value) && value.includes(itemValue);
        case 'not_in': return Array.isArray(value) && !value.includes(itemValue);
        default: return true;
      }
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// TEMPLATE - String template interpolation
// ────────────────────────────────────────────────────────────────────────────

class TemplateTransformer {
  constructor() {
    this.type = 'template';
  }

  async transform(input, config, context) {
    const template = config.template;
    if (!template) return input;

    // Replace {{path}} with values
    return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
      const trimmedPath = path.trim();

      // Check special prefixes
      if (trimmedPath.startsWith('input.')) {
        return this.resolvePath(input, trimmedPath.slice(6));
      }
      if (trimmedPath.startsWith('var.')) {
        return String(context.variables[trimmedPath.slice(4)] ?? '');
      }
      if (trimmedPath.startsWith('meta.')) {
        return String(context.metadata[trimmedPath.slice(5)] ?? '');
      }
      if (trimmedPath.startsWith('state.')) {
        return String(context.sharedState.get(trimmedPath.slice(6)) ?? '');
      }
      if (trimmedPath.startsWith('node.')) {
        const [nodeId, ...fieldPath] = trimmedPath.slice(5).split('.');
        const nodeOutput = context.nodeOutputs.get(nodeId);
        if (fieldPath.length > 0) {
          return this.resolvePath(nodeOutput, fieldPath.join('.'));
        }
        return String(nodeOutput ?? '');
      }

      // Default: resolve from input
      return this.resolvePath(input, trimmedPath);
    });
  }

  resolvePath(obj, path) {
    const parts = path.split('.');
    let value = obj;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return '';
      }
    }

    return String(value ?? '');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// MERGE - Merge multiple objects
// ────────────────────────────────────────────────────────────────────────────

class MergeTransformer {
  constructor() {
    this.type = 'merge';
  }

  async transform(input, config, context) {
    const sources = config.sources;
    const strategy = config.strategy || 'shallow';

    if (!sources || !Array.isArray(sources)) return input;

    const result = {};

    for (const source of sources) {
      let value;

      if (source === 'input') {
        value = input;
      } else if (source.startsWith('node.')) {
        const nodeId = source.slice(5);
        value = context.nodeOutputs.get(nodeId);
      } else if (source.startsWith('state.')) {
        const key = source.slice(6);
        value = context.sharedState.get(key);
      } else if (source.startsWith('var.')) {
        const key = source.slice(4);
        value = context.variables[key];
      }

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (strategy === 'deep') {
          this.deepMerge(result, value);
        } else {
          Object.assign(result, value);
        }
      }
    }

    return result;
  }

  deepMerge(target, source) {
    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        target[key] &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        this.deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// FLATTEN - Flatten nested arrays
// ────────────────────────────────────────────────────────────────────────────

class FlattenTransformer {
  constructor() {
    this.type = 'flatten';
  }

  async transform(input, config) {
    if (!Array.isArray(input)) return input;

    const depth = config.depth ?? 1;
    return input.flat(depth);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AGGREGATE - Aggregate array values
// ────────────────────────────────────────────────────────────────────────────

class AggregateTransformer {
  constructor() {
    this.type = 'aggregate';
  }

  async transform(input, config) {
    if (!Array.isArray(input)) return input;

    const operation = config.operation;
    const field = config.field;

    const values = field
      ? input.map(item => item?.[field]).filter(v => typeof v === 'number')
      : input.filter(v => typeof v === 'number');

    switch (operation) {
      case 'sum': return values.reduce((a, b) => a + b, 0);
      case 'avg': return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      case 'min': return Math.min(...values);
      case 'max': return Math.max(...values);
      case 'count': return input.length;
      case 'first': return input[0];
      case 'last': return input[input.length - 1];
      case 'unique': return [...new Set(field ? input.map(i => i?.[field]) : input)];
      default: return input;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PICK - Pick specific fields from object
// ────────────────────────────────────────────────────────────────────────────

class PickTransformer {
  constructor() {
    this.type = 'pick';
  }

  async transform(input, config) {
    if (!input || typeof input !== 'object') return input;

    const fields = config.fields;
    if (!fields || !Array.isArray(fields)) return input;

    const result = {};
    for (const field of fields) {
      if (field in input) {
        result[field] = input[field];
      }
    }

    return result;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// OMIT - Omit specific fields from object
// ────────────────────────────────────────────────────────────────────────────

class OmitTransformer {
  constructor() {
    this.type = 'omit';
  }

  async transform(input, config) {
    if (!input || typeof input !== 'object') return input;

    const fields = config.fields;
    if (!fields || !Array.isArray(fields)) return input;

    const result = { ...input };
    for (const field of fields) {
      delete result[field];
    }

    return result;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// RENAME - Rename fields in object
// ────────────────────────────────────────────────────────────────────────────

class RenameTransformer {
  constructor() {
    this.type = 'rename';
  }

  async transform(input, config) {
    if (!input || typeof input !== 'object') return input;

    const mappings = config.mappings;
    if (!mappings) return input;

    const result = { ...input };
    for (const [oldKey, newKey] of Object.entries(mappings)) {
      if (oldKey in result) {
        result[newKey] = result[oldKey];
        delete result[oldKey];
      }
    }

    return result;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// WRAP - Wrap value in object or array
// ────────────────────────────────────────────────────────────────────────────

class WrapTransformer {
  constructor() {
    this.type = 'wrap';
  }

  async transform(input, config) {
    const wrapType = config.type;
    const key = config.key;

    if (wrapType === 'array') {
      return Array.isArray(input) ? input : [input];
    }

    if (wrapType === 'object' && key) {
      return { [key]: input };
    }

    return input;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// UNWRAP - Unwrap value from object or array
// ────────────────────────────────────────────────────────────────────────────

class UnwrapTransformer {
  constructor() {
    this.type = 'unwrap';
  }

  async transform(input, config) {
    const key = config.key;
    const index = config.index;

    if (Array.isArray(input)) {
      return input[index ?? 0];
    }

    if (input && typeof input === 'object' && key) {
      return input[key];
    }

    return input;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// COERCE - Type coercion
// ────────────────────────────────────────────────────────────────────────────

class CoerceTransformer {
  constructor() {
    this.type = 'coerce';
  }

  async transform(input, config) {
    const targetType = config.to;

    switch (targetType) {
      case 'string':
        return String(input);
      case 'number':
        return Number(input);
      case 'boolean':
        return Boolean(input);
      case 'json':
        return typeof input === 'string' ? JSON.parse(input) : input;
      default:
        return input;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// CONCAT - Concatenate arrays or strings
// ────────────────────────────────────────────────────────────────────────────

class ConcatTransformer {
  constructor() {
    this.type = 'concat';
  }

  async transform(input, config, context) {
    const sources = config.sources;
    const separator = config.separator;

    const values = [input];

    if (sources) {
      for (const source of sources) {
        if (source.startsWith('node.')) {
          values.push(context.nodeOutputs.get(source.slice(5)));
        } else if (source.startsWith('var.')) {
          values.push(context.variables[source.slice(4)]);
        }
      }
    }

    // If all are arrays, concat arrays
    if (values.every(v => Array.isArray(v))) {
      return values.flat();
    }

    // If all are strings, concat with separator
    if (values.every(v => typeof v === 'string')) {
      return values.join(separator ?? '');
    }

    return values;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// REGISTER ALL BUILT-IN TRANSFORMERS
// ────────────────────────────────────────────────────────────────────────────

function registerBuiltinTransformers() {
  pluginRegistry.registerTransformer(new IdentityTransformer(), CORE_PLUGIN);
  pluginRegistry.registerTransformer(new JsonPathTransformer(), CORE_PLUGIN);
  pluginRegistry.registerTransformer(new MapTransformer(), CORE_PLUGIN);
  pluginRegistry.registerTransformer(new FilterTransformer(), CORE_PLUGIN);
  pluginRegistry.registerTransformer(new TemplateTransformer(), CORE_PLUGIN);
  pluginRegistry.registerTransformer(new MergeTransformer(), CORE_PLUGIN);
  pluginRegistry.registerTransformer(new FlattenTransformer(), CORE_PLUGIN);
  pluginRegistry.registerTransformer(new AggregateTransformer(), CORE_PLUGIN);
  pluginRegistry.registerTransformer(new PickTransformer(), CORE_PLUGIN);
  pluginRegistry.registerTransformer(new OmitTransformer(), CORE_PLUGIN);
  pluginRegistry.registerTransformer(new RenameTransformer(), CORE_PLUGIN);
  pluginRegistry.registerTransformer(new WrapTransformer(), CORE_PLUGIN);
  pluginRegistry.registerTransformer(new UnwrapTransformer(), CORE_PLUGIN);
  pluginRegistry.registerTransformer(new CoerceTransformer(), CORE_PLUGIN);
  pluginRegistry.registerTransformer(new ConcatTransformer(), CORE_PLUGIN);
}

// Export all transformers for direct use
const builtinTransformers = {
  IdentityTransformer,
  JsonPathTransformer,
  MapTransformer,
  FilterTransformer,
  TemplateTransformer,
  MergeTransformer,
  FlattenTransformer,
  AggregateTransformer,
  PickTransformer,
  OmitTransformer,
  RenameTransformer,
  WrapTransformer,
  UnwrapTransformer,
  CoerceTransformer,
  ConcatTransformer,
};

module.exports = {
  registerBuiltinTransformers,
  builtinTransformers,
  IdentityTransformer,
  JsonPathTransformer,
  MapTransformer,
  FilterTransformer,
  TemplateTransformer,
  MergeTransformer,
  FlattenTransformer,
  AggregateTransformer,
  PickTransformer,
  OmitTransformer,
  RenameTransformer,
  WrapTransformer,
  UnwrapTransformer,
  CoerceTransformer,
  ConcatTransformer,
};
