/**
 * INeedQdrantCollections
 *
 * Creates and manages Qdrant collections for the iNeed platform:
 * - business_process_graphs: Graph intent matching
 * - un_inventory: Equipment and workspace search
 * - ineed_sr_history: Service request history for knowledge reuse
 */

const VECTOR_SIZE = 1024; // multilingual-e5-large

class INeedQdrantCollections {
  /**
   * @param {Object} qdrantClient - QdrantClient instance
   */
  constructor(qdrantClient) {
    this._client = qdrantClient;
  }

  /**
   * Create all iNeed collections
   * @returns {Promise<string[]>} - Created collection names
   */
  async createCollections() {
    const created = [];

    // 1. Business Process Graphs — intent-based graph matching
    await this._createIfNotExists('business_process_graphs', {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
    });
    await this._createPayloadIndex('business_process_graphs', 'graph_id', 'keyword');
    await this._createPayloadIndex('business_process_graphs', 'category', 'keyword');
    await this._createPayloadIndex('business_process_graphs', 'is_active', 'bool');
    created.push('business_process_graphs');

    // 2. UN Inventory — equipment + workspaces
    await this._createIfNotExists('un_inventory', {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
    });
    await this._createPayloadIndex('un_inventory', 'item_id', 'keyword');
    await this._createPayloadIndex('un_inventory', 'type', 'keyword');
    await this._createPayloadIndex('un_inventory', 'status', 'keyword');
    await this._createPayloadIndex('un_inventory', 'location', 'keyword');
    created.push('un_inventory');

    // 3. SR History — knowledge reuse from past requests
    await this._createIfNotExists('ineed_sr_history', {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
    });
    await this._createPayloadIndex('ineed_sr_history', 'sr_id', 'keyword');
    await this._createPayloadIndex('ineed_sr_history', 'category', 'keyword');
    await this._createPayloadIndex('ineed_sr_history', 'duty_station', 'keyword');
    await this._createPayloadIndex('ineed_sr_history', 'status', 'keyword');
    created.push('ineed_sr_history');

    return created;
  }

  /**
   * Seed graph embeddings for intent matching
   * @param {Object} teiService - TEI embedding service
   * @returns {Promise<number>} - Number of graphs embedded
   */
  async seedGraphEmbeddings(teiService) {
    const graphs = [
      {
        id: 'INEED-G1-IT-HARDWARE-V1',
        text: 'IT hardware request laptop monitor phone equipment computer device new replacement upgrade broken slow',
        payload: { graph_id: 'INEED-G1-IT-HARDWARE-V1', category: 'IT', is_active: true },
      },
      {
        id: 'INEED-G2-HR-ACCESS-V1',
        text: 'HR access badge building pass security clearance ID card entry permission gate',
        payload: { graph_id: 'INEED-G2-HR-ACCESS-V1', category: 'HR', is_active: true },
      },
      {
        id: 'INEED-G3-FACILITIES-WORKSPACE-V1',
        text: 'Facilities workspace office desk room seat workstation relocation move new team member',
        payload: { graph_id: 'INEED-G3-FACILITIES-WORKSPACE-V1', category: 'Facilities', is_active: true },
      },
    ];

    let count = 0;
    for (const g of graphs) {
      try {
        const embedding = await teiService.embed(g.text);
        const vector = Array.isArray(embedding) ? embedding : (embedding?.embedding || embedding?.data?.[0]?.embedding || []);

        if (vector.length === 0) {
          console.warn(`[INeedQdrant] Empty embedding for ${g.id}`);
          continue;
        }

        await this._client.upsert('business_process_graphs', {
          wait: true,
          points: [{
            id: count + 1, // Qdrant needs numeric or UUID
            vector,
            payload: { ...g.payload, text: g.text },
          }],
        });
        count++;
      } catch (err) {
        console.warn(`[INeedQdrant] Failed to embed ${g.id}: ${err.message}`);
      }
    }

    return count;
  }

  /**
   * Create collection if it doesn't exist
   * @private
   */
  async _createIfNotExists(name, config) {
    try {
      const result = await this._client.getCollections();
      const exists = result.collections.some(c => c.name === name);
      if (exists) {
        console.log(`[INeedQdrant] Collection ${name} already exists`);
        return;
      }
    } catch {
      // getCollections might fail — try creating anyway
    }

    try {
      await this._client.createCollection(name, config);
      console.log(`[INeedQdrant] Collection ${name} created`);
    } catch (err) {
      if (err.message?.includes('already exists')) {
        console.log(`[INeedQdrant] Collection ${name} already exists`);
      } else {
        console.warn(`[INeedQdrant] Failed to create ${name}: ${err.message}`);
      }
    }
  }

  /**
   * Create payload index
   * @private
   */
  async _createPayloadIndex(collectionName, fieldName, fieldType) {
    try {
      await this._client.createPayloadIndex(collectionName, {
        field_name: fieldName,
        field_schema: fieldType,
      });
    } catch {
      // Index might already exist — that's OK
    }
  }
}

module.exports = { INeedQdrantCollections };
