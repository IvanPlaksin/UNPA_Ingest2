import { getFormSpecification } from '../../../services/api';

/**
 * Convert a waiting graph node config to FormRenderer-compatible FormDefinition.
 *
 * Handles:
 * - STRUCTURAL-based forms (async, via structuralGraphId) — NEW
 * - Choice nodes (confirm, select) → radio/select fields
 * - Text input nodes → text/textarea fields
 * - Search nodes → search text field
 * - Multi-field forms from node parameters
 */

/**
 * Check if a waiting node uses STRUCTURAL-based form.
 */
export function isStructuralNode(waitingNode) {
  const data = waitingNode?.data || waitingNode;
  return Boolean(data?.structuralGraphId);
}

/**
 * Async: load STRUCTURAL form spec and convert to FormDefinition.
 * Call this when isStructuralNode() returns true.
 */
export async function loadStructuralFormDefinition(waitingNode, options = {}) {
  const data = waitingNode?.data || waitingNode;
  const { locale = 'en' } = options;

  const spec = await getFormSpecification(data.structuralGraphId, {
    constraintGraphId: data.constraintGraphId,
    locale,
  });

  return structuralSpecToFormDefinition(spec, waitingNode, locale);
}

/**
 * Sync: convert legacy waiting node to FormDefinition (existing behavior).
 */
export function waitingNodeToFormDefinition(waitingNode, sessionState = {}) {
  if (!waitingNode) return null;

  const { nodeId, label, prompt, inputType, choices } = waitingNode;
  const fields = [];

  if (choices && choices.length > 0) {
    // Choice-based node → select or radio buttons
    const options = choices.map(c => {
      if (typeof c === 'string') return { value: c.toLowerCase(), label: c };
      return { value: c.value || c.label?.toLowerCase(), label: c.label || c.value };
    });

    fields.push({
      id: `${nodeId}_choice`,
      name: 'userInput',
      type: options.length <= 4 ? 'select' : 'select',
      label: prompt || label || 'Select an option',
      required: true,
      options,
      placeholder: 'Choose...',
      order: 0,
    });
  } else if (inputType === 'text' || inputType === 'search' || !inputType) {
    // Text input node
    fields.push({
      id: `${nodeId}_text`,
      name: 'userInput',
      type: inputType === 'search' ? 'text' : 'textarea',
      label: prompt || label || 'Your response',
      required: true,
      placeholder: prompt || 'Type here...',
      rows: 2,
      order: 0,
    });
  } else if (inputType === 'form') {
    // Multi-field form — extract from node's expected_inputs or config
    fields.push({
      id: `${nodeId}_form`,
      name: 'userInput',
      type: 'textarea',
      label: prompt || 'Provide details',
      required: true,
      placeholder: 'Enter details...',
      rows: 3,
      order: 0,
    });
  }

  // Add context summary if available
  const contextFields = [];
  if (sessionState.service_code) {
    contextFields.push({
      id: `${nodeId}_ctx_service`,
      name: '_ctx_service',
      type: 'text',
      label: 'Service',
      defaultValue: sessionState.service_code,
      readOnly: true,
      order: 100,
    });
  }
  if (sessionState.location?.name || sessionState.dutyStation) {
    contextFields.push({
      id: `${nodeId}_ctx_location`,
      name: '_ctx_location',
      type: 'text',
      label: 'Location',
      defaultValue: sessionState.location?.name || sessionState.dutyStation || '',
      readOnly: true,
      order: 101,
    });
  }

  return {
    id: `form_${nodeId}`,
    name: label || 'Input Required',
    description: prompt || null,
    status: 'ACTIVE',
    sections: [
      {
        id: `section_${nodeId}_main`,
        title: null, // no section header for single section
        order: 0,
        fields,
      },
      ...(contextFields.length > 0 ? [{
        id: `section_${nodeId}_context`,
        title: 'Request Context',
        order: 1,
        collapsible: true,
        fields: contextFields,
      }] : []),
    ],
  };
}

/**
 * Extract the user response value from form data
 */
export function extractFormResponse(formData) {
  if (!formData) return null;
  // Primary response field
  if (formData.userInput) return formData.userInput;
  // Fallback: first non-context field
  const keys = Object.keys(formData).filter(k => !k.startsWith('_ctx_'));
  return keys.length > 0 ? formData[keys[0]] : null;
}

// ════════════════════════════════════════════════════════════════════════════
// STRUCTURAL → FormDefinition conversion
// ════════════════════════════════════════════════════════════════════════════

