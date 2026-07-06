'use strict';
/**
 * Recreate documents_entities Qdrant collection with correct vector size (1024).
 * Safe to run: deletes and recreates the collection.
 * If there were vectors in this collection, they will be lost — re-run extraction.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const qdrant = require('../src/services/qdrant.service');

const COLLECTION = 'documents_entities';
const VECTOR_SIZE = 1024;

async function run() {
  // Check current state
  try {
    const info = await qdrant.client.getCollection(COLLECTION);
    const size = info?.config?.params?.vectors?.size;
    console.log(`Current '${COLLECTION}' vector size: ${size}`);
    if (size === VECTOR_SIZE) {
      console.log('✅ Already correct size, no action needed');
      return;
    }
    const count = await qdrant.client.count(COLLECTION);
    console.log(`Points in collection: ${count?.count}`);
    if (count?.count > 0) {
      console.log('⚠️  Collection has data — deleting and recreating...');
    }
  } catch (e) {
    console.log('Collection does not exist or error:', e.message);
  }

  // Delete existing collection
  try {
    await qdrant.client.deleteCollection(COLLECTION);
    console.log(`Deleted '${COLLECTION}'`);
  } catch (e) {
    console.log('Delete failed (maybe did not exist):', e.message);
  }

  // Recreate with correct size
  await qdrant.client.createCollection(COLLECTION, {
    vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
    optimizers_config: { default_segment_number: 2 },
  });
  console.log(`Created '${COLLECTION}' with vector size ${VECTOR_SIZE}`);

  // Create payload indexes
  const fields = [
    'documentId', 'type', 'epistemicLayer', 'memgraphNodeLabel', 'knowledgeFamily',
    'extractionJobId', 'methodologyId', 'graphNodeId', 'vectorType', 'sourceDocumentId',
  ];
  for (const field of fields) {
    await qdrant.client.createPayloadIndex(COLLECTION, {
      field_name: field, field_schema: 'keyword',
    }).catch(e => console.warn(`Index ${field}: ${e.message}`));
  }
  console.log(`Created ${fields.length} payload indexes`);
  console.log('✅ Done. Re-run extraction to populate vectors.');
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
