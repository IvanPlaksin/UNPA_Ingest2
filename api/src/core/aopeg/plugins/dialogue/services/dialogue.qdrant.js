/**
 * Dialogue Qdrant Service
 * Manages the `dialogue_embeddings` collection with named vectors
 * for semantic search over dialogue sessions and segments.
 *
 * pgvector backend: named vectors (summary/content) are stored as separate rows
 * with `_vectorType` payload discriminator. IDs are suffixed: `${id}_summary`, `${id}_content`.
 */

const COLLECTION_NAME = 'dialogue_embeddings';

// ─── Qdrant implementation ─────────────────────────────────────────────────────

class DialogueQdrantServiceQdrant {
  constructor() {
    const { QdrantClient } = require('@qdrant/js-client-rest');
    this.client = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
    this._initialized = false;
  }

  async initCollection() {
    if (this._initialized) return;
    try {
      const { collections } = await this.client.getCollections();
      if (!collections.some(c => c.name === COLLECTION_NAME)) {
        await this.client.createCollection(COLLECTION_NAME, {
          vectors: {
            summary: { size: 1024, distance: 'Cosine' },
            content: { size: 1024, distance: 'Cosine' },
          },
          sparse_vectors: { bm25: { modifier: 'idf' } },
          optimizers_config: { indexing_threshold: 5000 },
        });
        for (const f of ['platform', 'participant', 'node_type', 'namespace', 'sessionId', 'timestamp']) {
          await this.client.createPayloadIndex(COLLECTION_NAME, {
            field_name: f,
            field_schema: f === 'timestamp' ? 'datetime' : 'keyword',
          }).catch(() => {});
        }
      }
      this._initialized = true;
    } catch (err) {
      console.warn(`[DialogueQdrant] Init failed (non-fatal): ${err.message}`);
    }
  }

  async upsertPoints(points) {
    if (!this._initialized) await this.initCollection();
    await this.client.upsert(COLLECTION_NAME, {
      points: points.map(p => ({
        id: p.id,
        vector: {
          ...(p.summaryVector ? { summary: p.summaryVector } : {}),
          ...(p.contentVector ? { content: p.contentVector } : {}),
        },
        payload: p.payload,
      })),
    });
  }

  async search(vector, vectorName = 'summary', filter = null, topK = 10) {
    if (!this._initialized) await this.initCollection();
    const query = { vector: { name: vectorName, vector }, limit: topK, with_payload: true };
    if (filter) query.filter = filter;
    return this.client.search(COLLECTION_NAME, query);
  }

  getCollectionName() { return COLLECTION_NAME; }
}

// ─── pgvector implementation ───────────────────────────────────────────────────
// Named vectors → separate rows with _vectorType discriminator in payload.
// Row IDs: `${originalId}_summary` / `${originalId}_content`

class DialogueQdrantServicePgvector {
  constructor() {
    const { PgvectorAdapter } = require('../../../../../services/storage/adapters/PgvectorAdapter');
    this._adapter = new PgvectorAdapter();
  }

  async initCollection() {
    await this._adapter.initCollectionForNamespace(COLLECTION_NAME);
  }

  async upsertPoints(points) {
    const rows = [];
    for (const p of points) {
      if (p.summaryVector) {
        rows.push({
          id: `${p.id}_summary`,
          vector: p.summaryVector,
          payload: { ...p.payload, _vectorType: 'summary', _originalId: p.id },
        });
      }
      if (p.contentVector) {
        rows.push({
          id: `${p.id}_content`,
          vector: p.contentVector,
          payload: { ...p.payload, _vectorType: 'content', _originalId: p.id },
        });
      }
    }
    if (rows.length > 0) await this._adapter.upsertPoints(rows, COLLECTION_NAME);
  }

  async search(vector, vectorName = 'summary', filter = null, topK = 10) {
    // Add _vectorType filter to match the named vector
    const typeFilter = { must: [{ key: '_vectorType', match: { value: vectorName } }] };
    if (filter?.must) typeFilter.must.push(...filter.must);
    const results = await this._adapter.searchSimilar(vector, topK, typeFilter, COLLECTION_NAME);
    // Restore original IDs and format like Qdrant response
    return results.map(r => ({
      id: r.payload._originalId || r.id,
      score: r.score,
      payload: r.payload,
      version: 0,
    }));
  }

  getCollectionName() { return COLLECTION_NAME; }
}

// ─── Factory ───────────────────────────────────────────────────────────────────

const DialogueQdrantService = process.env.VECTOR_DB_BACKEND === 'pgvector'
  ? DialogueQdrantServicePgvector
  : DialogueQdrantServiceQdrant;

const dialogueQdrantService = new DialogueQdrantService();
module.exports = { DialogueQdrantService, dialogueQdrantService };
