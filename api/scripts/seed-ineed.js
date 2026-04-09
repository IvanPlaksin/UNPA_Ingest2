#!/usr/bin/env node
/**
 * Seed iNeed Test Data
 *
 * Seeds Memgraph and Qdrant with test data for the iNeed platform.
 *
 * Usage:
 *   node api/scripts/seed-ineed.js
 *   node api/scripts/seed-ineed.js --clear  (clear before seeding)
 *   node api/scripts/seed-ineed.js --schema-only  (only load schema)
 */

const path = require('path');

// Ensure we can resolve project modules
process.chdir(path.join(__dirname, '..'));

async function main() {
  const args = process.argv.slice(2);
  const clearFirst = args.includes('--clear');
  const schemaOnly = args.includes('--schema-only');

  console.log('=== iNeed Test Data Seeder ===\n');

  // 1. Load Memgraph schema
  console.log('[1/4] Loading Memgraph schema...');
  try {
    const memgraph = require('../src/services/memgraph.service');
    const { SchemaLoaderService } = require('../src/services/memgraph/schema-loader.service');

    const schemaLoader = new SchemaLoaderService(memgraph);
    const schemaResult = await schemaLoader.loadSchema('ineed-schema');
    console.log(`  OK: ${schemaResult.statements} statements executed`);
    if (schemaResult.errors.length > 0) {
      console.log(`  Warnings: ${schemaResult.errors.length}`);
    }
  } catch (err) {
    console.error(`  FAIL: ${err.message}`);
    console.log('  (Memgraph may not be running)');
  }

  if (schemaOnly) {
    console.log('\n--schema-only flag set, skipping data seeding.');
    process.exit(0);
  }

  // 2. Seed Memgraph test data
  console.log('\n[2/4] Seeding Memgraph test data...');
  try {
    const memgraph = require('../src/services/memgraph.service');
    const { INeedTestDataSeeder } = require('../src/services/memgraph/seeds/ineed-test-data');

    const seeder = new INeedTestDataSeeder(memgraph);

    if (clearFirst) {
      console.log('  Clearing existing data...');
      await seeder.clear();
      console.log('  Cleared.');
    }

    const result = await seeder.seed();
    console.log('  OK: Created:');
    for (const [key, count] of Object.entries(result.created)) {
      console.log(`    ${key}: ${count}`);
    }
  } catch (err) {
    console.error(`  FAIL: ${err.message}`);
  }

  // 3. Create Qdrant collections
  console.log('\n[3/4] Creating Qdrant collections...');
  try {
    const { QdrantClient } = require('@qdrant/js-client-rest');
    const { INeedQdrantCollections } = require('../src/services/qdrant/ineed-collections');

    const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
    const qdrantClient = new QdrantClient({ url: qdrantUrl });
    const collections = new INeedQdrantCollections(qdrantClient);

    const created = await collections.createCollections();
    console.log(`  OK: Collections: ${created.join(', ')}`);
  } catch (err) {
    console.error(`  FAIL: ${err.message}`);
    console.log('  (Qdrant may not be running)');
  }

  // 4. Seed graph embeddings (requires TEI)
  console.log('\n[4/4] Seeding graph embeddings...');
  try {
    const { QdrantClient } = require('@qdrant/js-client-rest');
    const { INeedQdrantCollections } = require('../src/services/qdrant/ineed-collections');
    const teiService = require('../src/services/tei.service');

    const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
    const qdrantClient = new QdrantClient({ url: qdrantUrl });
    const collections = new INeedQdrantCollections(qdrantClient);

    const count = await collections.seedGraphEmbeddings(teiService);
    console.log(`  OK: ${count} graphs embedded`);
  } catch (err) {
    console.error(`  SKIP: ${err.message}`);
    console.log('  (TEI may not be running — embeddings can be added later)');
  }

  console.log('\n=== Seeding complete ===');

  // Give services time to flush
  setTimeout(() => process.exit(0), 1000);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
