/**
 * Code Layer Relation Enrichment Script
 *
 * Создаёт связи между кодовыми сущностями:
 * - CONTAINS: File -> Class/Function/Method
 * - IMPORTS: File -> File (по импортам)
 * - CALLS: Function/Method -> Function/Method
 * - SERVICE_DEPENDS: *Service -> *Entity (naming patterns)
 * - CROSS_LAYER: Code <-> Business (Knowledge)
 *
 * Usage: node scripts/enrich-code-relations.js [--dry-run]
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const neo4j = require('neo4j-driver');

// Configuration
const MEMGRAPH_URI = process.env.MEMGRAPH_URI || process.env.NEO4J_URI || 'bolt://localhost:7687';
const MEMGRAPH_USER = process.env.MEMGRAPH_USER || process.env.NEO4J_USERNAME || '';
const MEMGRAPH_PASSWORD = process.env.MEMGRAPH_PASSWORD || process.env.NEO4J_PASSWORD || '';

// Parse command line args
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

// Simple graph client wrapper
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

/**
 * Create CONTAINS relations: File -> Class/Function/Method
 * Based on filePath property matching
 */
async function createContainsRelations(client) {
    console.log('\n📁 Creating CONTAINS relations (File -> Children)...');

    const query = `
        MATCH (f:File), (child)
        WHERE child.filePath = f.filePath
          AND (child:Class OR child:Function OR child:Method OR child:Interface OR child:Enum)
          AND NOT (f)-[:CONTAINS]->(child)
        MERGE (f)-[r:CONTAINS]->(child)
        ON CREATE SET r.inferred = true, r.method = 'filePath_match'
        RETURN count(r) as created
    `;

    const result = await client.query(query);
    const created = result[0]?.created || 0;
    console.log(`   ✅ Created ${created} CONTAINS relations`);
    return created;
}

/**
 * Create MEMBER_OF relations: Method -> Class
 * Based on qualifiedName containing class name
 */
async function createMemberOfRelations(client) {
    console.log('\n🔗 Creating MEMBER_OF relations (Method -> Class)...');

    const query = `
        MATCH (m:Method), (c:Class)
        WHERE m.filePath = c.filePath
          AND m.qualifiedName CONTAINS c.name
          AND NOT (m)-[:MEMBER_OF]->(c)
        MERGE (m)-[r:MEMBER_OF]->(c)
        ON CREATE SET r.inferred = true, r.method = 'qualifiedName_match'
        RETURN count(r) as created
    `;

    const result = await client.query(query);
    const created = result[0]?.created || 0;
    console.log(`   ✅ Created ${created} MEMBER_OF relations`);
    return created;
}

/**
 * Create naming pattern relations
 * - *Service -> *Entity (if entity exists)
 * - *Controller -> *Service
 * - *Repository -> *Entity
 */
async function createNamingPatternRelations(client) {
    console.log('\n🏷️ Creating naming pattern relations...');

    let totalCreated = 0;

    // Pattern 1: Service -> Entity (e.g., UserService -> User)
    const serviceQuery = `
        MATCH (s)
        WHERE (s:Class OR s:Function) AND s.name ENDS WITH 'Service'
        WITH s, replace(s.name, 'Service', '') as entityName
        MATCH (e)
        WHERE (e:Class OR e:Interface) AND e.name = entityName
        AND NOT (s)-[:DEPENDS_ON]->(e)
        MERGE (s)-[r:DEPENDS_ON]->(e)
        ON CREATE SET r.inferred = true, r.method = 'naming_pattern', r.pattern = 'Service_Entity'
        RETURN count(r) as created
    `;

    let result = await client.query(serviceQuery);
    let created = result[0]?.created || 0;
    totalCreated += created;
    console.log(`   Service -> Entity: ${created}`);

    // Pattern 2: Controller -> Service
    const controllerQuery = `
        MATCH (c)
        WHERE (c:Class OR c:Function) AND c.name ENDS WITH 'Controller'
        WITH c, replace(c.name, 'Controller', 'Service') as serviceName
        MATCH (s)
        WHERE (s:Class OR s:Function) AND s.name = serviceName
        AND NOT (c)-[:DEPENDS_ON]->(s)
        MERGE (c)-[r:DEPENDS_ON]->(s)
        ON CREATE SET r.inferred = true, r.method = 'naming_pattern', r.pattern = 'Controller_Service'
        RETURN count(r) as created
    `;

    result = await client.query(controllerQuery);
    created = result[0]?.created || 0;
    totalCreated += created;
    console.log(`   Controller -> Service: ${created}`);

    // Pattern 3: Repository -> Entity
    const repoQuery = `
        MATCH (r)
        WHERE (r:Class OR r:Function) AND r.name ENDS WITH 'Repository'
        WITH r, replace(r.name, 'Repository', '') as entityName
        MATCH (e)
        WHERE (e:Class OR e:Interface) AND e.name = entityName
        AND NOT (r)-[:DEPENDS_ON]->(e)
        MERGE (r)-[rel:DEPENDS_ON]->(e)
        ON CREATE SET rel.inferred = true, rel.method = 'naming_pattern', rel.pattern = 'Repository_Entity'
        RETURN count(rel) as created
    `;

    result = await client.query(repoQuery);
    created = result[0]?.created || 0;
    totalCreated += created;
    console.log(`   Repository -> Entity: ${created}`);

    // Pattern 4: Handler -> Command/Event
    const handlerQuery = `
        MATCH (h)
        WHERE (h:Class OR h:Function) AND h.name ENDS WITH 'Handler'
        WITH h, replace(h.name, 'Handler', '') as commandName
        MATCH (c)
        WHERE (c:Class OR c:Interface) AND c.name = commandName
        AND NOT (h)-[:HANDLES]->(c)
        MERGE (h)-[r:HANDLES]->(c)
        ON CREATE SET r.inferred = true, r.method = 'naming_pattern', r.pattern = 'Handler_Command'
        RETURN count(r) as created
    `;

    result = await client.query(handlerQuery);
    created = result[0]?.created || 0;
    totalCreated += created;
    console.log(`   Handler -> Command: ${created}`);

    console.log(`   ✅ Total naming patterns: ${totalCreated}`);
    return totalCreated;
}

