/**
 * Lightweight client-side predicate evaluator.
 * Supports subset of expressions for display conditions and validation.
 */

function getNestedValue(obj, path) {
  const parts = path.split('.');
  let value = obj;
  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    value = value[part];
  }
  return value;
}

export function evaluatePredicate(expression, context) {
  try {
    // 1. Extract string literals and replace with placeholders
    const strings = [];
    const withPlaceholders = expression.replace(/(["'])(?:(?!\1).)*\1/g, (match) => {
      strings.push(match);
      return `__STR${strings.length - 1}__`;
    });

    // 2. Replace variable references with context values
    const evaluated = withPlaceholders.replace(/\b([a-zA-Z_$][a-zA-Z0-9_.]*)\b/g, (match, name, offset, full) => {
      if (['true', 'false', 'null', 'undefined', 'and', 'or', 'not'].includes(match)) {
        return match;
      }
      // Skip placeholder tokens
      if (match.startsWith('__STR')) return match;

      const value = getNestedValue(context, match);
      if (value === undefined) return 'undefined';
      if (value === null) return 'null';
      if (typeof value === 'string') return JSON.stringify(value);
      if (Array.isArray(value)) return JSON.stringify(value);
      return String(value);
    });

    // 3. Restore string literals
    const restored = evaluated.replace(/__STR(\d+)__/g, (_, idx) => strings[Number(idx)]);

    // 4. Convert operators
    const jsExpression = restored
      .replace(/\band\b/gi, '&&')
      .replace(/\bor\b/gi, '||')
      .replace(/\bnot\b/gi, '!')
      .replace(/(?<!=)==(?!=)/g, '===')
      .replace(/!=(?!=)/g, '!==');

    const fn = new Function('return ' + jsExpression);
    return !!fn();
  } catch (e) {
    console.warn('Predicate evaluation failed:', expression, e);
    return true; // Default to show/valid on error
  }
}
