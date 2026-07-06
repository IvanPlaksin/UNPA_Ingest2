'use strict';
/**
 * Document Index — Qdrant sync for the OPTIONAL semantic search path.
 *
 * Owns the dedicated `source_documents` collection (the "separate KB section"
 * for source-document metadata). One point per SourceDocument: a dense TEI
 * embedding of its title/description/abstract plus facet payload. Keyword +
 * facet search lives in Memgraph (document-index.search.js); this module only
 * powers semantic ("find documents about X") search.
 *
 * Embedding is opt-in (config): when semantic indexing is off, points are still
 * upserted (facet payload) with a placeholder vector so facet filtering works,
 * but no TEI calls are made.
 */

const qdrant = require('../qdrant.service');
const tei    = require('../tei.service');

const COLLECTION  = 'source_documents';
const VECTOR_SIZE = 1024; // multilingual-e5-large, matches the rest of the project

let _ready = false;

// Placeholder unit vector (Cosine rejects zero vectors) for un-embedded points.
function placeholderVector() {
  const v = new Array(VECTOR_SIZE).fill(0);
  v[0] = 1;
  return v;
}

async function ensureCollection() {
  if (_ready) return;
  const client = qdrant.client;
  const existing = await client.getCollections();
  const exists = existing.collections.some(c => c.name === COLLECTION);
  if (!exists) {
    await client.createCollection(COLLECTION, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine', on_disk: true },
      optimizers_config: { indexing_threshold: 20000 },
    });
    const keywordFields = ['sourceId', 'fileType', 'enrichStatus', 'canonicalKey', 'languages', 'symbol', 'hasPdf'];
    for (const field of keywordFields) {
      try {
        await client.createPayloadIndex(COLLECTION, { field_name: field, field_schema: 'keyword' });
      } catch (err) {
        if (!/already exists/i.test(err.message || '')) {
          console.warn(`[DocIndexSync] payload index ${field}: ${err.message}`);
        }
      }
    }
    console.log(`[DocIndexSync] Created Qdrant collection '${COLLECTION}'`);
  }
  _ready = true;
}

function buildText(doc) {
  return [
    doc.title,
    doc.symbol,
    doc.description,
    doc.abstract,
    Array.isArray(doc.subjects) ? doc.subjects.join(', ') : doc.subjects,
  ].filter(Boolean).join('. ').slice(0, 4000);
}

function toPayload(doc) {
  return {
    sourceDocumentId: doc.id,
    sourceId:         doc.sourceId || '',
    sourceName:       doc.sourceName || '',
    title:            doc.title || '',
    symbol:           doc.symbol || '',
    date:             doc.date || '',
    fileType:         doc.fileType || 'unknown',
    languages:        Array.isArray(doc.languages) ? doc.languages : [],
    url:              doc.url || '',
    pdfUrl:           doc.pdfUrl || '',
    hasPdf:           !!(doc.pdfUrl && doc.pdfUrl.length),
    enrichStatus:     doc.enrichStatus || 'none',
    canonicalKey:     doc.canonicalKey || '',
  };
}

/**
 * Upsert SourceDocument metadata into the semantic collection.
 * @param {object[]} docs  canonical doc objects (id, title, ...)
 * @param {{embed?: boolean}} opts  embed=true → real TEI vectors
 */
async function upsertDocs(docs, { embed = true } = {}) {
  if (!docs || !docs.length) return 0;
  await ensureCollection();

  let vectors;
  if (embed) {
    const texts = docs.map(buildText);
    vectors = await tei.getEmbeddings(texts);
  } else {
    vectors = docs.map(() => null);
  }

  const points = docs.map((doc, i) => ({
    id:      doc.id,
    vector:  (vectors[i] && Array.isArray(vectors[i])) ? vectors[i] : placeholderVector(),
    payload: toPayload(doc),
  }));

  await qdrant.client.upsert(COLLECTION, { wait: true, points });
  return points.length;
}

function buildFilter(opts = {}) {
  const must = [];
  if (opts.sourceId)     must.push({ key: 'sourceId',     match: { value: opts.sourceId } });
  if (opts.fileType)     must.push({ key: 'fileType',     match: { value: opts.fileType } });
  if (opts.enrichStatus) must.push({ key: 'enrichStatus', match: { value: opts.enrichStatus } });
  if (opts.language)     must.push({ key: 'languages',    match: { value: opts.language } });
  if (opts.hasPdf)       must.push({ key: 'hasPdf',       match: { value: true } });
  return must.length ? { must } : null;
}

/**
 * Semantic search → [{ id, score }]. Embeds the query, vector-searches Qdrant.
 */
async function semanticSearch(q, filters = {}, limit = 30) {
  await ensureCollection();
  const vector = await tei.getEmbedding(q);
  if (!vector || !Array.isArray(vector)) throw new Error('embedding unavailable');

  const results = await qdrant.client.search(COLLECTION, {
    vector,
    limit,
    filter: buildFilter(filters),
    with_payload: true,
  });
  return (results || []).map(r => ({ id: r.payload?.sourceDocumentId || String(r.id), score: r.score }));
}

async function deleteBySource(sourceId) {
  await ensureCollection();
  await qdrant.client.delete(COLLECTION, {
    wait: true,
    filter: { must: [{ key: 'sourceId', match: { value: sourceId } }] },
  });
}

async function stats() {
  try {
    const info = await qdrant.client.getCollection(COLLECTION);
    return { exists: true, collection: COLLECTION, pointsCount: info.points_count || 0, status: info.status };
  } catch {
    return { exists: false, collection: COLLECTION, pointsCount: 0 };
  }
}

module.exports = { COLLECTION, ensureCollection, upsertDocs, semanticSearch, deleteBySource, stats, buildText };
