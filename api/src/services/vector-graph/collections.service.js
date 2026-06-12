'use strict';

let _qdrant;
function qdrant() { if (!_qdrant) _qdrant = require('../qdrant.service'); return _qdrant; }

const LOG = '[VectorCollections]';
const VECTOR_SIZE = 384;

/**
 * Three-collection architecture for VectorGraphSync (P4-002).
 *
 * doc_chunks  — Document chunks (future: when chunked doc vectorization is added)
 * entities    — EntityMention + Draft nodes (per-extraction vectors)
 * canonical   — ESEntity nodes (canonical/deduplicated knowledge)
 *
 * Each collection has a specific payload schema and filter indexes.
 */
const COLLECTION_SPECS = {
  doc_chunks: {
    description: 'Document chunk vectors',
    indexes: ['documentId', 'graphNodeId', 'extractionJobId', 'methodologyId', 'vectorType'],
  },
  entities: {
    description: 'EntityMention and Draft entity vectors',
    indexes: ['documentId', 'graphNodeId', 'extractionJobId', 'methodologyId',
              'vectorType', 'type', 'epistemicLayer', 'knowledgeFamily'],
  },
  canonical: {
    description: 'ESEntity canonical knowledge vectors',
    indexes: ['graphNodeId', 'vectorType', 'type', 'epistemicLayer', 'namespace'],
  },
};

// Track which collections are confirmed to exist (avoid repeated API calls)
const _ensuredCollections = new Set();

class VectorGraphCollectionService {

  /**
   * Ensure a named collection exists, creating it if needed.
   * Idempotent and fast after first call (in-memory cache).
   */
  async ensure(name) {
    if (_ensuredCollections.has(name)) return;

    const spec = COLLECTION_SPECS[name];
    if (!spec) {
      // Unknown collection — create with minimal indexes
      await this._createIfMissing(name, ['graphNodeId', 'vectorType', 'documentId']);
      _ensuredCollections.add(name);
      return;
    }

    await this._createIfMissing(name, spec.indexes);
    _ensuredCollections.add(name);
  }

  async _createIfMissing(name, indexes = []) {
    try {
      const client = qdrant().client;
      if (!client) return;

      const exists = await client.getCollection(name).then(() => true).catch(() => false);
      if (exists) return;

      await client.createCollection(name, {
        vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
        optimizers_config: { default_segment_number: 2 },
      });
      console.log(`${LOG} Created collection '${name}'`);

      for (const field of indexes) {
        await client.createPayloadIndex(name, {
          field_name: field, field_schema: 'keyword',
        }).catch(() => {});
      }
      console.log(`${LOG} Indexes created for '${name}': ${indexes.join(', ')}`);
    } catch (err) {
      console.warn(`${LOG} _createIfMissing failed for '${name}': ${err.message}`);
    }
  }

  /** List all vector-graph collections with stats */
  async listCollections() {
    try {
      const client = qdrant().client;
      if (!client) return [];
      const result = await client.getCollections();
      const known  = new Set(Object.keys(COLLECTION_SPECS));
      return (result.collections || [])
        .filter(c => known.has(c.name) || c.name.startsWith('workspace_'))
        .map(c => ({
          name:        c.name,
          known:       known.has(c.name),
          description: COLLECTION_SPECS[c.name]?.description || null,
        }));
    } catch (e) {
      return [];
    }
  }

  /**
   * Migrate existing 'documents_entities' points into the new 'entities' collection.
   * Non-destructive — only copies; old collection remains until explicitly deleted.
   */
  async migrateFromLegacy({ dryRun = false } = {}) {
    const LEGACY = 'documents_entities';
    const TARGET = 'entities';
    const client  = qdrant().client;
    if (!client) throw new Error('Qdrant client not available');

    const legacyExists = await client.getCollection(LEGACY).then(() => true).catch(() => false);
    if (!legacyExists) {
      return { migrated: 0, skipped: 0, dryRun, reason: `Legacy '${LEGACY}' does not exist` };
    }

    await this.ensure(TARGET);

    let offset = null;
    let migrated = 0;

    while (true) {
      const scrollRes = await client.scroll(LEGACY, {
        limit: 100,
        offset,
        with_payload: true,
        with_vector: true,
      });

      const points = scrollRes.points || [];
      if (points.length === 0) break;

      if (!dryRun) {
        await client.upsert(TARGET, {
          wait: true,
          points: points.map(p => ({
            id:      p.id,
            vector:  p.vector,
            payload: {
              ...p.payload,
              graphNodeId: p.payload?.graphNodeId || p.payload?.memgraphNodeId || p.id,
              vectorType:  p.payload?.vectorType  || 'entity_mention',
              migratedFrom: LEGACY,
            },
          })),
        });
      }

      migrated += points.length;
      offset = scrollRes.next_page_offset;
      if (!offset) break;
    }

    console.log(`${LOG} Migration: ${migrated} points → '${TARGET}' (dryRun=${dryRun})`);
    return { migrated, dryRun, source: LEGACY, target: TARGET };
  }
}

const vectorGraphCollectionService = new VectorGraphCollectionService();
module.exports = { vectorGraphCollectionService, VectorGraphCollectionService, COLLECTION_SPECS };
