/**
 * Code Entity Extraction Script
 *
 * Запускает ASTExtractor для извлечения сущностей из TypeScript/JavaScript файлов
 * и сохраняет их в Memgraph.
 *
 * Usage: node scripts/extract-code-entities.js [--dir=path] [--limit=N] [--dry-run]
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const neo4j = require('neo4j-driver');
const { ASTExtractor, NodeLabels } = require('../src/services/structuring/extractors/ASTExtractor');

// Configuration
const MEMGRAPH_URI = process.env.MEMGRAPH_URI || process.env.NEO4J_URI || 'bolt://localhost:7687';
const MEMGRAPH_USER = process.env.MEMGRAPH_USER || process.env.NEO4J_USERNAME || '';
const MEMGRAPH_PASSWORD = process.env.MEMGRAPH_PASSWORD || process.env.NEO4J_PASSWORD || '';

// Parse command line args
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const dirArg = args.find(a => a.startsWith('--dir='));
const limitArg = args.find(a => a.startsWith('--limit='));
const targetDir = dirArg ? dirArg.split('=')[1] : path.resolve(__dirname, '../../mcp/src');
const fileLimit = limitArg ? parseInt(limitArg.split('=')[1]) : 20;

// Project ID for this extraction
const PROJECT_ID = 'unpa_ingest';

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
 * Find all TS/JS files in directory recursively
 */
function findSourceFiles(dir, limit = 100) {
    const files = [];
    const extensions = ['.ts', '.tsx', '.js', '.jsx'];

    function scan(currentDir) {
        if (files.length >= limit) return;

        try {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });

            for (const entry of entries) {
                if (files.length >= limit) break;

                const fullPath = path.join(currentDir, entry.name);

                // Skip node_modules, dist, build, etc.
                if (entry.isDirectory()) {
                    if (['node_modules', 'dist', 'build', '.git', '__pycache__', 'coverage'].includes(entry.name)) {
                        continue;
                    }
                    scan(fullPath);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (extensions.includes(ext) && !entry.name.endsWith('.d.ts')) {
                        files.push(fullPath);
                    }
                }
            }
        } catch (err) {
            console.warn(`Cannot scan ${currentDir}: ${err.message}`);
        }
    }

    scan(dir);
    return files;
}

/**
 * Persist entity to graph
 */
async function persistEntity(client, entity, projectId) {
    const label = entity.label || 'CodeEntity';
    const props = { ...entity.properties, projectId };

    // Use qualifiedName as unique identifier
    const id = props.qualifiedName || props.name || `entity_${Date.now()}`;
    props.id = id;

    try {
        const query = `
            MERGE (n:${label} {id: $id})
            ON CREATE SET n = $props, n.createdAt = datetime()
            ON MATCH SET n += $props, n.updatedAt = datetime()
            RETURN n
        `;

        await client.query(query, { id, props });
        return true;
    } catch (error) {
        console.warn(`Failed to persist ${label} ${id}: ${error.message}`);
        return false;
    }
}

/**
 * Persist relationship to graph
 */
