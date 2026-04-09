/**
 * Entity Update Executor — universal config-driven entity update in Memgraph
 *
 * Features:
 * - Immutable fields protection (id, createdAt, namespace by default)
 * - Auto updatedAt timestamp
 * - Returns updated fields list
 */

const { BaseExecutor } = require('../../plugin-base');

class EntityUpdateExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'entity.update';
    this.displayName = 'Update Entity';
    this.description = 'Update an entity node with immutable field protection';
    this.domain = 'common';

    this.parameterSchema = {
      type: 'object',
      properties: {
        entityType: { type: 'string', description: 'Memgraph label' },
        entityId: { type: 'string', description: 'Entity ID to update' },
        updates: { type: 'object', description: 'Fields to update' },
        schema: {
          type: 'object',
          properties: {
            immutableFields: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      required: ['entityType', 'entityId', 'updates'],
    };
  }

  async execute(parameters, context) {
    const entityType = this.getRequiredParam(parameters, 'entityType');
    const entityId = this.getRequiredParam(parameters, 'entityId');
    const updates = this.getRequiredParam(parameters, 'updates');
    const schema = this.getParam(parameters, 'schema', {});

    const sanitizedLabel = entityType.replace(/[^a-zA-Z0-9_]/g, '');

    // Filter immutable fields
    const immutableFields = schema.immutableFields || ['id', 'createdAt', 'namespace'];
    const safeUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      if (!immutableFields.includes(key)) {
        safeUpdates[key] = value;
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return this.error('NO_UPDATES', 'No valid fields to update (all filtered as immutable)');
    }

    safeUpdates.updatedAt = new Date().toISOString();

    try {
      const memgraph = require('../../../../../services/memgraph.service');

      // Build SET clause with safe parameter names
      const setEntries = Object.keys(safeUpdates);
      const setClause = setEntries.map(k => `e.${k} = $upd_${k}`).join(', ');
      const queryParams = { entityId };
      for (const k of setEntries) {
        queryParams[`upd_${k}`] = safeUpdates[k];
      }

      const cypher = `
        MATCH (e:${sanitizedLabel} {id: $entityId})
        SET ${setClause}
        RETURN e
      `;

      const result = await memgraph.executeQuery(cypher, queryParams);

      if (!result.records || result.records.length === 0) {
        return this.error('NOT_FOUND', `Entity not found: ${sanitizedLabel}/${entityId}`);
      }

      return this.success({
        entityId,
        entityType: sanitizedLabel,
        updated: Object.keys(safeUpdates).filter(k => k !== 'updatedAt'),
      });
    } catch (error) {
      return this.error('UPDATE_FAILED', `Failed to update ${sanitizedLabel}/${entityId}: ${error.message}`, true);
    }
  }
}

module.exports = { EntityUpdateExecutor };
