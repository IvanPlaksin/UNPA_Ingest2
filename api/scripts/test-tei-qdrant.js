'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const qdrant = require('../src/services/qdrant.service');
const tei    = require('../src/services/tei.service');

async function run() {
  console.log('=== Qdrant Service ===');
  console.log('type:', typeof qdrant);
  console.log('has client:', typeof qdrant?.client);
  console.log('keys:', Object.keys(qdrant || {}));

  console.log('\n=== TEI Service ===');
  console.log('type:', typeof tei);
  console.log('has getEmbeddings:', typeof tei?.getEmbeddings);
  console.log('keys:', Object.keys(tei || {}));

  console.log('\n=== TEI test call ===');
  try {
    const vecs = await tei.getEmbeddings(['Security Council Resolution chemical weapons Syria']);
    console.log('OK: length=', vecs?.length, 'vector_size=', vecs?.[0]?.length);
  } catch (e) {
    console.error('TEI FAILED:', e.message);
  }

  console.log('\n=== Qdrant collections ===');
  try {
    const cols = await qdrant.client?.getCollections?.();
    console.log('collections:', JSON.stringify(cols?.collections?.map(c => c.name)));
  } catch (e) {
    console.error('Qdrant FAILED:', e.message);
  }
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