async function persistRelationship(client, rel) {
    if (!rel.sourceId || !rel.targetId) return false;

    try {
        const query = `
            MATCH (source {id: $sourceId})
            MATCH (target)
            WHERE target.id = $targetId
               OR target.qualifiedName = $targetId
               OR target.name = $targetId
               OR target.filePath = $targetId
            MERGE (source)-[r:${rel.type}]->(target)
            ON CREATE SET r = $props
            RETURN r
        `;

        const result = await client.query(query, {
            sourceId: rel.sourceId,
            targetId: rel.targetId,
            props: rel.properties || {}
        });

        return result.length > 0;
    } catch (error) {
        // Silently skip - target may not exist
        return false;
    }
}

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   CODE ENTITY EXTRACTION - ASTExtractor');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
    console.log(`Target directory: ${targetDir}`);
    console.log(`File limit: ${fileLimit}`);

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
    const extractor = new ASTExtractor();

    try {
        // Find source files
        console.log('\n📂 Scanning for source files...');
        const files = findSourceFiles(targetDir, fileLimit);
        console.log(`   Found ${files.length} files`);

        if (files.length === 0) {
            console.log('\n⚠️ No source files found. Exiting.');
            return;
        }

        // Show sample files
        console.log('\n📄 Sample files:');
        files.slice(0, 5).forEach(f => console.log(`   - ${path.relative(targetDir, f)}`));
        if (files.length > 5) console.log(`   ... and ${files.length - 5} more`);

        // Extract and persist
        console.log('\n🔍 Extracting entities...');

        const stats = {
            filesProcessed: 0,
            entitiesCreated: 0,
            relationshipsCreated: 0,
            errors: 0,
            byType: {}
        };

        for (const filePath of files) {
            const relativePath = path.relative(targetDir, filePath);

            try {
                // Read file content
                const content = fs.readFileSync(filePath, 'utf-8');

                // Extract entities
                const result = await extractor.extractFromTypeScript(filePath, content);

                stats.filesProcessed++;

                // Count by type
                for (const entity of result.entities) {
                    const type = entity.label;
                    stats.byType[type] = (stats.byType[type] || 0) + 1;
                }

                // Persist entities
                if (!isDryRun) {
                    for (const entity of result.entities) {
                        const success = await persistEntity(client, entity, PROJECT_ID);
                        if (success) stats.entitiesCreated++;
                    }

                    // Persist relationships (CONTAINS, IMPORTS only for now)
                    for (const rel of result.relationships) {
                        if (['CONTAINS', 'IMPORTS', 'EXPORTS'].includes(rel.type)) {
                            const success = await persistRelationship(client, rel);
                            if (success) stats.relationshipsCreated++;
                        }
                    }
                } else {
                    stats.entitiesCreated += result.entities.length;
                    stats.relationshipsCreated += result.relationships.filter(r =>
                        ['CONTAINS', 'IMPORTS', 'EXPORTS'].includes(r.type)
                    ).length;
                }

                // Progress indicator
                if (stats.filesProcessed % 5 === 0 || stats.filesProcessed === files.length) {
                    process.stdout.write(`   Processed ${stats.filesProcessed}/${files.length} files\r`);
                }

            } catch (error) {
                stats.errors++;
                console.warn(`\n   ⚠ Error processing ${relativePath}: ${error.message}`);
            }
        }

        console.log('\n');

        // Print results
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('   EXTRACTION COMPLETE');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`   Files processed: ${stats.filesProcessed}`);
        console.log(`   Entities ${isDryRun ? 'found' : 'created'}: ${stats.entitiesCreated}`);
        console.log(`   Relationships ${isDryRun ? 'found' : 'created'}: ${stats.relationshipsCreated}`);
        console.log(`   Errors: ${stats.errors}`);

        console.log('\n   Entities by type:');
        for (const [type, count] of Object.entries(stats.byType).sort((a, b) => b[1] - a[1])) {
            console.log(`     ${type}: ${count}`);
        }

        // Verify final graph state
        if (!isDryRun) {
            console.log('\n📊 Final graph statistics:');
            const graphStats = await client.query(`
                MATCH (n)
                WITH count(n) as nodes
                MATCH ()-[r]->()
                RETURN nodes, count(r) as relations
            `);
            console.log(`   Total nodes: ${graphStats[0]?.nodes || 0}`);
            console.log(`   Total relations: ${graphStats[0]?.relations || 0}`);

            // Count by label
            const labelStats = await client.query(`
                MATCH (n)
                RETURN labels(n)[0] as label, count(n) as count
                ORDER BY count DESC
            `);
            console.log('\n   Nodes by label:');
            labelStats.forEach(s => console.log(`     ${s.label}: ${s.count}`));
        }

    } finally {
        await driver.close();
        console.log('\n🔌 Disconnected from Memgraph');
    }
}

main().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
});
