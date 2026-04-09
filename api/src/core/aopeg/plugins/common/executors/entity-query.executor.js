/**
 * Entity Query Executor — universal config-driven entity query from Memgraph
 *
 * Unlike graph.query (raw Cypher), this executor:
 * - Builds Cypher from structured filters and conditions
 * - Supports pagination (limit, offset)
 * - Returns total count alongside results
 * - Supports operators: eq, ne, gt, gte, lt, lte, contains, startsWith, in
 */

const { BaseExecutor } = require('../../plugin-base');

class EntityQueryExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'entity.query';
    this.displayName = 'Query Entities';
    this.description = 'Query entities with structured filters, conditions, and pagination';
    this.domain = 'common';

    this.parameterSchema = {
      type: 'object',
      properties: {
        entityType: { type: 'string', description: 'Memgraph label' },
        filters: { type: 'object', description: 'Key-value equality filters' },
        conditions: {
          type: 'array',
          description: 'Advanced conditions: [{field, operator, value}]',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              operator: { type: 'string', enum: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'in'] },
              value: {},
            },
          },
        },
        orderBy: { type: 'string', default: 'createdAt' },
        orderDir: { type: 'string', enum: ['ASC', 'DESC'], default: 'DESC' },
        limit: { type: 'number', default: 50 },
        offset: { type: 'number', default: 0 },
      },
      required: ['entityType'],
    };
  }

  async execute(parameters, context) {
    const entityType = this.getRequiredParam(parameters, 'entityType');
    const filters = this.getParam(parameters, 'filters', {});
    const conditions = this.getParam(parameters, 'conditions', []);
    const orderBy = this.getParam(parameters, 'orderBy', 'createdAt');
    const orderDir = this.getParam(parameters, 'orderDir', 'DESC');
    const limit = this.getParam(parameters, 'limit', 50);
    const offset = this.getParam(parameters, 'offset', 0);

    const sanitizedLabel = entityType.replace(/[^a-zA-Z0-9_]/g, '');

    try {
      const memgraph = require('../../../../../services/memgraph.service');

      // Build WHERE clause
      const whereClauses = [];
      const queryParams = { qLimit: limit, qOffset: offset };

      // Simple filters (equality)
      Object.entries(filters).forEach(([key, value], idx) => {
        const paramName = `f_${idx}`;
        whereClauses.push(`e.${key} = $${paramName}`);
        queryParams[paramName] = value;
      });

      // Advanced conditions
      conditions.forEach((cond, idx) => {
        const paramName = `c_${idx}`;
        const clause = this._buildCondition(cond.field, cond.operator, paramName);
        if (clause) {
          whereClauses.push(clause);
          queryParams[paramName] = cond.value;
        }
      });

      const whereStr = whereClauses.length > 0
        ? `WHERE ${whereClauses.join(' AND ')}`
        : '';

      // Sanitize orderBy
      const safeOrderBy = orderBy.replace(/[^a-zA-Z0-9_]/g, '');
      const safeOrderDir = orderDir === 'ASC' ? 'ASC' : 'DESC';

      const cypher = `
        MATCH (e:${sanitizedLabel})
        ${whereStr}
        RETURN e
        ORDER BY e.${safeOrderBy} ${safeOrderDir}
        SKIP $qOffset
        LIMIT $qLimit
      `;

      const result = await memgraph.executeQuery(cypher, queryParams);
      const items = (result.records || []).map(r => {
        const node = r.get ? r.get('e') : r._fields?.[0];
        return node?.properties || node;
      });

      // Count total
      const countCypher = `
        MATCH (e:${sanitizedLabel})
        ${whereStr}
        RETURN count(e) as total
      `;
      const countResult = await memgraph.executeQuery(countCypher, queryParams);
      const totalRecord = countResult.records?.[0];
      const total = totalRecord?.get ? totalRecord.get('total') : totalRecord?._fields?.[0];

      return this.success({
        entityType: sanitizedLabel,
        items,
        count: items.length,
        total: typeof total === 'object' ? total.toNumber?.() ?? total : total ?? 0,
        pagination: { limit, offset },
      });
    } catch (error) {
      return this.error('QUERY_FAILED', `Failed to query ${sanitizedLabel}: ${error.message}`, true);
    }
  }

  _buildCondition(field, operator, paramName) {
    const safeField = field.replace(/[^a-zA-Z0-9_.]/g, '');
    switch (operator) {
      case 'eq': return `e.${safeField} = $${paramName}`;
      case 'ne': return `e.${safeField} <> $${paramName}`;
      case 'gt': return `e.${safeField} > $${paramName}`;
      case 'gte': return `e.${safeField} >= $${paramName}`;
      case 'lt': return `e.${safeField} < $${paramName}`;
      case 'lte': return `e.${safeField} <= $${paramName}`;
      case 'contains': return `e.${safeField} CONTAINS $${paramName}`;
      case 'startsWith': return `e.${safeField} STARTS WITH $${paramName}`;
      case 'in': return `e.${safeField} IN $${paramName}`;
      default: return null;
    }
  }
}

module.exports = { EntityQueryExecutor };
