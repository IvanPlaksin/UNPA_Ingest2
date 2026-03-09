/**
 * Cross-Domain Link Executor
 *
 * Creates CROSS_DOMAIN edges between nodes in different domains.
 * E.g. BEHAVIORAL -[OPERATES_ON]-> STRUCTURAL
 */

const { BaseExecutor } = require('../../plugin-base');

class CrossDomainLinkExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'sql.cross_domain_link';
    this.displayName = 'Cross-Domain Link';
    this.description = 'Create cross-domain edge between domain entities';
    this.domain = 'sql-extraction';

    this.parameterSchema = {
      type: 'object',
      properties: {
        sourceId: { type: 'string', description: 'Source node ID' },
        targetId: { type: 'string', description: 'Target node ID' },
        edgeType: {
          type: 'string',
          enum: ['OPERATES_ON', 'CALLS', 'ENFORCES', 'GOVERNS', 'TRIGGERS'],
          description: 'Cross-domain edge type',
        },
        sourceDomain: { type: 'string' },
        targetDomain: { type: 'string' },
        sourceLabel: { type: 'string', default: 'DomainGraph', description: 'Cypher label for source' },
        targetLabel: { type: 'string', default: 'StructuralEntity', description: 'Cypher label for target' },
      },
      required: ['sourceId', 'targetId', 'edgeType', 'sourceDomain', 'targetDomain'],
    };
  }

  async execute(parameters, context) {
    const sourceId = this.getRequiredParam(parameters, 'sourceId');
    const targetId = this.getRequiredParam(parameters, 'targetId');
    const edgeType = this.getRequiredParam(parameters, 'edgeType');
    const sourceDomain = this.getRequiredParam(parameters, 'sourceDomain');
    const targetDomain = this.getRequiredParam(parameters, 'targetDomain');
    const sourceLabel = this.getParam(parameters, 'sourceLabel', 'DomainGraph');
    const targetLabel = this.getParam(parameters, 'targetLabel', 'StructuralEntity');

    try {
      const memgraph = require('../../../../../services/memgraph.service');
      const { v4: uuidv4 } = require('uuid');

      const edgeId = uuidv4();

      // Check if edge already exists
      const existing = await memgraph.runQuery(
        `MATCH (s {id: $sourceId})-[e:CROSS_DOMAIN {edgeType: $edgeType}]->(t {id: $targetId})
         RETURN e.id as id LIMIT 1`,
        { sourceId, targetId, edgeType }
      );

      if (existing.length > 0) {
        return this.success(
          { edgeId: existing[0].id, created: false, alreadyExists: true },
          { edgeType, sourceDomain, targetDomain },
          1.0,
        );
      }

      await memgraph.runQuery(
        `MATCH (s:${sourceLabel} {id: $sourceId})
         MATCH (t:${targetLabel} {id: $targetId})
         CREATE (s)-[:CROSS_DOMAIN {
           id: $edgeId,
           edgeType: $edgeType,
           sourceDomain: $sourceDomain,
           targetDomain: $targetDomain,
           createdAt: $now
         }]->(t)`,
        {
          sourceId,
          targetId,
          edgeId,
          edgeType,
          sourceDomain,
          targetDomain,
          now: new Date().toISOString(),
        }
      );

      return this.success(
        { edgeId, created: true, alreadyExists: false },
        { edgeType, sourceDomain, targetDomain },
        1.0,
      );
    } catch (error) {
      return this.error('CROSS_DOMAIN_ERROR', `Cross-domain link failed: ${error.message}`, true);
    }
  }
}

module.exports = { CrossDomainLinkExecutor };
