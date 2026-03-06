/**
 * AGENT_EVENTS
 *
 * Canonical list of SSE event types emitted by MssqlAgent during extraction.
 * Used by the controller to document and validate event payloads,
 * and by the frontend to build typed event handlers.
 */

const AGENT_EVENTS = {
  // === SESSION LIFECYCLE ===
  agent_start:    { payload: ['sessionId', 'sourceDatabase', 'options'] },
  agent_complete: { payload: ['sessionId', 'summary', 'graphs', 'qualityScore', 'duration'] },
  agent_error:    { payload: ['message', 'phase', 'recoverable'] },

  // === PHASE LIFECYCLE ===
  phase_start:    { payload: ['phase', 'phaseNumber', 'description'] },
  phase_progress: { payload: ['phase', 'current', 'total', 'item'] },
  phase_complete: { payload: ['phase', 'duration', 'metrics'] },
  phase_error:    { payload: ['phase', 'error', 'recoverable'] },
  phase_skipped:  { payload: ['phase', 'reason'] },

  // === DISCOVERY ===
  schemas_discovered: { payload: ['count', 'schemas'] },
  tables_discovered:  { payload: ['count'] },
  tables_classified:  { payload: ['reference', 'master', 'transaction', 'log', 'junction', 'unknown'] },

  // === EXTRACTION ===
  extracting_table: { payload: ['schema', 'table', 'current', 'total', 'type'] },
  table_extracted:  { payload: ['schema', 'table', 'rowsSampled', 'strategy'] },
  vocabulary_built: { payload: ['enumerations', 'lookups', 'totalValues'] },

  // === ENTITY DISCOVERY ===
  analyzing_entity:  { payload: ['table', 'current', 'total'] },
  entity_discovered: { payload: ['entityName', 'entityType', 'sourceTable', 'attributeCount', 'confidence'] },
  entities_summary:  { payload: ['count', 'byType'] },

  // === RELATIONSHIPS ===
  relationships_inferred: { payload: ['explicit', 'implicit', 'manyToMany', 'hierarchical'] },

  // === TRANSACTIONS ===
  analyzing_transactions: { payload: ['table'] },
  lifecycle_detected:     { payload: ['entity', 'states', 'transitions'] },

  // === BUSINESS LOGIC ===
  analyzing_procedure:    { payload: ['name', 'current', 'total'] },
  procedure_analyzed:     { payload: ['name', 'category', 'rulesFound', 'calculationsFound', 'astParsed'] },
  business_logic_summary: { payload: ['procedures', 'rules', 'calculations'] },

  // === VALIDATION ===
  validation_started:  { payload: [] },
  anomaly_found:       { payload: ['type', 'severity', 'description'] },
  validation_complete: { payload: ['coverage', 'anomalyCount', 'qualityScore'] },

  // === GRAPHS ===
  generating_graph: { payload: ['type'] },
  graph_ready:      { payload: ['type', 'nodes', 'edges'] },
  graphs_complete:  { payload: ['types', 'totalNodes', 'totalEdges'] },

  // === PERSISTENCE ===
  persisting_knowledge: { payload: ['graphType'] },
  knowledge_persisted:  { payload: ['sessionId', 'graphTypes'] },

  // === META-LEARNING ===
  consulting_history:     { payload: ['searching'] },
  similar_sessions_found: { payload: ['count', 'sessions'] },
  strategy_adapted:       { payload: ['source', 'changes'] },

  // === LLM CALLS ===
  llm_call_start:    { payload: ['promptType', 'variablesPreview'] },
  llm_call_complete: { payload: ['promptType', 'durationMs', 'tokensIn', 'tokensOut'] },
  llm_call_error:    { payload: ['promptType', 'error'] },

  // === AGENT DECISIONS ===
  decision_made: { payload: ['type', 'subject', 'chosen', 'confidence', 'reasoning'] },

  // === CATALOG INTEGRATION ===
  persisting_to_catalog:  { payload: ['graphCount'] },
  catalog_save_complete:  { payload: ['saved', 'duplicates', 'errors', 'entries'] },
  catalog_save_error:     { payload: ['error'] },
};

module.exports = { AGENT_EVENTS };
