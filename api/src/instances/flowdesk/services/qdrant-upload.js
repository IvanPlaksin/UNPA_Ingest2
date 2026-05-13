'use strict';

/**
 * TASK-FLOWDESK-004 Phases 3+4: Generate embeddings via TEI and upload to Qdrant.
 *
 * Reads utterances.json → generates embeddings via TEI → creates Qdrant collection → uploads.
 *
 * Usage: node api/src/services/flowdesk/qdrant-upload.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const UTTERANCES_FILE = path.join(DATA_DIR, 'utterances.json');

const TEI_URL = process.env.TEI_URL || 'http://localhost:8081';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'flowdesk_services';

// ─── TEI Embedding ───

async function generateEmbeddings(texts, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(`${TEI_URL}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: texts }),
      });
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`TEI ${resp.status}: ${body.slice(0, 200)}`);
      }
      return await resp.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

// ─── Qdrant Helpers ───

async function qdrantRequest(method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${QDRANT_URL}${path}`, opts);
  const data = await resp.json();
  if (data.status && data.status.error) throw new Error(data.status.error);
  return data;
}

async function createCollection(vectorSize) {
  // Delete if exists
  try {
    await qdrantRequest('DELETE', `/collections/${COLLECTION_NAME}`);
    console.log('  Deleted existing collection');
  } catch { /* doesn't exist */ }

  await qdrantRequest('PUT', `/collections/${COLLECTION_NAME}`, {
    vectors: { size: vectorSize, distance: 'Cosine' },
    optimizers_config: { indexing_threshold: 0 },
  });
  console.log(`  Created collection: ${COLLECTION_NAME} (dim: ${vectorSize})`);

  // Create payload indexes
  for (const field of ['service_code', 'domain_code', 'lang', 'category']) {
    await qdrantRequest('PUT', `/collections/${COLLECTION_NAME}/index`, {
      field_name: field,
      field_schema: 'keyword',
    });
  }
  console.log('  Created payload indexes: service_code, domain_code, lang, category');
}

async function uploadPoints(points, batchSize = 100) {
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    await qdrantRequest('PUT', `/collections/${COLLECTION_NAME}/points`, {
      points: batch,
    });
    if ((i + batchSize) % 500 < batchSize || i + batchSize >= points.length) {
      console.log(`  Uploaded: ${Math.min(i + batchSize, points.length)}/${points.length}`);
    }
  }
}

// ─── Main ───

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Embed Utterances & Upload to Qdrant             ║');
  console.log('╚══════════════════════════════════════════════════╝');

  // Load utterances
  const data = JSON.parse(fs.readFileSync(UTTERANCES_FILE, 'utf-8'));
  const serviceCodes = Object.keys(data);
  console.log(`  Services: ${serviceCodes.length}`);

  // Flatten all utterances
  const allUtterances = [];
  for (const code of serviceCodes) {
    const entry = data[code];
    for (const utt of entry.utterances) {
      allUtterances.push({
        text: utt.text,
        lang: utt.lang || 'en',
        service_code: code,
        service_name: entry.service.name,
        domain_code: entry.service.domain_code,
        category: entry.service.category,
      });
    }
  }
  console.log(`  Total utterances: ${allUtterances.length}`);

  // Phase 3: Generate embeddings
  console.log('\n── Phase 3: Generate Embeddings via TEI ──');
  const TEI_BATCH = 32;
  const embeddings = [];
  const startTime = Date.now();

  for (let i = 0; i < allUtterances.length; i += TEI_BATCH) {
    const batch = allUtterances.slice(i, i + TEI_BATCH);
    const texts = batch.map(u => u.text);

    try {
      const vectors = await generateEmbeddings(texts);
      for (let j = 0; j < batch.length; j++) {
        embeddings.push({ ...batch[j], embedding: vectors[j] });
      }
    } catch (err) {
      console.log(`  ERROR at batch ${i}: ${err.message}`);
      // Skip failed batch, fill with nulls
      for (const u of batch) {
        embeddings.push({ ...u, embedding: null });
      }
    }

    if ((i + TEI_BATCH) % 100 < TEI_BATCH || i + TEI_BATCH >= allUtterances.length) {
      console.log(`  Embedded: ${Math.min(i + TEI_BATCH, allUtterances.length)}/${allUtterances.length}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const validEmbeddings = embeddings.filter(e => e.embedding);
  const vectorDim = validEmbeddings[0]?.embedding?.length || 0;
  console.log(`  Dimension: ${vectorDim}`);
  console.log(`  Valid embeddings: ${validEmbeddings.length}/${embeddings.length}`);
  console.log(`  Time: ${elapsed}s`);

  // Phase 4: Create Qdrant collection and upload
  console.log('\n── Phase 4: Upload to Qdrant ──');
  await createCollection(vectorDim);

  // Build points
  const points = validEmbeddings.map((e, idx) => ({
    id: idx,
    vector: e.embedding,
    payload: {
      text: e.text,
      lang: e.lang,
      service_code: e.service_code,
      service_name: e.service_name,
      domain_code: e.domain_code,
      category: e.category,
    },
  }));

  await uploadPoints(points);

  // Verify
  const info = await qdrantRequest('GET', `/collections/${COLLECTION_NAME}`);
  console.log('\n── Collection Info ──');
  console.log(`  Points: ${info.result?.points_count}`);
  console.log(`  Vectors: ${info.result?.vectors_count}`);
  console.log(`  Status: ${info.result?.status}`);

  // Language distribution
  const byLang = {};
  validEmbeddings.forEach(e => { byLang[e.lang] = (byLang[e.lang] || 0) + 1; });
  console.log('  By language:');
  Object.entries(byLang).sort((a, b) => b[1] - a[1]).forEach(([lang, cnt]) => {
    console.log(`    ${lang}: ${cnt}`);
  });

  console.log('\nDone.');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
