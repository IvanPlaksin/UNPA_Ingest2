/**
 * Immutable Graph Integration Adapters Index
 * UN ProjectAdvisor - Integration with external systems
 */

export {
  ExtractionAdapter,
  ExtractionResult,
  ExtractedEntity,
  ExtractedRelationship,
  ExtractionSourceInfo,
  ImportResult,
  ImportError
} from './extraction-adapter';

export {
  RabbitHoleAdapter,
  RabbitHoleJob,
  RabbitHoleProgress,
  RabbitHoleResult
} from './rabbithole-adapter';

export {
  SingularityAdapter,
  SingularityGraph,
  SingularityNode,
  SingularityEdge,
  SingularityQueryOptions
} from './singularity-adapter';

export {
  RuntimeAdapter,
  ExecutionResult,
  ExecutionMetrics,
  NodeResult,
  DAGSnapshot,
  DAGNode,
  DAGEdge,
  ExecutionContext,
  PatternRecord,
  RecordResult
} from './runtime-adapter';
