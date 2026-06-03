'use strict';

/**
 * DialogueKnowledgeQdrant
 * Manages the `knowledge_entities` Qdrant collection.
 *
 * Each point = one unique knowledge entity (technology / component / concept / decision).
 * Vectors encode contextual meaning: "{type}: {name} — {contextSummary}".
 * Deduplication key: entityId = deterministic UUID from name+type.
 *
 * On upsert of an existing entity:
 *   - frequency incremented
 *   - sessionIds merged (union)
 *   - contextSummary updated if richer
 */

const COLLECTION = 'knowledge_entities';
const VECTOR_DIM  = 1024;

const crypto = require('crypto');

function toEntityId(name, type) {
  return crypto
    .createHash('md5')
    .update(`${name.toLowerCase()}:${type}`)
    .digest('hex')
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

class DialogueKnowledgeQdrant {
  constructor() {
    const { QdrantClient } = require('@qdrant/js-client-rest');
    this.client = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
    this._ready = false;
  }

  async init() {
    if (this._ready) return;
    try {
      const { collections } = await this.client.getCollections();
      if (!collections.some(c => c.name === COLLECTION)) {
        await this.client.createCollection(COLLECTION, {
          vectors: { entity: { size: VECTOR_DIM, distance: 'Cosine' } },
          optimizers_config: { indexing_threshold: 1000 },
        });
        for (const [field, schema] of [
          ['name', 'keyword'], ['type', 'keyword'], ['cluster', 'integer'],
          ['frequency', 'integer'], ['lastSeenAt', 'datetime'],
        ]) {
          await this.client.createPayloadIndex(COLLECTION, {
            field_name: field, field_schema: schema,
          }).catch(() => {});
        }
        console.log('[KnowledgeQdrant] Collection created:', COLLECTION);
      }
      this._ready = true;
    } catch (err) {
      console.warn('[KnowledgeQdrant] Init failed (non-fatal):', err.message);
    }
  }

  /**
   * Upsert entity vectors.
   * @param {Array<{
   *   name: string, type: string, contextSummary: string,
   *   vector: number[], sessionId: string, confidence: number,
   *   x?: number, y?: number, z?: number, cluster?: number
   * }>} entities
   */
  async upsertEntities(entities) {
    if (!this._ready) await this.init();
    if (!entities.length) return;

    // Fetch existing payloads for these IDs to merge sessionIds + frequency
    const ids = entities.map(e => toEntityId(e.name, e.type));
    let existing = {};
    try {
      const result = await this.client.retrieve(COLLECTION, { ids, with_payload: true });
      for (const p of result) existing[p.id] = p.payload;
    } catch { /* first upsert */ }

    const now = new Date().toISOString();
    const points = entities.map((e, i) => {
      const id  = ids[i];
      const old = existing[id];
      const oldSessions = old?.sessionIds || [];
      const newSessions = e.sessionId
        ? [...new Set([...oldSessions, e.sessionId])]
        : oldSessions;
      return {
        id,
        vector: { entity: e.vector },
        payload: {
          entityId:      id,
          name:          e.name,
          type:          e.type,
          contextSummary: e.contextSummary || e.name,
          frequency:     (old?.frequency || 0) + (old ? 0 : 1),
          sessionIds:    newSessions,
          sessionCount:  newSessions.length,
          confidence:    Math.max(old?.confidence || 0, e.confidence || 0),
          lastSeenAt:    now,
          // 3D layout (filled by layout executor)
          x: e.x ?? old?.x ?? null,
          y: e.y ?? old?.y ?? null,
          z: e.z ?? old?.z ?? null,
          cluster: e.cluster ?? old?.cluster ?? null,
        },
      };
    });

    await this.client.upsert(COLLECTION, { points, wait: true });
  }

  /**
   * Increment frequency for an entity seen in a session.
   * Used when entity already exists; avoids full re-embed.
   */
  async touchEntity(name, type, sessionId) {
    if (!this._ready) await this.init();
    const id = toEntityId(name, type);
    try {
      const [existing] = await this.client.retrieve(COLLECTION, { ids: [id], with_payload: true });
      if (!existing) return;
      const p = existing.payload;
      const sessionIds = [...new Set([...(p.sessionIds || []), sessionId])];
      await this.client.setPayload(COLLECTION, {
        payload: {
          frequency:    (p.frequency || 0) + 1,
          sessionIds,
          sessionCount: sessionIds.length,
          lastSeenAt:   new Date().toISOString(),
        },
        points: [id],
      });
    } catch { /* non-fatal */ }
  }

  /**
   * Semantic search: returns nearest entities to a query vector.
   */
  async search(queryVector, { topK = 20, typeFilter = null } = {}) {
    if (!this._ready) await this.init();
    const filter = typeFilter
      ? { must: [{ key: 'type', match: { value: typeFilter } }] }
      : undefined;
    try {
      return await this.client.search(COLLECTION, {
        vector: { name: 'entity', vector: queryVector },
        limit: topK,
        with_payload: true,
        filter,
      });
    } catch (err) {
      console.warn('[KnowledgeQdrant] Search failed:', err.message);
      return [];
    }
  }

  /**
   * Get all entity payloads (paginated) — for layout and frontend listing.
   */
  async getAll({ limit = 500, offset = 0, typeFilter = null } = {}) {
    if (!this._ready) await this.init();
    const filter = typeFilter
      ? { must: [{ key: 'type', match: { value: typeFilter } }] }
      : undefined;
    try {
      const result = await this.client.scroll(COLLECTION, {
        filter,
        limit,
        offset,
        with_payload: true,
        with_vector: false,
      });
      return result.points || [];
    } catch (err) {
      console.warn('[KnowledgeQdrant] GetAll failed:', err.message);
      return [];
    }
  }

  /**
   * Get all entity vectors for layout computation.
   * Returns: Array<{ id, vector, payload }>
   */
  async getAllWithVectors({ limit = 2000 } = {}) {
    if (!this._ready) await this.init();
    try {
      const result = await this.client.scroll(COLLECTION, {
        limit,
        with_payload: true,
        with_vector: true,
      });
      return (result.points || []).map(p => ({
        id: p.id,
        vector: p.vector?.entity || [],
        payload: p.payload,
      }));
    } catch (err) {
      console.warn('[KnowledgeQdrant] GetAllWithVectors failed:', err.message);
      return [];
    }
  }

  /**
   * Batch-update xyz coordinates + cluster after UMAP layout.
   */
  async updateLayout(points) {
    if (!this._ready) await this.init();
    if (!points.length) return;
    // Update payload for each point individually (Qdrant setPayload)
    const CHUNK = 100;
    for (let i = 0; i < points.length; i += CHUNK) {
      const chunk = points.slice(i, i + CHUNK);
      await Promise.all(chunk.map(p =>
        this.client.setPayload(COLLECTION, {
          payload: { x: p.x, y: p.y, z: p.z, cluster: p.cluster ?? null },
          points: [p.id],
        }).catch(() => {})
      ));
    }
  }

  /** Count total entities in collection */
  async count() {
    if (!this._ready) await this.init();
    try {
      const info = await this.client.getCollection(COLLECTION);
      return info.points_count || 0;
    } catch { return 0; }
  }
}

const knowledgeQdrant = new DialogueKnowledgeQdrant();

module.exports = { DialogueKnowledgeQdrant, knowledgeQdrant, toEntityId, COLLECTION };