/**
 * Create same-directory relations
 * Files in the same directory are likely related
 */
async function createSameDirectoryRelations(client) {
    console.log('\n📂 Creating same-directory relations...');

    // Memgraph doesn't support NOT pattern in WHERE with WITH, so use simpler approach
    // Get all files, group by directory, create relations
    let totalCreated = 0;

    // Get files with their directories
    const filesQuery = `
        MATCH (f:File)
        WHERE f.filePath IS NOT NULL
        RETURN id(f) as id, f.name as name, f.filePath as filePath
    `;

    const files = await client.query(filesQuery);

    // Group by directory
    const byDir = {};
    files.forEach(f => {
        // Extract directory (handle both / and \\)
        const parts = f.filePath.replace(/\\/g, '/').split('/');
        const dir = parts.slice(0, -1).join('/');
        if (!byDir[dir]) byDir[dir] = [];
        byDir[dir].push(f.id);
    });

    // Create relations within each directory
    for (const [dir, fileIds] of Object.entries(byDir)) {
        if (fileIds.length < 2) continue;

        for (let i = 0; i < fileIds.length - 1; i++) {
            for (let j = i + 1; j < fileIds.length; j++) {
                try {
                    const result = await client.query(`
                        MATCH (f1:File), (f2:File)
                        WHERE id(f1) = $id1 AND id(f2) = $id2
                        MERGE (f1)-[r:SAME_DIRECTORY]->(f2)
                        ON CREATE SET r.inferred = true, r.method = 'same_directory'
                        RETURN count(r) as created
                    `, { id1: fileIds[i], id2: fileIds[j] });
                    totalCreated += result[0]?.created || 0;
                } catch (e) {
                    // Skip errors
                }
            }
        }
    }

    console.log(`   ✅ Created ${totalCreated} SAME_DIRECTORY relations`);
    return totalCreated;
}

/**
 * Create cross-layer relations (Code <-> Business)
 * Link code entities to Knowledge nodes based on name matching
 */
async function createCrossLayerRelations(client) {
    console.log('\n🌉 Creating cross-layer relations (Code <-> Knowledge)...');

    let totalCreated = 0;

    // Pattern 1: Class/Function name mentioned in Knowledge title/content
    // Using simpler approach without NOT pattern
    const codeToKnowledgeQuery = `
        MATCH (code), (k:Knowledge)
        WHERE (code:Class OR code:Function OR code:File)
          AND code.name IS NOT NULL
          AND k.title IS NOT NULL
          AND length(code.name) > 3
          AND toLower(k.title) CONTAINS toLower(code.name)
        MERGE (code)-[r:DOCUMENTED_BY]->(k)
        ON CREATE SET r.inferred = true, r.method = 'name_in_knowledge', r.confidence = 0.7
        RETURN count(r) as created
    `;

    let result = await client.query(codeToKnowledgeQuery);
    let created = result[0]?.created || 0;
    totalCreated += created;
    console.log(`   Code -> Knowledge (name match): ${created}`);

    // Pattern 2: Knowledge about specific components (service, controller, etc.)
    const componentKnowledgeQuery = `
        MATCH (k:Knowledge), (code)
        WHERE k.title IS NOT NULL
          AND (code:Class OR code:Function)
          AND code.name IS NOT NULL
          AND (
              (toLower(k.title) CONTAINS 'service' AND code.name ENDS WITH 'Service')
              OR (toLower(k.title) CONTAINS 'controller' AND code.name ENDS WITH 'Controller')
              OR (toLower(k.title) CONTAINS 'extraction' AND code.name CONTAINS 'Extract')
              OR (toLower(k.title) CONTAINS 'embedding' AND code.name CONTAINS 'Embedding')
          )
        MERGE (k)-[r:DESCRIBES]->(code)
        ON CREATE SET r.inferred = true, r.method = 'component_knowledge', r.confidence = 0.6
        RETURN count(r) as created
    `;

    result = await client.query(componentKnowledgeQuery);
    created = result[0]?.created || 0;
    totalCreated += created;
    console.log(`   Knowledge -> Code (component match): ${created}`);

    // Pattern 3: Project -> All code entities (limit to avoid too many)
    const projectToCodeQuery = `
        MATCH (p:Project), (code:File)
        WITH p, code
        LIMIT 30
        MERGE (p)-[r:CONTAINS_CODE]->(code)
        ON CREATE SET r.inferred = true, r.method = 'project_code'
        RETURN count(r) as created
    `;

    result = await client.query(projectToCodeQuery);
    created = result[0]?.created || 0;
    totalCreated += created;
    console.log(`   Project -> Code: ${created}`);

    console.log(`   ✅ Total cross-layer: ${totalCreated}`);
    return totalCreated;
}

