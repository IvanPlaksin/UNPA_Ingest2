const { StartExecutor } = require('./start.executor');
const { EndExecutor } = require('./end.executor');
const { ConditionExecutor } = require('./condition.executor');
const { AiGenerateExecutor } = require('./ai-generate.executor');
const { VectorSearchExecutor } = require('./vector-search.executor');
const { GraphCreateNodeExecutor } = require('./graph-create-node.executor');
const { GraphQueryExecutor } = require('./graph-query.executor');

// CORE universal executors (config-driven, project-agnostic)
const { EntityCreateExecutor } = require('./entity-create.executor');
const { EntityUpdateExecutor } = require('./entity-update.executor');
const { EntityQueryExecutor } = require('./entity-query.executor');
const { EntityTransitionExecutor } = require('./entity-transition.executor');
const { RoutingEvaluateExecutor } = require('./routing-evaluate.executor');
const { SLACalculateExecutor } = require('./sla-calculate.executor');
const { SLACheckExecutor } = require('./sla-check.executor');
const { TransformExecutor } = require('./transform.executor');
const { AiAgentExecutor } = require('./ai-agent.executor');

module.exports = {
  StartExecutor,
  EndExecutor,
  ConditionExecutor,
  AiGenerateExecutor,
  VectorSearchExecutor,
  GraphCreateNodeExecutor,
  GraphQueryExecutor,
  // CORE universal
  EntityCreateExecutor,
  EntityUpdateExecutor,
  EntityQueryExecutor,
  EntityTransitionExecutor,
  RoutingEvaluateExecutor,
  SLACalculateExecutor,
  SLACheckExecutor,
  TransformExecutor,
  AiAgentExecutor,
};
