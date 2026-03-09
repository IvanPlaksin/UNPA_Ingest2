// ============================================================
// MIGRATION 000: Cleanup pre-multidomain extraction data
// Removes all graphs created by ImportSqlSelector before
// multi-domain architecture implementation
// ============================================================

// 1. Remove KnowledgeGraph nodes from sql-extraction namespace
MATCH (g:KnowledgeGraph)
WHERE g.namespace = 'sql-extraction'
   OR g.source = 'sql-extraction'
   OR g.tags CONTAINS 'auto-extracted'
DETACH DELETE g;

// 2. Remove IngestionSession and all related nodes
MATCH (s:IngestionSession)
OPTIONAL MATCH (s)-[:HAS_PHASE]->(p:IngestionPhase)
OPTIONAL MATCH (p)-[:HAS_STEP]->(st:AgentStep)
OPTIONAL MATCH (st)-[:USED_PROMPT]->(pr:PromptRecord)
OPTIONAL MATCH (st)-[:MADE_DECISION]->(ad:AgentDecision)
OPTIONAL MATCH (s)-[:PRODUCED_GRAPH]->(kg:KnowledgeGraph)
OPTIONAL MATCH (s)-[:PROFILED_TABLE]->(tp:TableProfile)
OPTIONAL MATCH (s)-[:HAS_METRIC]->(em:ExtractionMetric)
OPTIONAL MATCH (s)-[:FOUND_ANOMALY]->(da:DiscoveredAnomaly)
DETACH DELETE s, p, st, pr, ad, kg, tp, em, da;

// 3. Remove orphaned extraction knowledge nodes
MATCH (n)
WHERE (n:BusinessEntity OR n:BusinessRelationship
   OR n:BusinessRule OR n:Calculation
   OR n:StoredProcedureKG OR n:Enumeration OR n:EnumValue
   OR n:LifecycleState OR n:DatabaseTable OR n:EntityAttribute)
AND NOT (n)--()
DELETE n;

// 4. Remove orphaned process nodes
MATCH (n)
WHERE (n:TableProfile OR n:AgentDecision
   OR n:ExtractionMetric OR n:StrategyVersion
   OR n:PromptRecord OR n:AgentStep)
AND NOT (n)--()
DELETE n;

// 5. Remove CatalogEntry nodes from sql-extraction namespace
MATCH (c:CatalogEntry)
WHERE c.namespace = 'sql-extraction'
   OR ANY(tag IN c.tags WHERE tag = 'auto-extracted')
DETACH DELETE c;

// ============================================================
// VERIFICATION QUERIES (run separately)
// ============================================================
// MATCH (n:IngestionSession) RETURN count(n) as remaining_sessions;
// MATCH (n:KnowledgeGraph) WHERE n.namespace = 'sql-extraction' RETURN count(n) as remaining_extraction_graphs;
// MATCH (n:CatalogEntry) WHERE n.namespace = 'sql-extraction' RETURN count(n) as remaining_catalog_entries;
