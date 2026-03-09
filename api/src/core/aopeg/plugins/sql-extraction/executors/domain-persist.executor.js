/**
 * Domain Persist Executor
 *
 * Persists nodes/edges to a specific domain (D1-D4) in Memgraph.
 * Delegates to the appropriate domain service.
 */

const { BaseExecutor } = require('../../plugin-base');

class DomainPersistExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'sql.domain_persist';
    this.displayName = 'Domain Persist';
    this.description = 'Persist entities to domain graph (D1-D4) in Memgraph';
    this.domain = 'sql-extraction';

    this.parameterSchema = {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          enum: ['STRUCTURAL', 'BEHAVIORAL', 'SEMANTIC', 'TEMPORAL'],
          description: 'Target domain',
        },
        action: {
          type: 'string',
          enum: [
            'createEntity', 'createEntitiesFromMap', 'createForeignKeys',
            'createBehavioralGraph', 'createSemanticRules', 'createSemanticCalculations',
            'createStateMachine',
          ],
          description: 'Persistence action',
        },
        data: { type: 'object', description: 'Data payload for the action' },
        sessionId: { type: 'string', description: 'Extraction session ID' },
        sourceDatabase: { type: 'string' },
      },
      required: ['domain', 'action', 'data'],
    };
  }

  async execute(parameters, context) {
    const domain = this.getRequiredParam(parameters, 'domain');
    const action = this.getRequiredParam(parameters, 'action');
    const data = this.getRequiredParam(parameters, 'data');
    const sessionId = this.getParam(parameters, 'sessionId', null);
    const sourceDatabase = this.getParam(parameters, 'sourceDatabase', null);
    const ctx = { sessionId, sourceDatabase };

    try {
      const memgraph = require('../../../../../services/memgraph.service');
      let result;

      switch (domain) {
        case 'STRUCTURAL':
          result = await this._persistStructural(action, data, ctx, memgraph);
          break;
        case 'BEHAVIORAL':
          result = await this._persistBehavioral(action, data, ctx, memgraph);
          break;
        case 'SEMANTIC':
          result = await this._persistSemantic(action, data, ctx, memgraph);
          break;
        case 'TEMPORAL':
          result = await this._persistTemporal(action, data, ctx, memgraph);
          break;
        default:
          return this.error('DOMAIN_UNKNOWN', `Unknown domain: ${domain}`, false);
      }

      return this.success(
        result,
        { domain, action, sessionId },
        1.0,
      );
    } catch (error) {
      return this.error('DOMAIN_PERSIST_ERROR', `${domain}.${action} failed: ${error.message}`, true);
    }
  }

  async _persistStructural(action, data, ctx, memgraph) {
    const { StructuralDomainService } = require('../../../../../services/structural');
    const svc = new StructuralDomainService({ memgraphService: memgraph });

    switch (action) {
      case 'createEntity':
        return await svc.createEntity(data, ctx);
      case 'createEntitiesFromMap':
        return await svc.createEntitiesFromDatabaseMap(data, ctx);
      case 'createForeignKeys':
        return await svc.createForeignKeys(data.edges || data, ctx);
      default:
        throw new Error(`Unknown structural action: ${action}`);
    }
  }

  async _persistBehavioral(action, data, ctx, memgraph) {
    const { GxeIntegrationService } = require(
      '../../../../../services/connectors/sql-to-gxe/gxe-integration.service'
    );
    const svc = new GxeIntegrationService({ memgraphService: memgraph });

    switch (action) {
      case 'createBehavioralGraph':
        return await svc.processProcedure(data.procedure, ctx);
      default:
        throw new Error(`Unknown behavioral action: ${action}`);
    }
  }

  async _persistSemantic(action, data, ctx, memgraph) {
    const { SemanticDomainService } = require('../../../../../services/connectors/semantic-domain.service');
    const svc = new SemanticDomainService({ memgraphService: memgraph });

    switch (action) {
      case 'createSemanticRules':
        return await svc.createRules(data.rules || data, ctx);
      case 'createSemanticCalculations':
        return await svc.createCalculations(data.calculations || data, ctx);
      default:
        throw new Error(`Unknown semantic action: ${action}`);
    }
  }

  async _persistTemporal(action, data, ctx, memgraph) {
    const { TemporalDomainService } = require('../../../../../services/connectors/temporal-domain.service');
    const svc = new TemporalDomainService({ memgraphService: memgraph });

    switch (action) {
      case 'createStateMachine':
        return await svc.createStateMachine(data, ctx);
      default:
        throw new Error(`Unknown temporal action: ${action}`);
    }
  }
}

module.exports = { DomainPersistExecutor };
