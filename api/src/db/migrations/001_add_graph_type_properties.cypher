// Migration 001: Add graphType, graphSubType, graphDimension to GraphDefinition nodes
// Sets default EXECUTABLE/EXECUTION for all existing graphs without graphType.
// Run: node api/scripts/migrate-graph-type-properties.js

// Step 1: Set default graphType for all GraphDefinition nodes missing it
MATCH (g:GraphDefinition)
WHERE g.graphType IS NULL
SET g.graphType = 'EXECUTABLE',
    g.graphDimension = 'EXECUTION',
    g.graphSubType = null
RETURN count(g) as migrated;
