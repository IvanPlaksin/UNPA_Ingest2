/**
 * Common Plugin (JS)
 * Provides fundamental workflow executors needed by all iNeed graph definitions.
 */

const { PluginBase } = require('../plugin-base');
const { StartExecutor } = require('./executors/start.executor');
const { EndExecutor } = require('./executors/end.executor');
const { ConditionExecutor } = require('./executors/condition.executor');
const { AiGenerateExecutor } = require('./executors/ai-generate.executor');
const { VectorSearchExecutor } = require('./executors/vector-search.executor');
const { GraphCreateNodeExecutor } = require('./executors/graph-create-node.executor');
const { GraphQueryExecutor } = require('./executors/graph-query.executor');

// CORE universal executors (config-driven, project-agnostic)
const { EntityCreateExecutor } = require('./executors/entity-create.executor');
const { EntityUpdateExecutor } = require('./executors/entity-update.executor');
const { EntityQueryExecutor } = require('./executors/entity-query.executor');
const { EntityTransitionExecutor } = require('./executors/entity-transition.executor');
const { RoutingEvaluateExecutor } = require('./executors/routing-evaluate.executor');
const { SLACalculateExecutor } = require('./executors/sla-calculate.executor');
const { SLACheckExecutor } = require('./executors/sla-check.executor');
const { TransformExecutor } = require('./executors/transform.executor');
const { AiAgentExecutor } = require('./executors/ai-agent.executor');

class CommonPlugin extends PluginBase {
  constructor() {
    super({
      name: 'common',
      version: '2.0.0',
      description: 'Common executors: start/end, conditions, AI, vector search, graph ops, entity CRUD, routing, SLA',
      author: 'UNPA Team',
      domain: 'common',
    });
  }

  async initialize() {
    // Workflow primitives
    this.addExecutor(new StartExecutor());
    this.addExecutor(new EndExecutor());
    this.addExecutor(new ConditionExecutor());

    // AI & search
    this.addExecutor(new AiGenerateExecutor());
    this.addExecutor(new VectorSearchExecutor());

    // Graph operations (raw Cypher)
    this.addExecutor(new GraphCreateNodeExecutor());
    this.addExecutor(new GraphQueryExecutor());

    // CORE universal executors (config-driven, project-agnostic)
    this.addExecutor(new EntityCreateExecutor());
    this.addExecutor(new EntityUpdateExecutor());
    this.addExecutor(new EntityQueryExecutor());
    this.addExecutor(new EntityTransitionExecutor());
    this.addExecutor(new RoutingEvaluateExecutor());
    this.addExecutor(new SLACalculateExecutor());
    this.addExecutor(new SLACheckExecutor());

    // Dynamic service invocation & advanced AI
    this.addExecutor(new TransformExecutor());
    this.addExecutor(new AiAgentExecutor());
  }
}

const commonPlugin = new CommonPlugin();

module.exports = { CommonPlugin, commonPlugin };
