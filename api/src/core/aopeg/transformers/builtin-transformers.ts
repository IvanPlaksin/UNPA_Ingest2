/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BUILT-IN DATA TRANSFORMERS
 * Core provides these basic transformers; plugins can add more
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  IDataTransformer,
  ExecutionContext,
} from '../types/core.types';
import { pluginRegistry, PluginMetadata } from '../registry/plugin-registry';

const CORE_PLUGIN: PluginMetadata = {
  name: 'aopeg-core',
  version: '1.0.0',
  domain: 'core',
  description: 'AOPEG Core built-in components',
};

// ────────────────────────────────────────────────────────────────────────────
// IDENTITY - Pass through unchanged
// ────────────────────────────────────────────────────────────────────────────

export class IdentityTransformer implements IDataTransformer {
  readonly type = 'identity';

  async transform(input: unknown): Promise<unknown> {
    return input;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// JSON_PATH - Extract using JSONPath-like syntax
// ────────────────────────────────────────────────────────────────────────────

export class JsonPathTransformer implements IDataTransformer {
  readonly type = 'json_path';

  async transform(
    input: unknown,
    config: Record<string, unknown>
  ): Promise<unknown> {
    const path = config.path as string;
    if (!path) return input;

    const parts = path.split('.');
    let value = input;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        // Handle array index: field[0], field[1], etc.
        const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
        if (arrayMatch) {
          const [, key, index] = arrayMatch;
          value = (value as Record<string, unknown>)[key];
          if (Array.isArray(value)) {
            value = value[parseInt(index)];
          }
        } else {
          value = (value as Record<string, unknown>)[part];
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

export class MapTransformer implements IDataTransformer {
  readonly type = 'map';

  async transform(
    input: unknown,
    config: Record<string, unknown>
  ): Promise<unknown> {
    if (!Array.isArray(input)) return input;

    const field = config.field as string;
    if (!field) return input;

    return input.map(item => {
      if (item && typeof item === 'object') {
        return (item as Record<string, unknown>)[field];
      }
      return item;
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// FILTER - Filter array elements
// ────────────────────────────────────────────────────────────────────────────

export class FilterTransformer implements IDataTransformer {
  readonly type = 'filter';

  async transform(
    input: unknown,
    config: Record<string, unknown>
  ): Promise<unknown> {
    if (!Array.isArray(input)) return input;

    const field = config.field as string;
    const operator = config.operator as string;
    const value = config.value;

    return input.filter(item => {
      let itemValue = item;
      if (field && item && typeof item === 'object') {
        itemValue = (item as Record<string, unknown>)[field];
      }

      switch (operator) {
        case 'eq': return itemValue === value;
        case 'ne': return itemValue !== value;
        case 'gt': return (itemValue as number) > (value as number);
        case 'gte': return (itemValue as number) >= (value as number);
        case 'lt': return (itemValue as number) < (value as number);
        case 'lte': return (itemValue as number) <= (value as number);
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

export class TemplateTransformer implements IDataTransformer {
  readonly type = 'template';

  async transform(
    input: unknown,
    config: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<unknown> {
    const template = config.template as string;
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

  private resolvePath(obj: unknown, path: string): string {
    const parts = path.split('.');
    let value = obj;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>)[part];
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

export class MergeTransformer implements IDataTransformer {
  readonly type = 'merge';

  async transform(
    input: unknown,
    config: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<unknown> {
    const sources = config.sources as string[];
    const strategy = (config.strategy as string) || 'shallow';

    if (!sources || !Array.isArray(sources)) return input;

    const result: Record<string, unknown> = {};

    for (const source of sources) {
      let value: unknown;

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
          this.deepMerge(result, value as Record<string, unknown>);
        } else {
          Object.assign(result, value);
        }
      }
    }

    return result;
  }

  private deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        target[key] &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        this.deepMerge(
          target[key] as Record<string, unknown>,
          source[key] as Record<string, unknown>
        );
      } else {
        target[key] = source[key];
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// FLATTEN - Flatten nested arrays
// ────────────────────────────────────────────────────────────────────────────

export class FlattenTransformer implements IDataTransformer {
  readonly type = 'flatten';

  async transform(
    input: unknown,
    config: Record<string, unknown>
  ): Promise<unknown> {
    if (!Array.isArray(input)) return input;

    const depth = (config.depth as number) ?? 1;
    return input.flat(depth);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AGGREGATE - Aggregate array values
// ────────────────────────────────────────────────────────────────────────────

export class AggregateTransformer implements IDataTransformer {
  readonly type = 'aggregate';

  async transform(
    input: unknown,
    config: Record<string, unknown>
  ): Promise<unknown> {
    if (!Array.isArray(input)) return input;

    const operation = config.operation as string;
    const field = config.field as string;

    const values = field
      ? input.map(item => (item as Record<string, unknown>)?.[field]).filter(v => typeof v === 'number')
      : input.filter(v => typeof v === 'number');

    switch (operation) {
      case 'sum': return (values as number[]).reduce((a, b) => a + b, 0);
      case 'avg': return values.length ? (values as number[]).reduce((a, b) => a + b, 0) / values.length : 0;
      case 'min': return Math.min(...(values as number[]));
      case 'max': return Math.max(...(values as number[]));
      case 'count': return input.length;
      case 'first': return input[0];
      case 'last': return input[input.length - 1];
      case 'unique': return [...new Set(field ? input.map(i => (i as Record<string, unknown>)?.[field]) : input)];
      default: return input;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PICK - Pick specific fields from object
// ────────────────────────────────────────────────────────────────────────────

export class PickTransformer implements IDataTransformer {
  readonly type = 'pick';

  async transform(
    input: unknown,
    config: Record<string, unknown>
  ): Promise<unknown> {
    if (!input || typeof input !== 'object') return input;

    const fields = config.fields as string[];
    if (!fields || !Array.isArray(fields)) return input;

    const result: Record<string, unknown> = {};
    for (const field of fields) {
      if (field in (input as Record<string, unknown>)) {
        result[field] = (input as Record<string, unknown>)[field];
      }
    }

    return result;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// OMIT - Omit specific fields from object
// ────────────────────────────────────────────────────────────────────────────

export class OmitTransformer implements IDataTransformer {
  readonly type = 'omit';

  async transform(
    input: unknown,
    config: Record<string, unknown>
  ): Promise<unknown> {
    if (!input || typeof input !== 'object') return input;

    const fields = config.fields as string[];
    if (!fields || !Array.isArray(fields)) return input;

    const result: Record<string, unknown> = { ...(input as Record<string, unknown>) };
    for (const field of fields) {
      delete result[field];
    }

    return result;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// RENAME - Rename fields in object
// ────────────────────────────────────────────────────────────────────────────

export class RenameTransformer implements IDataTransformer {
  readonly type = 'rename';

  async transform(
    input: unknown,
    config: Record<string, unknown>
  ): Promise<unknown> {
    if (!input || typeof input !== 'object') return input;

    const mappings = config.mappings as Record<string, string>;
    if (!mappings) return input;

    const result: Record<string, unknown> = { ...(input as Record<string, unknown>) };
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

export class WrapTransformer implements IDataTransformer {
  readonly type = 'wrap';

  async transform(
    input: unknown,
    config: Record<string, unknown>
  ): Promise<unknown> {
    const wrapType = config.type as 'object' | 'array';
    const key = config.key as string;

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

export class UnwrapTransformer implements IDataTransformer {
  readonly type = 'unwrap';

  async transform(
    input: unknown,
    config: Record<string, unknown>
  ): Promise<unknown> {
    const key = config.key as string;
    const index = config.index as number;

    if (Array.isArray(input)) {
      return input[index ?? 0];
    }

    if (input && typeof input === 'object' && key) {
      return (input as Record<string, unknown>)[key];
    }

    return input;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// COERCE - Type coercion
// ────────────────────────────────────────────────────────────────────────────

export class CoerceTransformer implements IDataTransformer {
  readonly type = 'coerce';

  async transform(
    input: unknown,
    config: Record<string, unknown>
  ): Promise<unknown> {
    const targetType = config.to as 'string' | 'number' | 'boolean' | 'json';

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

export class ConcatTransformer implements IDataTransformer {
  readonly type = 'concat';

  async transform(
    input: unknown,
    config: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<unknown> {
    const sources = config.sources as string[];
    const separator = config.separator as string;

    const values: unknown[] = [input];

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

export function registerBuiltinTransformers(): void {
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
export const builtinTransformers = {
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