function structuralSpecToFormDefinition(spec, waitingNode, locale) {
  const { jsonSchema, visibilityRules, errorMessages, uiHints, fieldOrder } = spec;
  const nodeId = waitingNode?.nodeId || waitingNode?.data?.id || 'structural';
  const required = new Set(jsonSchema.required || []);

  const fields = fieldOrder.map((fieldName, idx) => {
    const prop = jsonSchema.properties?.[fieldName];
    if (!prop) return null;

    const hints = uiHints?.[fieldName] || {};
    const vis = visibilityRules?.[fieldName];
    const msgs = errorMessages?.[fieldName] || {};

    const validations = [];

    if (prop.minLength) {
      const msg = msgs.MIN_LENGTH?.[locale] || msgs.MIN_LENGTH?.en
        || `Must be at least ${prop.minLength} characters`;
      validations.push({ expression: `${fieldName} && ${fieldName}.length >= ${prop.minLength}`, message: msg });
    }
    if (prop.maxLength) {
      const msg = msgs.MAX_LENGTH?.[locale] || msgs.MAX_LENGTH?.en
        || `Must be at most ${prop.maxLength} characters`;
      validations.push({ expression: `!${fieldName} || ${fieldName}.length <= ${prop.maxLength}`, message: msg });
    }
    if (prop.pattern) {
      const msg = msgs.PATTERN?.[locale] || msgs.PATTERN?.en || 'Invalid format';
      validations.push({ expression: `!${fieldName} || /${prop.pattern}/.test(${fieldName})`, message: msg });
    }
    if (prop.minimum !== undefined) {
      const msg = msgs.MIN?.[locale] || msgs.MIN?.en || `Must be at least ${prop.minimum}`;
      validations.push({ expression: `${fieldName} === undefined || ${fieldName} === '' || Number(${fieldName}) >= ${prop.minimum}`, message: msg });
    }
    if (prop.maximum !== undefined) {
      const msg = msgs.MAX?.[locale] || msgs.MAX?.en || `Must be at most ${prop.maximum}`;
      validations.push({ expression: `${fieldName} === undefined || ${fieldName} === '' || Number(${fieldName}) <= ${prop.maximum}`, message: msg });
    }

    // Visibility condition
    const conditions = vis ? [conditionToPredicate(vis)] : undefined;

    return {
      id: `${nodeId}_${fieldName}`,
      name: fieldName,
      type: mapType(prop, hints),
      label: prop.title || fieldName,
      description: prop.description,
      required: required.has(fieldName),
      defaultValue: prop.default,
      placeholder: hints.placeholder?.[locale] || hints.placeholder?.en,
      disabled: hints.readonly || false,
      readOnly: hints.readonly || false,
      order: idx,
      width: hints.width || 'full',
      options: prop.enum ? prop.enum.map(v => ({ value: v, label: v })) : undefined,
      rows: hints.rows,
      min: prop.minimum,
      max: prop.maximum,
      validations: validations.length > 0 ? validations : undefined,
      conditions,
    };
  }).filter(Boolean);

  return {
    id: `form_${nodeId}`,
    name: jsonSchema.title || 'Form',
    description: jsonSchema.description,
    status: 'ACTIVE',
    sections: [{
      id: `section_${nodeId}_main`,
      title: null,
      order: 0,
      fields,
    }],
    _structuralSpec: spec,
  };
}

function mapType(prop, hints) {
  if (hints?.widget === 'textarea') return 'textarea';
  if (prop.enum) return 'select';
  if (prop.format === 'email') return 'email';
  if (prop.format === 'date') return 'date';
  if (prop.format === 'date-time') return 'datetime';
  if (prop.format === 'uri') return 'url';
  if (prop.type === 'integer' || prop.type === 'number') return 'number';
  if (prop.type === 'boolean') return 'boolean';
  return 'text';
}

function conditionToPredicate(visRule) {
  const { condition, type } = visRule;
  if (!condition) return null;

  const { field, operator, value } = condition;
  const qv = typeof value === 'string' ? `'${value}'` : value;

  let expr;
  switch (operator) {
    case 'eq': case '===': expr = `${field} == ${qv}`; break;
    case 'neq': case '!==': expr = `${field} != ${qv}`; break;
    case 'gt': case '>': expr = `${field} > ${qv}`; break;
    case 'lt': case '<': expr = `${field} < ${qv}`; break;
    case 'empty': expr = `!${field} || ${field} === ''`; break;
    case 'notEmpty': expr = `${field} && ${field} !== ''`; break;
    default: expr = `${field} == ${qv}`;
  }

  return { expression: expr, effect: type === 'visibility' ? 'SHOW' : 'HIDE' };
}
