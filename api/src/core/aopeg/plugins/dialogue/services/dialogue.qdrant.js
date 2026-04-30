/**
 * Dialogue Qdrant Service
 * Manages the `dialogue_embeddings` collection with named vectors
 * for semantic search over dialogue sessions and segments.
 */

const { QdrantClient } = require('@qdrant/js-client-rest');

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'dialogue_embeddings';
const VECTOR_SIZE = 1024; // multilingual-e5-large

class DialogueQdrantService {
  constructor() {
    this.client = new QdrantClient({ url: QDRANT_URL });
    this._initialized = false;
  }

  /**
   * Initialize collection if it does not exist.
   * Named vectors: `summary` (session/segment summaries) + `content` (raw chunks)
   * Sparse vector: `bm25` for full-text keyword search
   */
  async initCollection() {
    if (this._initialized) return;

    try {
      const { collections } = await this.client.getCollections();
      const exists = collections.some(c => c.name === COLLECTION_NAME);

      if (!exists) {
        await this.client.createCollection(COLLECTION_NAME, {
          vectors: {
            summary: { size: VECTOR_SIZE, distance: 'Cosine' },
            content: { size: VECTOR_SIZE, distance: 'Cosine' },
          },
          sparse_vectors: {
            bm25: { modifier: 'idf' },
          },
          optimizers_config: { indexing_threshold: 5000 },
        });

        await this._createPayloadIndexes();
        console.log(`[DialogueQdrant] Collection '${COLLECTION_NAME}' created`);
      } else {
        console.log(`[DialogueQdrant] Collection '${COLLECTION_NAME}' already exists`);
      }

      this._initialized = true;
    } catch (err) {
      console.warn(`[DialogueQdrant] Init failed (non-fatal): ${err.message}`);
    }
  }

  async _createPayloadIndexes() {
    const indexes = [
      { field_name: 'platform', field_schema: 'keyword' },
      { field_name: 'participant', field_schema: 'keyword' },
      { field_name: 'node_type', field_schema: 'keyword' },
      { field_name: 'namespace', field_schema: 'keyword' },
      { field_name: 'sessionId', field_schema: 'keyword' },
      { field_name: 'timestamp', field_schema: 'datetime' },
    ];

    for (const idx of indexes) {
      try {
        await this.client.createPayloadIndex(COLLECTION_NAME, idx);
      } catch (err) {
        if (!err.message?.includes('already exists')) {
          console.warn(`[DialogueQdrant] Index warning (${idx.field_name}): ${err.message}`);
        }
      }
    }
  }

  /**
   * Upsert points with named vectors
   * @param {Array<{id, summaryVector?, contentVector?, payload}>} points
   */
  async upsertPoints(points) {
    if (!this._initialized) await this.initCollection();

    const qdrantPoints = points.map(p => ({
      id: p.id,
      vector: {
        ...(p.summaryVector ? { summary: p.summaryVector } : {}),
        ...(p.contentVector ? { content: p.contentVector } : {}),
      },
      payload: p.payload,
    }));

    await this.client.upsert(COLLECTION_NAME, { points: qdrantPoints });
  }

  /**
   * Search by named vector
   * @param {number[]} vector - Query embedding
   * @param {'summary'|'content'} vectorName - Which vector to search
   * @param {object} filter - Qdrant filter
   * @param {number} topK - Number of results
   */
  async search(vector, vectorName = 'summary', filter = null, topK = 10) {
    if (!this._initialized) await this.initCollection();

    const query = {
      vector: { name: vectorName, vector },
      limit: topK,
      with_payload: true,
    };
    if (filter) query.filter = filter;

    const result = await this.client.search(COLLECTION_NAME, query);
    return result;
  }

  getCollectionName() {
    return COLLECTION_NAME;
  }
}

const dialogueQdrantService = new DialogueQdrantService();
module.exports = { DialogueQdrantService, dialogueQdrantService };
