import { useState, useEffect, useMemo } from 'react';
import { getFormSpecification } from '../../../services/api';

/**
 * Hook that loads a STRUCTURAL form specification and converts it
 * to the existing FormDefinition format used by FormRenderer.
 *
 * Bridges:
 *   STRUCTURAL spec (server) → FormDefinition (client)
 *   CONSTRAINT visibility { field, operator, value } → predicate expressions
 *   CONSTRAINT validation rules → field.validations[] predicate expressions
 */
export function useStructuralForm(nodeData, options = {}) {
  const { locale = 'en', enabled = true } = options;
  const [spec, setSpec] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const structuralGraphId = nodeData?.structuralGraphId || null;
  const constraintGraphId = nodeData?.constraintGraphId || null;
  const isStructuralBased = Boolean(structuralGraphId) && enabled;

  useEffect(() => {
    if (!isStructuralBased) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getFormSpecification(structuralGraphId, {
          constraintGraphId,
          locale,
        });
        if (!cancelled) setSpec(result);
      } catch (err) {
        if (!cancelled) {
          setError(err);
          console.error('[useStructuralForm] Failed to load:', err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [structuralGraphId, constraintGraphId, locale, isStructuralBased]);

  // Convert spec → existing FormDefinition format
  const formDefinition = useMemo(() => {
    if (!spec) return null;
    return specToFormDefinition(spec, locale);
  }, [spec, locale]);

  return { isStructuralBased, loading, error, spec, formDefinition };
}

// ────────────────────────────────────────────────────────────────────────────
// CONVERSION: FormSpecification → FormDefinition
// ────────────────────────────────────────────────────────────────────────────

function specToFormDefinition(spec, locale) {
  const { jsonSchema, visibilityRules, errorMessages, uiHints, fieldOrder } = spec;
  const required = new Set(jsonSchema.required || []);

  const fields = fieldOrder.map((fieldName, idx) => {
    const prop = jsonSchema.properties?.[fieldName];
    if (!prop) return null;

    const hints = uiHints?.[fieldName] || {};
    const vis = visibilityRules?.[fieldName];
    const msgs = errorMessages?.[fieldName] || {};

    // Build validations array (predicate expression format for existing hooks)
    const validations = buildValidations(fieldName, prop, msgs, locale);

    // Build display conditions
    const conditions = vis ? [buildCondition(vis)] : undefined;

    return {
      id: `field_${fieldName}`,
      name: fieldName,
      type: mapFieldType(prop, hints),
      label: prop.title || fieldName,
      description: prop.description,
      required: required.has(fieldName),
      defaultValue: prop.default,
      placeholder: hints.placeholder?.[locale] || hints.placeholder?.en,
      disabled: hints.readonly || false,
      readOnly: hints.readonly || false,
      order: idx,
      // Enum options
      options: prop.enum
        ? prop.enum.map(v => ({ value: v, label: v }))
        : undefined,
      // Layout
      width: hints.width,
      rows: hints.rows,
      widget: hints.widget,
      // Validation rules as predicate expressions
      validations,
      // Display conditions
      conditions,
    };
  }).filter(Boolean);

  return {
    id: spec.meta?.structuralGraphId || 'structural-form',
    name: jsonSchema.title || 'Form',
    description: jsonSchema.description,
    status: 'ACTIVE',
    sections: [{
      id: 'section_main',
      title: null,
      order: 0,
      fields,
    }],
    // Attach raw spec for advanced usage
    _structuralSpec: spec,
  };
}

function mapFieldType(prop, hints) {
  if (hints.widget === 'radio') return 'select'; // Radio rendered as select with options
  if (hints.widget === 'textarea') return 'textarea';
  if (prop.enum) return 'select';
  if (prop.format === 'email') return 'email';
  if (prop.format === 'date') return 'date';
  if (prop.format === 'date-time') return 'datetime';
  if (prop.format === 'uri') return 'url';
  if (prop.type === 'integer' || prop.type === 'number') return 'number';
  if (prop.type === 'boolean') return 'boolean';
  return 'text';
}

/**
 * Convert CONSTRAINT validation rules to predicate expressions
 * compatible with the existing useFormValidation hook.
 */
function buildValidations(fieldName, prop, msgs, locale) {
  const rules = [];

  if (prop.minLength) {
    const msg = msgs.MIN_LENGTH?.[locale] || msgs.MIN_LENGTH?.en
      || `Must be at least ${prop.minLength} characters`;
    rules.push({
      expression: `${fieldName} && ${fieldName}.length >= ${prop.minLength}`,
      message: msg,
    });
  }

  if (prop.maxLength) {
    const msg = msgs.MAX_LENGTH?.[locale] || msgs.MAX_LENGTH?.en
      || `Must be at most ${prop.maxLength} characters`;
    rules.push({
      expression: `!${fieldName} || ${fieldName}.length <= ${prop.maxLength}`,
      message: msg,
    });
  }

  if (prop.pattern) {
    const msg = msgs.PATTERN?.[locale] || msgs.PATTERN?.en || 'Invalid format';
    // Escape for predicate evaluator
    rules.push({
      expression: `!${fieldName} || /${prop.pattern}/.test(${fieldName})`,
      message: msg,
    });
  }

  if (prop.minimum !== undefined) {
    const msg = msgs.MIN?.[locale] || msgs.MIN?.en || `Must be at least ${prop.minimum}`;
    rules.push({
      expression: `${fieldName} === undefined || ${fieldName} === '' || Number(${fieldName}) >= ${prop.minimum}`,
      message: msg,
    });
  }

  if (prop.maximum !== undefined) {
    const msg = msgs.MAX?.[locale] || msgs.MAX?.en || `Must be at most ${prop.maximum}`;
    rules.push({
      expression: `${fieldName} === undefined || ${fieldName} === '' || Number(${fieldName}) <= ${prop.maximum}`,
      message: msg,
    });
  }

  return rules.length > 0 ? rules : undefined;
}

/**
 * Convert STRUCTURAL visibility rule → existing display condition format.
 * { field, operator, value } → { expression, effect }
 */
function buildCondition(visRule) {
  const { condition, type } = visRule;
  if (!condition) return null;

  const expr = conditionToExpression(condition);
  // VISIBLE_IF → effect SHOW (show when condition is met)
  // DISABLED_IF → handled separately via field.disabled
  return {
    expression: expr,
    effect: type === 'visibility' ? 'SHOW' : 'HIDE',
  };
}

function conditionToExpression(cond) {
  const { field, operator, value } = cond;
  const quotedValue = typeof value === 'string' ? `'${value}'` : value;

  switch (operator) {
    case 'eq':
    case '===':
      return `${field} == ${quotedValue}`;
    case 'neq':
    case '!==':
      return `${field} != ${quotedValue}`;
    case 'gt':
    case '>':
      return `${field} > ${quotedValue}`;
    case 'lt':
    case '<':
      return `${field} < ${quotedValue}`;
    case 'gte':
    case '>=':
      return `${field} >= ${quotedValue}`;
    case 'lte':
    case '<=':
      return `${field} <= ${quotedValue}`;
    case 'in':
      return `[${value.map(v => `'${v}'`).join(',')}].includes(${field})`;
    case 'empty':
      return `!${field} || ${field} === ''`;
    case 'notEmpty':
      return `${field} && ${field} !== ''`;
    default:
      return `${field} == ${quotedValue}`;
  }
}

export default useStructuralForm;
