/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FORM SCHEMA BUILDER
 * Builds JSON Schema from FormDefinition graph structure in KB.
 *
 * Graph structure:
 *   FormDefinition -[:HAS_SECTION]-> FormSection -[:HAS_FIELD]-> FormField
 *   FormField -[:HAS_VALIDATION]-> ValidationRule
 *   FormField -[:HAS_DISPLAY_CONDITION]-> DisplayCondition
 *   FormField -[:USES_DATA_SOURCE]-> DataSourceDefinition
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ────────────────────────────────────────────────────────────────────────────
// FIELD TYPE → JSON SCHEMA MAPPING
// ────────────────────────────────────────────────────────────────────────────

const FIELD_TYPE_MAP = {
  text:         { type: 'string' },
  textarea:     { type: 'string' },
  number:       { type: 'number' },
  boolean:      { type: 'boolean' },
  date:         { type: 'string', format: 'date' },
  datetime:     { type: 'string', format: 'date-time' },
  email:        { type: 'string', format: 'email' },
  url:          { type: 'string', format: 'uri' },
  select:       { type: 'string' },
  multiselect:  { type: 'array', items: { type: 'string' } },
  file:         { type: 'string', contentEncoding: 'base64' },
  autocomplete: { type: 'string' },
  table:        { type: 'array', items: { type: 'object' } },
  hidden:       { type: 'string' },
};

// ────────────────────────────────────────────────────────────────────────────
// FORM SCHEMA BUILDER
// ────────────────────────────────────────────────────────────────────────────

class FormSchemaBuilder {
  /**
   * @param {object} memgraphService
   */
  constructor(memgraphService) {
    this.memgraph = memgraphService;
  }

  /**
   * Build complete JSON Schema from FormDefinition graph.
   * @param {string} formId
   * @returns {Promise<object>} JSON Schema
   */
  async buildSchema(formId) {
    const form = await this.loadFormGraph(formId);
    if (!form) throw new Error(`FormDefinition not found: ${formId}`);

    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: `form:${formId}`,
      type: 'object',
      title: form.name,
      description: form.description || '',
      properties: {},
      required: [],
    };

    for (const section of form.sections || []) {
      for (const field of section.fields || []) {
        schema.properties[field.name] = this.fieldToSchema(field);
        if (field.required) {
          schema.required.push(field.name);
        }
      }
    }

    schema.$metadata = {
      formId,
      version: form.version,
      sections: (form.sections || []).map(s => ({
        id: s.id,
        title: s.title,
        order: s.order,
        fields: (s.fields || []).map(f => f.name),
      })),
    };