/**
 * Create similarity relations between similar-named entities
 */
async function createSimilarityRelations(client) {
    console.log('\n🔍 Creating similarity relations...');

    // Find entities with similar names (e.g., Chat*, Knowledge*, etc.)
    // Simplified query without NOT pattern
    const prefixQuery = `
        MATCH (a), (b)
        WHERE id(a) < id(b)
          AND (a:Class OR a:Function OR a:File)
          AND (b:Class OR b:Function OR b:File)
          AND a.name IS NOT NULL
          AND b.name IS NOT NULL
          AND length(a.name) > 5
          AND length(b.name) > 5
          AND left(a.name, 5) = left(b.name, 5)
        MERGE (a)-[r:SIMILAR_TO]->(b)
        ON CREATE SET r.inferred = true, r.method = 'name_prefix'
        RETURN count(r) as created
    `;

    const result = await client.query(prefixQuery);
    const created = result[0]?.created || 0;
    console.log(`   ✅ Created ${created} SIMILAR_TO relations`);
    return created;
}

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   CODE LAYER RELATION ENRICHMENT');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);

    // Connect to Memgraph
    console.log('\n🔌 Connecting to Memgraph...');
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

    const client = new MemgraphClient(driver);

    try {
        // Get initial stats
        console.log('\n📊 Initial graph state:');
        const initialStats = await client.query(`
            MATCH (n)
            WITH count(n) as nodes
            MATCH ()-[r]->()
            RETURN nodes, count(r) as relations
        `);
        console.log(`   Nodes: ${initialStats[0]?.nodes || 0}`);
        console.log(`   Relations: ${initialStats[0]?.relations || 0}`);

        // Count by label
        const labelStats = await client.query(`
            MATCH (n)
            WHERE n:File OR n:Class OR n:Function OR n:Method
            RETURN labels(n)[0] as label, count(n) as count
            ORDER BY count DESC
        `);
        console.log('   Code entities:');
        labelStats.forEach(s => console.log(`     ${s.label}: ${s.count}`));

        if (isDryRun) {
            console.log('\n⚠️ DRY RUN - No changes will be made');
            return;
        }

        // Run enrichment steps
        let totalCreated = 0;

        totalCreated += await createContainsRelations(client);
        totalCreated += await createMemberOfRelations(client);
        totalCreated += await createNamingPatternRelations(client);
        totalCreated += await createSameDirectoryRelations(client);
        totalCreated += await createCrossLayerRelations(client);
        totalCreated += await createSimilarityRelations(client);

        // Final stats
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('   ENRICHMENT COMPLETE');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`   Total new relations: ${totalCreated}`);

        const finalStats = await client.query(`
            MATCH (n)
            WITH count(n) as nodes
            MATCH ()-[r]->()
            RETURN nodes, count(r) as relations
        `);
        console.log(`\n📊 Final graph state:`);
        console.log(`   Nodes: ${finalStats[0]?.nodes || 0}`);
        console.log(`   Relations: ${finalStats[0]?.relations || 0}`);

        // Relation type breakdown
        const relTypeStats = await client.query(`
            MATCH ()-[r]->()
            RETURN type(r) as relType, count(r) as count
            ORDER BY count DESC
        `);
        console.log('\n   Relations by type:');
        relTypeStats.forEach(s => console.log(`     ${s.relType}: ${s.count}`));

    } finally {
        await driver.close();
        console.log('\n🔌 Disconnected from Memgraph');
    }
}

main().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
});
