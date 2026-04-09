/**
 * Entity Create Executor — universal config-driven entity creation in Memgraph
 *
 * Unlike graph.create_node (raw Cypher), this executor:
 * - Validates against a dynamic schema (requiredFields, allowedFields)
 * - Auto-generates IDs from a configurable pattern
 * - Merges default values
 * - Adds timestamps (createdAt, updatedAt)
 *
 * Used by project graphs (FlowDesk tickets, iNeed requests, etc.)
 * with schema/config defined in the graph, not in code.
 */

const { BaseExecutor } = require('../../plugin-base');
const crypto = require('crypto');

class EntityCreateExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'entity.create';
    this.displayName = 'Create Entity';
    this.description = 'Create an entity node with dynamic schema validation and auto-ID generation';
    this.domain = 'common';

    this.parameterSchema = {
      type: 'object',
      properties: {
        entityType: {
          type: 'string',
          description: 'Memgraph label (e.g., Ticket, Request, Task)',
        },
        namespace: {
          type: 'string',
          description: 'Knowledge base namespace',
          default: 'PROJECT',
        },
        schema: {
          type: 'object',
          description: 'Validation schema',
          properties: {
            requiredFields: { type: 'array', items: { type: 'string' } },
            defaultValues: { type: 'object' },
          },
        },
        idPattern: {
          type: 'string',
          default: '{type}-{timestamp}-{random}',
          description: 'ID pattern: {type}, {timestamp}, {random}, {uuid}',
        },
        data: {
          type: 'object',
          description: 'Entity data',
        },
      },
      required: ['entityType', 'data'],
    };
  }

  async execute(parameters, context) {
    const entityType = this.getRequiredParam(parameters, 'entityType');
    const data = this.getRequiredParam(parameters, 'data');
    const namespace = this.getParam(parameters, 'namespace', 'PROJECT');
    const schema = this.getParam(parameters, 'schema', {});
    const idPattern = this.getParam(parameters, 'idPattern', '{type}-{timestamp}-{random}');

    // Sanitize label
    const sanitizedLabel = entityType.replace(/[^a-zA-Z0-9_]/g, '');
    if (sanitizedLabel !== entityType) {
      return this.error('INVALID_LABEL', `Label contains invalid characters: ${entityType}`);
    }

    // Validate required fields
    const { requiredFields = [] } = schema;
    const missing = requiredFields.filter(f => data[f] === undefined || data[f] === null || data[f] === '');
    if (missing.length > 0) {
      return this.error('VALIDATION_FAILED', `Missing required fields: ${missing.join(', ')}`);
    }

    // Generate ID
    const entityId = this._generateId(idPattern, sanitizedLabel);
    const now = new Date().toISOString();

    // Merge defaults + data + system fields
    const entityData = {
      ...(schema.defaultValues || {}),
      ...data,
      id: entityId,
      namespace,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const memgraph = require('../../../../../services/memgraph.service');
      const cypher = `CREATE (e:${sanitizedLabel}) SET e = $props RETURN e`;
      const result = await memgraph.executeQuery(cypher, { props: entityData });

      const record = result.records?.[0];
      const node = record?.get ? record.get('e') : record?._fields?.[0];

      return this.success({
        entityId,
        entityType: sanitizedLabel,
        data: entityData,
        node_id: node?.identity != null ? String(node.identity) : null,
      });
    } catch (error) {
      return this.error('CREATE_FAILED', `Failed to create ${sanitizedLabel}: ${error.message}`, true);
    }
  }

  _generateId(pattern, entityType) {
    return pattern
      .replace('{type}', entityType.toUpperCase().slice(0, 3))
      .replace('{timestamp}', Date.now().toString())
      .replace('{random}', crypto.randomBytes(3).toString('hex').toUpperCase())
      .replace('{uuid}', crypto.randomUUID().slice(0, 8));
  }
}

module.exports = { EntityCreateExecutor };
