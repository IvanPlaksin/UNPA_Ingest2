/**
 * Memgraph Indices Migration Script
 *
 * Creates optimized indices for the knowledge graph to support:
 * - Fast node lookups by ID, name, type
 * - Efficient hybrid search queries
 * - Layer-based filtering for 3D visualization
 *
 * Run: node scripts/migrate-memgraph-indices.js
 *
 * @module scripts/migrate-memgraph-indices
 */

require('dotenv').config();
const neo4j = require('neo4j-driver');

const driver = neo4j.driver(
  process.env.MEMGRAPH_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.MEMGRAPH_USER || 'memgraph',
    process.env.MEMGRAPH_PASSWORD || ''
  )
);

/**
 * Index definitions for Knowledge Graph
 */
const INDICES = [
  // Primary node indices
  { label: 'KnowledgeQuantum', property: 'id', unique: true },
  { label: 'KnowledgeQuantum', property: 'name' },
  { label: 'KnowledgeQuantum', property: 'layer' },
  { label: 'KnowledgeQuantum', property: 'zPosition' },
  { label: 'KnowledgeQuantum', property: 'qdrant_vector_id' },

  // WorkItem indices
  { label: 'WorkItem', property: 'id', unique: true },
  { label: 'WorkItem', property: 'adoId' },
  { label: 'WorkItem', property: 'title' },
  { label: 'WorkItem', property: 'status' },

  // Document indices
  { label: 'Document', property: 'id', unique: true },
  { label: 'Document', property: 'fileHash', unique: true },
  { label: 'Document', property: 'name' },

  // Atom (chunk) indices
  { label: 'Atom', property: 'id', unique: true },
  { label: 'Atom', property: 'qdrant_vector_id' },

  // Entity indices (for various entity types)
  { label: 'System', property: 'id', unique: true },
  { label: 'System', property: 'name' },

  { label: 'Organization', property: 'id', unique: true },
  { label: 'Organization', property: 'name' },

  { label: 'Person', property: 'id', unique: true },
  { label: 'Person', property: 'name' },

  { label: 'Technology', property: 'id', unique: true },
  { label: 'Technology', property: 'name' },

  { label: 'File', property: 'id', unique: true },
  { label: 'File', property: 'path' },

  { label: 'Class', property: 'id', unique: true },
  { label: 'Class', property: 'name' },

  { label: 'Function', property: 'id', unique: true },
  { label: 'Function', property: 'name' },

  { label: 'API', property: 'id', unique: true },
  { label: 'API', property: 'name' },

  { label: 'Database', property: 'id', unique: true },
  { label: 'Database', property: 'name' },

  { label: 'Concept', property: 'id', unique: true },
  { label: 'Concept', property: 'name' },

  { label: 'Epic', property: 'id', unique: true },
  { label: 'Epic', property: 'name' },

  { label: 'Feature', property: 'id', unique: true },
  { label: 'Feature', property: 'name' },

  { label: 'Bug', property: 'id', unique: true },
  { label: 'Bug', property: 'name' },

  { label: 'Task', property: 'id', unique: true },
  { label: 'Task', property: 'name' }
];

/**
 * Full-text search indices (if supported)
 */
const TEXT_INDICES = [
  { label: 'KnowledgeQuantum', properties: ['name', 'description', 'content'] },
  { label: 'WorkItem', properties: ['title', 'description'] },
  { label: 'Document', properties: ['name', 'content'] }
];

/**
 * Create a single index
 */
async function createIndex(session, label, property, unique = false) {
  try {
    // Memgraph uses CREATE INDEX ON syntax
    if (unique) {
      // Memgraph doesn't have native unique constraints like Neo4j
      // We create a regular index and handle uniqueness in application logic
      const query = `CREATE INDEX ON :${label}(${property})`;
      await session.run(query);
      console.log(`  [OK] Index on :${label}(${property})`);
    } else {
      const query = `CREATE INDEX ON :${label}(${property})`;
      await session.run(query);
      console.log(`  [OK] Index on :${label}(${property})`);
    }
  } catch (error) {
    if (error.message.includes('already exists') || error.message.includes('Index already exists')) {
      console.log(`  [SKIP] Index on :${label}(${property}) already exists`);
    } else {
      console.error(`  [ERROR] Index on :${label}(${property}):`, error.message);
    }
  }
}

/**
 * Create text search index (Memgraph specific)
 */
