'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const qdrant = require('../src/services/qdrant.service');
const tei    = require('../src/services/tei.service');

async function run() {
  // Get actual vector size from TEI
  const vecs = await tei.getEmbeddings(['test']);
  const actualSize = vecs[0].length;
  console.log('Actual TEI vector size:', actualSize);

  // Check existing documents_entities collection
  try {
    const info = await qdrant.client.getCollection('documents_entities');
    const storedSize = info?.config?.params?.vectors?.size || info?.vectorsConfig?.size;
    console.log('documents_entities collection config:', JSON.stringify({
      stored_size: storedSize,
      vectors_config: info?.config?.params?.vectors
    }, null, 2));

    if (storedSize && storedSize !== actualSize) {
      console.log(`⚠️  SIZE MISMATCH: collection=${storedSize}, TEI=${actualSize}`);
      console.log('Need to recreate collection with correct size');
    } else {
      console.log('✅ Size matches or not determinable');
    }
  } catch (e) {
    console.error('Could not check collection:', e.message);
  }
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