    return schema;
  }

  /**
   * Load complete form graph with sections, fields, validations.
   * @param {string} formId
   * @returns {Promise<object|null>}
   */
  async loadFormGraph(formId) {
    const result = await this.memgraph.executeQuery(`
      MATCH (f:FormDefinition {id: $formId})
      WHERE f.status <> 'DELETED'
      OPTIONAL MATCH (f)-[:HAS_SECTION]->(s:FormSection)
      OPTIONAL MATCH (s)-[:HAS_FIELD]->(field:FormField)
      OPTIONAL MATCH (field)-[:HAS_VALIDATION]->(v:ValidationRule)
      OPTIONAL MATCH (field)-[:HAS_DISPLAY_CONDITION]->(dc:DisplayCondition)
      OPTIONAL MATCH (field)-[:USES_DATA_SOURCE]->(ds:DataSourceDefinition)
      RETURN f, s, field, v, dc, ds
      ORDER BY s.order, field.order
    `, { formId });

    if (!result.records || result.records.length === 0) return null;

    return this._assembleFormGraph(result.records);
  }

  /**
   * Convert FormField to JSON Schema property definition.
   */
  fieldToSchema(field) {
    const base = { ...(FIELD_TYPE_MAP[field.type] || { type: 'string' }) };

    base.title = field.label;
    if (field.placeholder) base.description = field.placeholder;
    if (field.defaultValue !== undefined && field.defaultValue !== null) {
      base.default = field.defaultValue;
    }

    // Apply validation rules
    for (const rule of field.validations || []) {
      this._applyValidationRule(base, rule);
    }

    // Form renderer metadata
    base.$formField = {
      fieldId: field.id,
      fieldType: field.type,
      order: field.order,
      conditions: (field.conditions || []).map(c => ({
        expression: c.expression,
        engine: c.engine,
        effect: c.effect,
      })),
      dataSourceId: field.dataSourceId || null,
    };

    return base;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL
  // ══════════════════════════════════════════════════════════════════════════

  _applyValidationRule(schema, rule) {
    switch (rule.ruleType) {
      case 'REGEX':
        if (schema.type === 'string' && rule.expression) {
          schema.pattern = rule.expression;
        }
        break;

      case 'RANGE': {
        const range = this._parseRange(rule.expression);
        if (range.min !== null) schema.minimum = range.min;
        if (range.max !== null) schema.maximum = range.max;
        break;
      }

      case 'LENGTH': {
        const len = this._parseRange(rule.expression);
        if (len.min !== null) schema.minLength = len.min;
        if (len.max !== null) schema.maxLength = len.max;
        break;
      }

      case 'ENUM':
        if (rule.expression) {
          try {
            schema.enum = JSON.parse(rule.expression);
          } catch {
            schema.enum = rule.expression.split(',').map(s => s.trim());
          }
        }
        break;

      case 'EXPRESSION':
        if (!schema.$validations) schema.$validations = [];
        schema.$validations.push({
          type: 'EXPRESSION',
          expression: rule.expression,
          engine: rule.engine || 'PREDICATE',
          message: rule.message,
        });
        break;

      default:
        break;
    }
  }

  _parseRange(expression) {
    const result = { min: null, max: null };
    if (!expression) return result;

    const rangeMatch = expression.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
    if (rangeMatch) {
      result.min = parseFloat(rangeMatch[1]);
      result.max = parseFloat(rangeMatch[2]);
      return result;
    }

    const gteMatch = expression.match(/^>=?\s*(\d+(?:\.\d+)?)$/);
    if (gteMatch) result.min = parseFloat(gteMatch[1]);

    const lteMatch = expression.match(/^<=?\s*(\d+(?:\.\d+)?)$/);
    if (lteMatch) result.max = parseFloat(lteMatch[1]);

    return result;
  }

  _assembleFormGraph(records) {
    let formData = null;
    const sectionsMap = new Map();
    const fieldsMap = new Map();

    for (const record of records) {
      const f = record.get('f');
      const s = record.get('s');
      const field = record.get('field');
      const v = record.get('v');
      const dc = record.get('dc');
      const ds = record.get('ds');

      // Form
      if (!formData && f) {
        const fp = f.properties;
        formData = {
          id: fp.id,
          name: fp.name,
          description: fp.description,
          version: fp.version,
          status: fp.status,
          namespace: fp.namespace,
        };
      }

      // Section
      if (s) {
        const sp = s.properties;
        if (!sectionsMap.has(sp.id)) {
          sectionsMap.set(sp.id, {
            id: sp.id,
            title: sp.title,
            order: typeof sp.order === 'number' ? sp.order : (sp.order?.toNumber?.() ?? 0),
            collapsible: sp.collapsible,
            fields: [],
          });
        }
      }

      // Field
      if (field && s) {
        const flp = field.properties;
        const fieldId = flp.id;
        if (!fieldsMap.has(fieldId)) {
          const fieldObj = {
            id: fieldId,
            name: flp.name,
            type: flp.type,
            label: flp.label,
            required: flp.required,
            placeholder: flp.placeholder,
            defaultValue: flp.defaultValue,
            order: typeof flp.order === 'number' ? flp.order : (flp.order?.toNumber?.() ?? 0),
            validations: [],
            conditions: [],
            dataSourceId: null,
            _sectionId: s.properties.id,
          };
          fieldsMap.set(fieldId, fieldObj);
        }

        const fieldObj = fieldsMap.get(fieldId);

        // Validation
        if (v) {
          const vp = v.properties;
          const exists = fieldObj.validations.some(x => x.id === vp.id);
          if (!exists) {
            fieldObj.validations.push({
              id: vp.id,
              ruleType: vp.ruleType,
              expression: vp.expression,
              engine: vp.engine,
              message: vp.message,
              severity: vp.severity,
            });
          }
        }

        // Display condition
        if (dc) {
          const dcp = dc.properties;
          const exists = fieldObj.conditions.some(x => x.id === dcp.id);
          if (!exists) {
            fieldObj.conditions.push({
              id: dcp.id,
              expression: dcp.expression,
              engine: dcp.engine,
              effect: dcp.effect,
            });
          }
        }

        // Data source
        if (ds) {
          fieldObj.dataSourceId = ds.properties.id;
        }
      }
    }

    if (!formData) return null;

    // Assemble sections with fields
    for (const field of fieldsMap.values()) {
      const section = sectionsMap.get(field._sectionId);
      if (section) {
        section.fields.push(field);
      }
    }

    // Sort
    for (const section of sectionsMap.values()) {
      section.fields.sort((a, b) => a.order - b.order);
    }

    formData.sections = [...sectionsMap.values()].sort((a, b) => a.order - b.order);
    return formData;
  }
}

module.exports = { FormSchemaBuilder, FIELD_TYPE_MAP };