async function createTextIndex(session, label, properties) {
  try {
    // Memgraph doesn't have built-in full-text search like Neo4j
    // We'll create composite indices for text fields instead
    for (const prop of properties) {
      const query = `CREATE INDEX ON :${label}(${prop})`;
      await session.run(query);
    }
    console.log(`  [OK] Text indices on :${label}(${properties.join(', ')})`);
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log(`  [SKIP] Text indices on :${label} already exist`);
    } else {
      console.error(`  [ERROR] Text indices on :${label}:`, error.message);
    }
  }
}

/**
 * Create constraints for data integrity
 */
async function createConstraints(session) {
  console.log('\n--- Creating Constraints ---');

  const constraints = [
    // Ensure KnowledgeQuantum base label exists on all nodes
    `CREATE CONSTRAINT ON (n:KnowledgeQuantum) ASSERT EXISTS (n.id)`,
  ];

  for (const constraint of constraints) {
    try {
      await session.run(constraint);
      console.log(`  [OK] Constraint created`);
    } catch (error) {
      if (error.message.includes('already exists') || error.message.includes('not supported')) {
        console.log(`  [SKIP] Constraint already exists or not supported in Memgraph`);
      } else {
        console.error(`  [ERROR] Constraint:`, error.message);
      }
    }
  }
}

/**
 * Verify indices were created
 */
async function verifyIndices(session) {
  console.log('\n--- Verifying Indices ---');

  try {
    const result = await session.run('SHOW INDEX INFO');
    const indices = result.records.map(r => ({
      label: r.get('label'),
      property: r.get('property')
    }));

    console.log(`  Total indices: ${indices.length}`);

    // Group by label
    const byLabel = {};
    for (const idx of indices) {
      if (!byLabel[idx.label]) byLabel[idx.label] = [];
      byLabel[idx.label].push(idx.property);
    }

    for (const [label, props] of Object.entries(byLabel)) {
      console.log(`    :${label} -> ${props.join(', ')}`);
    }
  } catch (error) {
    console.log('  Could not verify indices:', error.message);
  }
}

/**
 * Create graph statistics for query optimization
 */
async function analyzeGraph(session) {
  console.log('\n--- Analyzing Graph Statistics ---');

  try {
    // Get node counts by label
    const result = await session.run(`
      MATCH (n)
      WITH labels(n) as lbls, count(*) as cnt
      RETURN lbls, cnt
      ORDER BY cnt DESC
      LIMIT 20
    `);

    console.log('  Node counts by label:');
    for (const record of result.records) {
      const labels = record.get('lbls');
      const count = record.get('cnt').toNumber();
      console.log(`    ${labels.join(':')} -> ${count}`);
    }

    // Get edge counts by type
    const edgeResult = await session.run(`
      MATCH ()-[r]->()
      WITH type(r) as relType, count(*) as cnt
      RETURN relType, cnt
      ORDER BY cnt DESC
      LIMIT 10
    `);

    console.log('\n  Edge counts by type:');
    for (const record of edgeResult.records) {
      const relType = record.get('relType');
      const count = record.get('cnt').toNumber();
      console.log(`    ${relType} -> ${count}`);
    }
  } catch (error) {
    console.log('  Could not analyze graph:', error.message);
  }
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('===============================================');
  console.log('  Memgraph Indices Migration');
  console.log('===============================================');
  console.log(`  URI: ${process.env.MEMGRAPH_URI || 'bolt://localhost:7687'}`);
  console.log('===============================================\n');

  const session = driver.session();

  try {
    // Step 1: Create primary indices
    console.log('--- Creating Primary Indices ---');
    for (const idx of INDICES) {
      await createIndex(session, idx.label, idx.property, idx.unique);
    }

    // Step 2: Create text search indices
    console.log('\n--- Creating Text Search Indices ---');
    for (const textIdx of TEXT_INDICES) {
      await createTextIndex(session, textIdx.label, textIdx.properties);
    }

    // Step 3: Create constraints
    await createConstraints(session);

    // Step 4: Verify
    await verifyIndices(session);

    // Step 5: Analyze
    await analyzeGraph(session);

    console.log('\n===============================================');
    console.log('  Migration Complete!');
    console.log('===============================================');

  } catch (error) {
    console.error('\n[FATAL] Migration failed:', error);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }
}

// Run migration
migrate().catch(console.error);
