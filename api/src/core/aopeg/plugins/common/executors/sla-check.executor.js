/**
 * SLA Check Executor — check entity against SLA deadlines
 *
 * Compares current time (or entity timestamps) against SLA deadlines.
 * Returns status per SLA metric: 'met', 'pending', or 'breached'.
 * Can check a single entity or batch-check by entityType + filters.
 */

const { BaseExecutor } = require('../../plugin-base');

class SLACheckExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'sla.check';
    this.displayName = 'Check SLA Status';
    this.description = 'Check an entity against SLA deadlines and return breach status';
    this.domain = 'common';

    this.parameterSchema = {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['single', 'batch'],
          default: 'single',
        },
        entityType: { type: 'string', description: 'Memgraph label' },
        entityId: { type: 'string', description: 'Entity ID (for single mode)' },
        batchFilters: {
          type: 'object',
          description: 'Filters for batch mode (e.g., {status: "open"})',
        },
        deadlines: {
          type: 'object',
          description: 'Deadline ISO strings: { response, resolution }',
          properties: {
            response: { type: 'string' },
            resolution: { type: 'string' },
          },
        },
        slaConfig: {
          type: 'object',
          description: 'SLA config for batch mode (used with priorityField to look up deadlines)',
        },
        priorityField: {
          type: 'string',
          default: 'priority',
          description: 'Field name that maps to slaConfig key',
        },
        checkFields: {
          type: 'object',
          description: 'Custom field names for checking: { respondedAt, resolvedAt, createdAt }',
        },
      },
      required: ['entityType'],
    };
  }

  async execute(parameters, context) {
    const mode = this.getParam(parameters, 'mode', 'single');

    if (mode === 'batch') {
      return this._batchCheck(parameters);
    }
    return this._singleCheck(parameters);
  }

  async _singleCheck(parameters) {
    const entityType = this.getRequiredParam(parameters, 'entityType');
    const entityId = this.getRequiredParam(parameters, 'entityId');
    const deadlines = this.getParam(parameters, 'deadlines', {});
    const checkFields = this.getParam(parameters, 'checkFields', {});

    const sanitizedLabel = entityType.replace(/[^a-zA-Z0-9_]/g, '');

    try {
      const memgraph = require('../../../../../services/memgraph.service');

      const result = await memgraph.executeQuery(
        `MATCH (e:${sanitizedLabel} {id: $entityId}) RETURN e`,
        { entityId },
      );

      if (!result.records || result.records.length === 0) {
        return this.error('NOT_FOUND', `Entity not found: ${sanitizedLabel}/${entityId}`);
      }

      const record = result.records[0];
      const node = record.get ? record.get('e') : record._fields?.[0];
      const entity = node?.properties || node;

      const status = this._checkEntity(entity, deadlines, checkFields);

      return this.success({
        entityId,
        entityType: sanitizedLabel,
        ...status,
        branch: status.breached ? 'sla_breached' : 'sla_ok',
      });
    } catch (error) {
      if (error.message?.includes('Missing required')) throw error;
      return this.error('CHECK_FAILED', `SLA check failed: ${error.message}`, true);
    }
  }

  async _batchCheck(parameters) {
    const entityType = this.getRequiredParam(parameters, 'entityType');
    const batchFilters = this.getParam(parameters, 'batchFilters', {});
    const slaConfig = this.getParam(parameters, 'slaConfig', {});
    const priorityField = this.getParam(parameters, 'priorityField', 'priority');
    const checkFields = this.getParam(parameters, 'checkFields', {});

    const sanitizedLabel = entityType.replace(/[^a-zA-Z0-9_]/g, '');

    try {
      const memgraph = require('../../../../../services/memgraph.service');

      // Build WHERE clause
      const whereClauses = [];
      const queryParams = {};
      Object.entries(batchFilters).forEach(([key, value], idx) => {
        const pName = `bf_${idx}`;
        whereClauses.push(`e.${key} = $${pName}`);
        queryParams[pName] = value;
      });

      const whereStr = whereClauses.length > 0
        ? `WHERE ${whereClauses.join(' AND ')}`
        : '';

      const result = await memgraph.executeQuery(
        `MATCH (e:${sanitizedLabel}) ${whereStr} RETURN e LIMIT 500`,
        queryParams,
      );

      const entities = (result.records || []).map(r => {
        const node = r.get ? r.get('e') : r._fields?.[0];
        return node?.properties || node;
      });

      const results = [];
      let breachedCount = 0;

      for (const entity of entities) {
        const priority = entity[priorityField];
        const sla = slaConfig[priority];

        let deadlines = {};
        if (sla && entity.createdAt) {
          const created = new Date(entity.createdAt);
          if (sla.responseHours) {
            deadlines.response = new Date(created.getTime() + sla.responseHours * 3600000).toISOString();
          }
          if (sla.resolutionHours) {
            deadlines.resolution = new Date(created.getTime() + sla.resolutionHours * 3600000).toISOString();
          }
        }

        const status = this._checkEntity(entity, deadlines, checkFields);
        if (status.breached) breachedCount++;

        results.push({
          entityId: entity.id,
          [priorityField]: priority,
          ...status,
        });
      }

      return this.success({
        entityType: sanitizedLabel,
        checked: results.length,
        breached: breachedCount,
        results,
        branch: breachedCount > 0 ? 'has_breaches' : 'all_ok',
      });
    } catch (error) {
      return this.error('BATCH_CHECK_FAILED', `Batch SLA check failed: ${error.message}`, true);
    }
  }

  _checkEntity(entity, deadlines, checkFields = {}) {
    const now = new Date();
    const respondedAtField = checkFields.respondedAt || 'respondedAt';
    const resolvedAtField = checkFields.resolvedAt || 'resolvedAt';

    let responseStatus = null;
    let resolutionStatus = null;

    if (deadlines.response) {
      const deadline = new Date(deadlines.response);
      const respondedAt = entity[respondedAtField] ? new Date(entity[respondedAtField]) : null;
      if (respondedAt) {
        responseStatus = respondedAt <= deadline ? 'met' : 'breached';
      } else {
        responseStatus = now <= deadline ? 'pending' : 'breached';
      }
    }

    if (deadlines.resolution) {
      const deadline = new Date(deadlines.resolution);
      const resolvedAt = entity[resolvedAtField] ? new Date(entity[resolvedAtField]) : null;
      if (resolvedAt) {
        resolutionStatus = resolvedAt <= deadline ? 'met' : 'breached';
      } else {
        resolutionStatus = now <= deadline ? 'pending' : 'breached';
      }
    }

    const breached = responseStatus === 'breached' || resolutionStatus === 'breached';

    // Calculate remaining hours
    const responseRemaining = deadlines.response
      ? Math.max(0, (new Date(deadlines.response) - now) / 3600000)
      : null;
    const resolutionRemaining = deadlines.resolution
      ? Math.max(0, (new Date(deadlines.resolution) - now) / 3600000)
      : null;

    return {
      slaStatus: { response: responseStatus, resolution: resolutionStatus, breached },
      remaining: {
        responseHours: responseRemaining != null ? Math.round(responseRemaining * 10) / 10 : null,
        resolutionHours: resolutionRemaining != null ? Math.round(resolutionRemaining * 10) / 10 : null,
      },
      checkedAt: now.toISOString(),
    };
  }
}

module.exports = { SLACheckExecutor };
