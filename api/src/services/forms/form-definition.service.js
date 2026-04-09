/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FORM DEFINITION SERVICE
 * CRUD operations for FormDefinition in Knowledge Base (Memgraph).
 * Integrates with FormSchemaBuilder for JSON Schema generation.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { randomUUID } = require('node:crypto');
const { FormSchemaBuilder } = require('./form-schema-builder');

class FormDefinitionService {
  /**
   * @param {object} memgraphService
   * @param {object} [options]
   * @param {string} [options.namespace='CORE']
   */
  constructor(memgraphService, options = {}) {
    this.memgraph = memgraphService;
    this.schemaBuilder = new FormSchemaBuilder(memgraphService);
    this.namespace = options.namespace || 'CORE';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CREATE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new FormDefinition with sections, fields, validations, and conditions.
   * @param {object} data - Form definition data
   * @returns {Promise<object>} Created form
   */
  async create(data) {
    const validation = this.validateFormData(data);
    if (!validation.valid) {
      throw new Error(`Invalid form data: ${validation.errors.join(', ')}`);
    }

    const formId = data.id || randomUUID();
    const now = new Date().toISOString();

    // Create FormDefinition node
    await this.memgraph.executeQuery(`
      CREATE (f:FormDefinition {
        id: $id, name: $name, description: $description,
        version: $version, status: 'ACTIVE',
        namespace: $namespace,
        createdAt: $now, updatedAt: $now
      })
    `, {
      id: formId,
      name: data.name,
      description: data.description || '',
      version: data.version || '1.0.0',
      namespace: data.namespace || this.namespace,
      now,
    });

    // Create sections and fields
    for (let si = 0; si < (data.sections || []).length; si++) {
      const section = data.sections[si];
      const sectionId = section.id || randomUUID();

      await this.memgraph.executeQuery(`
        MATCH (f:FormDefinition {id: $formId})
        CREATE (s:FormSection {
          id: $sectionId, title: $title, order: $order,
          collapsible: $collapsible, namespace: $namespace
        })
        CREATE (f)-[:HAS_SECTION]->(s)
      `, {
        formId,
        sectionId,
        title: section.title || `Section ${si + 1}`,
        order: section.order ?? si,
        collapsible: section.collapsible ?? false,
        namespace: data.namespace || this.namespace,
      });

      for (let fi = 0; fi < (section.fields || []).length; fi++) {
        await this._createField(sectionId, section.fields[fi], fi);
      }
    }

    return this.getById(formId);
  }

  async _createField(sectionId, fieldData, defaultOrder) {
    const fieldId = fieldData.id || randomUUID();

    await this.memgraph.executeQuery(`
      MATCH (s:FormSection {id: $sectionId})
      CREATE (f:FormField {
        id: $fieldId, name: $name, type: $type, label: $label,
        required: $required, placeholder: $placeholder,
        defaultValue: $defaultValue, order: $order, namespace: $namespace
      })
      CREATE (s)-[:HAS_FIELD]->(f)
    `, {
      sectionId,
      fieldId,
      name: fieldData.name,
      type: fieldData.type || 'text',
      label: fieldData.label || fieldData.name,
      required: fieldData.required ?? false,
      placeholder: fieldData.placeholder || '',
      defaultValue: fieldData.defaultValue ?? null,
      order: fieldData.order ?? defaultOrder,
      namespace: this.namespace,
    });

    // Validations
    for (const rule of fieldData.validations || []) {
      const ruleId = rule.id || randomUUID();
      await this.memgraph.executeQuery(`
        MATCH (f:FormField {id: $fieldId})
        CREATE (v:ValidationRule {
          id: $ruleId, ruleType: $ruleType, expression: $expression,
          engine: $engine, message: $message, severity: $severity, namespace: $namespace
        })
        CREATE (f)-[:HAS_VALIDATION]->(v)
      `, {
        fieldId, ruleId,
        ruleType: rule.ruleType || 'EXPRESSION',
        expression: rule.expression || '',
        engine: rule.engine || 'PREDICATE',
        message: rule.message || 'Validation failed',
        severity: rule.severity || 'ERROR',
        namespace: this.namespace,
      });
    }

    // Display conditions
    for (const cond of fieldData.conditions || []) {
      const condId = cond.id || randomUUID();
      await this.memgraph.executeQuery(`
        MATCH (f:FormField {id: $fieldId})
        CREATE (dc:DisplayCondition {
          id: $condId, expression: $expression,
          engine: $engine, effect: $effect, namespace: $namespace
        })
        CREATE (f)-[:HAS_DISPLAY_CONDITION]->(dc)
      `, {
        fieldId, condId,
        expression: cond.expression,
        engine: cond.engine || 'PREDICATE',
        effect: cond.effect || 'SHOW',
        namespace: this.namespace,
      });
    }

    // Data source link
    if (fieldData.dataSourceId) {
      await this.memgraph.executeQuery(`
        MATCH (f:FormField {id: $fieldId})
        MATCH (ds:DataSourceDefinition {id: $dsId})
        CREATE (f)-[:USES_DATA_SOURCE]->(ds)
      `, { fieldId, dsId: fieldData.dataSourceId });
    }

    return fieldId;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // READ
  // ══════════════════════════════════════════════════════════════════════════

  async getById(formId) {
    return this.schemaBuilder.loadFormGraph(formId);
  }

  async buildSchema(formId) {
    return this.schemaBuilder.buildSchema(formId);
  }

  async list(options = {}) {
    const { namespace, status = 'ACTIVE', search, limit = 50, offset = 0 } = options;
    let cypher = `MATCH (f:FormDefinition) WHERE f.status = $status`;
    const params = { status, limit, offset };

    if (namespace) {
      cypher += ` AND f.namespace = $namespace`;
      params.namespace = namespace;
    }
    if (search) {
      cypher += ` AND (f.name CONTAINS $search OR f.description CONTAINS $search)`;
      params.search = search;
    }

    cypher += ` RETURN f ORDER BY f.updatedAt DESC SKIP $offset LIMIT $limit`;

    const result = await this.memgraph.executeQuery(cypher, params);
    return result.records.map(r => {
      const p = r.get('f').properties;
      return { id: p.id, name: p.name, description: p.description, version: p.version, status: p.status, namespace: p.namespace };
    });
  }

  async getForRender(formId, context = {}) {
    const form = await this.getById(formId);
    if (!form) throw new Error(`FormDefinition not found: ${formId}`);
    const schema = await this.buildSchema(formId);
    return { form, schema, context };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  async update(formId, updates) {
    const allowed = ['name', 'description', 'version', 'status'];
    const sets = Object.keys(updates)
      .filter(k => allowed.includes(k))
      .map(k => `f.${k} = $${k}`);

    if (sets.length === 0) return this.getById(formId);

    await this.memgraph.executeQuery(`
      MATCH (f:FormDefinition {id: $formId})
      SET ${sets.join(', ')}, f.updatedAt = datetime()
      RETURN f
    `, { formId, ...updates });

    return this.getById(formId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DELETE
  // ══════════════════════════════════════════════════════════════════════════

  async delete(formId) {
    await this.memgraph.executeQuery(`
      MATCH (f:FormDefinition {id: $formId})
      SET f.status = 'DELETED', f.deletedAt = datetime()
    `, { formId });
    return { deleted: true, formId };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FIELD OPS
  // ══════════════════════════════════════════════════════════════════════════

  async addField(sectionId, fieldData) {
    const result = await this.memgraph.executeQuery(`
      MATCH (s:FormSection {id: $sectionId})-[:HAS_FIELD]->(f:FormField)
      RETURN max(f.order) as maxOrder
    `, { sectionId });
    const maxOrder = result.records[0]?.get('maxOrder') ?? -1;
    const order = (typeof maxOrder === 'number' ? maxOrder : (maxOrder?.toNumber?.() ?? -1)) + 1;
    return this._createField(sectionId, { ...fieldData, order }, order);
  }

  async removeField(fieldId) {
    await this.memgraph.executeQuery(`
      MATCH (f:FormField {id: $fieldId})
      OPTIONAL MATCH (f)-[]->(child)
      DETACH DELETE child
      DETACH DELETE f
    `, { fieldId });
    return { deleted: true, fieldId };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CLONE
  // ══════════════════════════════════════════════════════════════════════════

  async clone(formId, newName) {
    const original = await this.getById(formId);
    if (!original) throw new Error(`FormDefinition not found: ${formId}`);
    return this.create({
      ...original,
      id: undefined,
      name: newName || `${original.name} (Copy)`,
      version: '1.0.0',
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VALIDATION
  // ══════════════════════════════════════════════════════════════════════════

  validateFormData(data) {
    const errors = [];
    if (!data.name || !data.name.trim()) errors.push('name is required');
    for (let si = 0; si < (data.sections || []).length; si++) {
      for (let fi = 0; fi < (data.sections[si].fields || []).length; fi++) {
        const f = data.sections[si].fields[fi];
        if (!f.name) errors.push(`sections[${si}].fields[${fi}].name is required`);
        if (!f.type) errors.push(`sections[${si}].fields[${fi}].type is required`);
      }
    }
    return { valid: errors.length === 0, errors };
  }
}

module.exports = { FormDefinitionService };
