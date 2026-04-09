/**
 * schemaToFormDefinition — Converts JSON Schema to FormRenderer-compatible FormDefinition.
 *
 * Input:  JSON Schema { type: 'object', properties: {...}, required: [...] }
 * Output: FormDefinition { name, description, sections: [{ id, title, fields: [...] }] }
 *
 * Type mapping:
 *   string + enum            → select (with options)
 *   string (long/prompt)     → textarea
 *   string                   → text
 *   number / integer         → number
 *   boolean                  → boolean
 *   array                    → textarea (JSON)
 *   object (no properties)   → textarea (JSON)
 *   object (with properties) → separate section with nested fields
 */

const LONG_FIELD_HINTS = ['prompt', 'template', 'system', 'content', 'message', 'text', 'query', 'description'];

function isLongTextField(name, schema) {
  const nameLower = name.toLowerCase();
  if (LONG_FIELD_HINTS.some(h => nameLower.includes(h))) return true;
  if (schema.maxLength && schema.maxLength > 200) return true;
  return false;
}

function mapFieldType(name, schema) {
  const type = schema.type || 'string';

  // Enum → select
  if (schema.enum && Array.isArray(schema.enum)) {
    return {
      type: 'select',
      options: schema.enum.map(v => ({ value: String(v), label: String(v) })),
    };
  }

  switch (type) {
    case 'boolean':
      return { type: 'boolean' };

    case 'number':
    case 'integer':
      return {
        type: 'number',
        min: schema.minimum,
        max: schema.maximum,
        step: type === 'integer' ? 1 : (schema.step || 0.1),
      };

    case 'array':
      return { type: 'textarea', rows: 4, placeholder: '[]' };

    case 'object':
      // Objects without nested properties → JSON textarea
      if (!schema.properties) {
        return { type: 'textarea', rows: 4, placeholder: '{}' };
      }
      // Objects WITH nested properties are handled by flattenProperties()
      // and should not reach this point. Fallback just in case:
      return { type: 'textarea', rows: 4, placeholder: '{}' };

    case 'string':
    default:
      if (isLongTextField(name, schema)) {
        return { type: 'textarea', rows: 3 };
      }
      return { type: 'text' };
  }
}

/**
 * Flatten nested object properties into fields with dot-notation names.
 * Produces { fields: [...], sections: [...] } where nested objects
 * become separate sections.
 *
 * @param {object} properties - JSON Schema properties
 * @param {string[]} required - Required field names
 * @param {string} prefix - Dot-notation prefix for nested fields
 * @param {number} depth - Current nesting depth (max 3)
 * @returns {{ fields: object[], sections: object[] }}
 */
function flattenProperties(properties, required = [], prefix = '', depth = 0) {
  const fields = [];
  const sections = [];

  const fieldNames = Object.keys(properties);
  fieldNames.forEach((name, index) => {
    const propSchema = properties[name];
    const fullName = prefix ? `${prefix}.${name}` : name;
    const type = propSchema.type || 'string';

    // Nested object with its own properties → create a sub-section
    if (type === 'object' && propSchema.properties && depth < 3) {
      const nested = flattenProperties(
        propSchema.properties,
        propSchema.required || [],
        fullName,
        depth + 1
      );

      // Add nested fields as a separate section
      sections.push({
        id: `section-${fullName}`,
        title: propSchema.title || formatLabel(name),
        fields: nested.fields,
        collapsible: true,
        defaultExpanded: true,
      });

      // Also collect any deeper sections
      sections.push(...nested.sections);
      return;
    }

    // Leaf field
    const mapped = mapFieldType(name, propSchema);
    fields.push({
      id: `field-${fullName}`,
      name: fullName,
      label: propSchema.title || formatLabel(name),
      required: required.includes(name),
      defaultValue: propSchema.default,
      placeholder: propSchema.description || mapped.placeholder || '',
      description: propSchema.description || '',
      order: index,
      ...mapped,
    });
  });

  return { fields, sections };
}

/**
 * Convert a JSON Schema to a FormDefinition object for FormRenderer.
 *
 * @param {object} jsonSchema - JSON Schema with properties
 * @param {object} options - { name, description, sectionTitle }
 * @returns {object|null} FormDefinition compatible with FormRenderer
 */
export function schemaToFormDefinition(jsonSchema, options = {}) {
  if (!jsonSchema || !jsonSchema.properties) {
    return null;
  }

  const { fields, sections: nestedSections } = flattenProperties(
    jsonSchema.properties,
    jsonSchema.required || []
  );

  // No fields at all (including nested)
  if (fields.length === 0 && nestedSections.length === 0) return null;

  const allSections = [];

  // Top-level fields go into the main section
  if (fields.length > 0) {
    allSections.push({
      id: 'tool-params',
      title: options.sectionTitle || 'Parameters',
      fields,
      collapsible: false,
      defaultExpanded: true,
    });
  }

  // Nested object sections
  allSections.push(...nestedSections);

  return {
    name: options.name || 'Tool Parameters',
    description: options.description || '',
    sections: allSections,
  };
}

/**
 * Format a camelCase or snake_case field name into a human-readable label.
 */
function formatLabel(name) {
  // Strip dot prefix (nested names like "location.city" → "City")
  const baseName = name.includes('.') ? name.split('.').pop() : name;
  return baseName
    .replace(/([A-Z])/g, ' $1')      // camelCase → space separated
    .replace(/[_-]/g, ' ')            // snake_case → space separated
    .replace(/^\w/, c => c.toUpperCase()) // capitalize first letter
    .trim();
}

/**
 * Expand dot-notation keys into nested objects.
 * E.g. { "location.city": "NYC" } → { location: { city: "NYC" } }
 */
function expandDotNotation(flat) {
  const result = {};
  for (const [key, val] of Object.entries(flat)) {
    if (val === undefined || val === null || val === '') continue;
    const parts = key.split('.');
    let target = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]] || typeof target[parts[i]] !== 'object') {
        target[parts[i]] = {};
      }
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = val;
  }
  return result;
}

/**
 * Flatten nested objects into dot-notation keys.
 * E.g. { location: { city: "NYC" } } → { "location.city": "NYC" }
 */
function flattenDotNotation(obj, prefix = '') {
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(result, flattenDotNotation(val, fullKey));
    } else {
      result[fullKey] = val;
    }
  }
  return result;
}

/**
 * Serialize form values for storage — convert non-primitive values to proper types.
 * Handles:
 * - Dot-notation keys → nested objects
 * - Textarea JSON fields (arrays, objects without properties) → parsed JSON
 */
export function serializeFormValues(values, jsonSchema) {
  if (!jsonSchema?.properties) return values;

  // First handle JSON parsing for array/object textarea fields
  const parsed = {};
  for (const [key, val] of Object.entries(values)) {
    if (val === undefined || val === null || val === '') continue;

    // Find the schema for this key (may be dot-notation)
    const topKey = key.split('.')[0];
    const propSchema = jsonSchema.properties[topKey];

    if (propSchema) {
      const type = propSchema.type;
      if ((type === 'array' || (type === 'object' && !propSchema.properties)) && typeof val === 'string') {
        try { parsed[key] = JSON.parse(val); } catch { parsed[key] = val; }
        continue;
      }
    }
    parsed[key] = val;
  }

  // Expand dot-notation into nested objects
  return expandDotNotation(parsed);
}

/**
 * Prepare initial data for FormRenderer — flatten nested objects to dot-notation.
 */
export function prepareInitialData(parameters, jsonSchema) {
  if (!parameters || typeof parameters !== 'object') return {};
  return flattenDotNotation(parameters);
}
