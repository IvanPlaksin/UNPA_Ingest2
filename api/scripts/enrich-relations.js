/**
 * Relation Enrichment Script
 *
 * Запускает InferredRelationEngine для обогащения графа связями
 * на основе семантической близости, паттернов именования и структурных связей.
 *
 * Usage: node scripts/enrich-relations.js [--dry-run] [--method=naming_pattern]
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const neo4j = require('neo4j-driver');
const { InferredRelationEngine, InferenceMethod } = require('../src/services/structuring/relationships/InferredRelationEngine');

// Configuration
const MEMGRAPH_URI = process.env.MEMGRAPH_URI || process.env.NEO4J_URI || 'bolt://localhost:7687';
const MEMGRAPH_USER = process.env.MEMGRAPH_USER || process.env.NEO4J_USERNAME || '';
const MEMGRAPH_PASSWORD = process.env.MEMGRAPH_PASSWORD || process.env.NEO4J_PASSWORD || '';

// Parse command line args
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const methodArg = args.find(a => a.startsWith('--method='));
const selectedMethod = methodArg ? methodArg.split('=')[1] : null;

// Simple graph client wrapper for Memgraph
class MemgraphClient {
    constructor(driver) {
        this.driver = driver;
    }

    async query(cypher, params = {}) {
        const session = this.driver.session();
        try {
            const result = await session.run(cypher, params);
            return result.records.map(record => {
                const obj = {};
                record.keys.forEach(key => {
                    const value = record.get(key);
                    // Handle neo4j integers
                    if (neo4j.isInt(value)) {
                        obj[key] = value.toNumber();
                    } else if (value && typeof value === 'object' && value.properties) {
                        obj[key] = value.properties;
                    } else {
                        obj[key] = value;
                    }
                });
                return obj;
            });
        } finally {
            await session.close();
        }
    }
}

async function fetchAllNodes(graphClient) {
    console.log('\n📊 Fetching nodes from graph...');

    const query = `
        MATCH (n)
        RETURN n, labels(n) as labels, id(n) as nodeId
        LIMIT 500
    `;

    const records = await graphClient.query(query);

    const nodes = records.map(record => ({
        properties: {
            ...record.n,
            id: record.nodeId?.toString() || record.n?.id
        },
        label: record.labels?.[0] || 'Unknown',
        labels: record.labels || []
    }));

    console.log(`   Found ${nodes.length} nodes`);

    // Group by label
    const byLabel = {};
    nodes.forEach(n => {
        const label = n.label;
        byLabel[label] = (byLabel[label] || 0) + 1;
    });
    console.log('   By type:', byLabel);

    return nodes;
}

async function computeRelationsForNodes(engine, nodes, method = null) {
    console.log('\n🔍 Computing inferred relations...');

    const methods = method
        ? [method]
        : [
            InferenceMethod.NAMING_PATTERN,
            InferenceMethod.CO_OCCURRENCE,
            InferenceMethod.STRUCTURAL
        ];

    console.log(`   Methods: ${methods.join(', ')}`);

    const allRelations = [];
    let processed = 0;

    for (const node of nodes) {
        try {
            const relations = await engine.computeInferredRelations(node, {
                methods,
                existingEntities: nodes
            });

            if (relations.length > 0) {
                allRelations.push(...relations);
                console.log(`   ✓ ${node.properties?.name || node.properties?.title || 'Node'}: ${relations.length} relations`);
            }

            processed++;
            if (processed % 10 === 0) {
                process.stdout.write(`   Processed ${processed}/${nodes.length}\r`);
            }
        } catch (error) {
            console.warn(`   ⚠ Error processing ${node.properties?.name}: ${error.message}`);
        }
    }

    console.log(`\n   Total inferred relations: ${allRelations.length}`);
    return allRelations;
}

async function persistRelations(graphClient, relations) {
    console.log('\n💾 Persisting relations to graph...');

    let created = 0;
    let failed = 0;

    for (const relation of relations) {
        try {
            // Skip potential relations without real targets
            if (relation.properties?.isPotential) {
                continue;
            }

            const query = `
                MATCH (source), (target)
                WHERE (toString(id(source)) = $sourceId OR source.id = $sourceId OR source.name = $sourceId)
                  AND (toString(id(target)) = $targetId OR target.id = $targetId OR target.name = $targetId)
                MERGE (source)-[r:${relation.type}]->(target)
                ON CREATE SET r.inferred = true,
                              r.confidence = $confidence,
                              r.method = $method,
                              r.inferredAt = $inferredAt
                ON MATCH SET r.confidence = CASE WHEN r.confidence < $confidence THEN $confidence ELSE r.confidence END
                RETURN r
            `;

            const result = await graphClient.query(query, {
                sourceId: String(relation.sourceId),
                targetId: String(relation.targetId),
                confidence: relation.properties?.confidence || 0.7,
                method: relation.properties?.method || 'unknown',
                inferredAt: relation.properties?.inferredAt || new Date().toISOString()
            });

            if (result.length > 0) {
                created++;
            }
        } catch (error) {
            failed++;
            if (failed <= 3) {
                console.warn(`   ⚠ Failed: ${relation.sourceId} -[${relation.type}]-> ${relation.targetId}: ${error.message}`);
            }
        }
    }

    console.log(`   ✅ Created/Updated: ${created}`);
    if (failed > 0) {
        console.log(`   ❌ Failed: ${failed}`);
    }

    return { created, failed };
}

async function generateCrossLayerRelations(graphClient) {
    console.log('\n🌉 Generating cross-layer relations...');

    // Define layer mappings
    const layers = {
        strategic: ['Project', 'KPI', 'OKR', 'Goal', 'Strategy'],
        business: ['Knowledge', 'Epic', 'Feature', 'Process', 'Requirement'],
        tasks: ['WorkItem', 'Task', 'Bug', 'Story', 'Sprint'],
        code: ['File', 'Class', 'Function', 'Module', 'Artifact'],
        infrastructure: ['Database', 'Service', 'Server', 'Container']
    };

    // Create relations between adjacent layers based on semantic similarity (name matching)
    const crossLayerQueries = [
        // Project -> Knowledge (strategic -> business)
        `MATCH (p:Project), (k:Knowledge)
         WHERE p.name IS NOT NULL AND k.title IS NOT NULL
         AND (toLower(k.title) CONTAINS toLower(p.name) OR toLower(p.name) CONTAINS 'project')
         MERGE (p)-[r:GOVERNS]->(k)
         ON CREATE SET r.inferred = true, r.method = 'cross_layer', r.confidence = 0.7
         RETURN count(r) as created`,

        // Knowledge -> Artifact (business -> code)
        `MATCH (k:Knowledge), (a:Artifact)
         WHERE k.title IS NOT NULL AND a.name IS NOT NULL
         MERGE (k)-[r:DESCRIBES]->(a)
         ON CREATE SET r.inferred = true, r.method = 'cross_layer', r.confidence = 0.6
         RETURN count(r) as created`
    ];

    let totalCreated = 0;

    for (const query of crossLayerQueries) {
        try {
            const result = await graphClient.query(query);
            const created = result[0]?.created || 0;
            totalCreated += created;
            console.log(`   Created ${created} cross-layer relations`);
        } catch (error) {
            console.warn(`   ⚠ Query failed: ${error.message}`);
        }
    }

    // Also create RELATES_TO between Knowledge nodes based on common tags/concepts
    try {
        const semanticQuery = `
            MATCH (k1:Knowledge), (k2:Knowledge)
            WHERE id(k1) < id(k2)
              AND k1.title IS NOT NULL AND k2.title IS NOT NULL
              AND (
                  toLower(k1.title) CONTAINS 'knowledge' AND toLower(k2.title) CONTAINS 'knowledge'
                  OR toLower(k1.content) CONTAINS toLower(k2.title)
                  OR toLower(k2.content) CONTAINS toLower(k1.title)
              )
            MERGE (k1)-[r:RELATES_TO]->(k2)
            ON CREATE SET r.inferred = true, r.method = 'semantic_match', r.confidence = 0.65
            RETURN count(r) as created
        `;

        const result = await graphClient.query(semanticQuery);
        const created = result[0]?.created || 0;
        totalCreated += created;
        console.log(`   Created ${created} semantic relations between Knowledge nodes`);
    } catch (error) {
        console.warn(`   ⚠ Semantic query failed: ${error.message}`);
    }

    return totalCreated;
}

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   RELATION ENRICHMENT - InferredRelationEngine');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
    console.log(`Method: ${selectedMethod || 'all available'}`);

    // Connect to Memgraph
    console.log('\n🔌 Connecting to Memgraph...');
    console.log(`   URI: ${MEMGRAPH_URI}`);

    const driver = neo4j.driver(
        MEMGRAPH_URI,
        neo4j.auth.basic(MEMGRAPH_USER, MEMGRAPH_PASSWORD)
    );

    try {
        await driver.verifyConnectivity();
        console.log('   ✅ Connected successfully');
    } catch (error) {
        console.error('   ❌ Connection failed:', error.message);
        process.exit(1);
    }

    const graphClient = new MemgraphClient(driver);

    try {
        // Fetch all nodes
        const nodes = await fetchAllNodes(graphClient);

        if (nodes.length === 0) {
            console.log('\n⚠️ No nodes found in graph. Nothing to enrich.');
            return;
        }

        // Initialize engine (without embedding service for now - uses naming patterns and structural)
        const engine = new InferredRelationEngine(graphClient, null, {
            minConfidence: 0.5,
            semanticSimilarityThreshold: 0.7,
            coOccurrenceMinCount: 1
        });

        console.log('\n📋 Engine configuration:', engine.getInfo());

        // Compute relations
        const relations = await computeRelationsForNodes(engine, nodes, selectedMethod);

        // Generate cross-layer relations
        let crossLayerCreated = 0;
        if (!isDryRun) {
            crossLayerCreated = await generateCrossLayerRelations(graphClient);
        }

        // Show sample relations
        if (relations.length > 0) {
            console.log('\n📝 Sample inferred relations:');
            relations.slice(0, 5).forEach(r => {
                console.log(`   ${r.sourceId} -[${r.type}]-> ${r.targetId} (${(r.properties?.confidence * 100).toFixed(0)}%)`);
            });
        }

        // Persist relations
        if (!isDryRun && relations.length > 0) {
            const result = await persistRelations(graphClient, relations);

            console.log('\n═══════════════════════════════════════════════════════════════');
            console.log('   ENRICHMENT COMPLETE');
            console.log('═══════════════════════════════════════════════════════════════');
            console.log(`   Nodes processed: ${nodes.length}`);
            console.log(`   Relations inferred: ${relations.length}`);
            console.log(`   Relations persisted: ${result.created}`);
            console.log(`   Cross-layer relations: ${crossLayerCreated}`);
        } else if (isDryRun) {
            console.log('\n═══════════════════════════════════════════════════════════════');
            console.log('   DRY RUN COMPLETE (no changes made)');
            console.log('═══════════════════════════════════════════════════════════════');
            console.log(`   Nodes analyzed: ${nodes.length}`);
            console.log(`   Relations would be created: ${relations.length}`);
        }

        // Verify final graph state
        console.log('\n📊 Final graph statistics:');
        const stats = await graphClient.query(`
            MATCH (n)
            WITH count(n) as nodes
            MATCH ()-[r]->()
            RETURN nodes, count(r) as relations
        `);
        console.log(`   Nodes: ${stats[0]?.nodes || 0}`);
        console.log(`   Relations: ${stats[0]?.relations || 0}`);

    } finally {
        await driver.close();
        console.log('\n🔌 Disconnected from Memgraph');
    }
}

main().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
});
