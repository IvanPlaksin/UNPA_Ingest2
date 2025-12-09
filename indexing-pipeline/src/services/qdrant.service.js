const { QdrantClient } = require('@qdrant/js-client-rest');
const { v4: uuidv4 } = require('uuid');

const QDRANT_URL = process.env.QDRANT_URL || 'http://qdrant:6333';
const COLLECTION_NAME = 'ado_knowledge_base';
const VECTOR_SIZE = 1024; // multilingual-e5-large

class QdrantService {
    constructor() {
        this.client = new QdrantClient({ url: QDRANT_URL });
    }

    /**
     * Initializes the collection if it doesn't exist.
     */
    async initCollection() {
        try {
            const result = await this.client.getCollections();
            const exists = result.collections.some((c) => c.name === COLLECTION_NAME);

            if (!exists) {
                await this.client.createCollection(COLLECTION_NAME, {
                    vectors: {
                        size: VECTOR_SIZE,
                        distance: 'Cosine',
                    },
                });
                console.log(`Collection '${COLLECTION_NAME}' created.`);
            } else {
                console.log(`Collection '${COLLECTION_NAME}' already exists.`);
            }
        } catch (error) {
            console.error('Error initializing collection:', error);
            throw error;
        }
    }

    /**
     * Upserts points into the collection.
     * @param {Array<{id: string|number, vector: number[], payload: object}>} points
     */
    async upsertPoints(points) {
        try {
            // Ensure IDs are present, generate UUIDs if missing
            const pointsWithIds = points.map(p => ({
                ...p,
                id: p.id || uuidv4()
            }));

            await this.client.upsert(COLLECTION_NAME, {
                wait: true,
                points: pointsWithIds,
            });
            console.log(`Upserted ${points.length} points.`);
        } catch (error) {
            console.error('Error upserting points:', error);
            throw error;
        }
    }

    /**
     * Searches for similar vectors.
     * @param {number[]} vector - Query vector.
     * @param {number} limit - Number of results to return.
     * @param {object} filter - Qdrant filter object.
     * @returns {Promise<Array>} - Array of search results.
     */
    async searchSimilar(vector, limit = 5, filter = null) {
        try {
            const searchParams = {
                vector: vector,
                limit: limit,
                with_payload: true
            };

            if (filter) {
                searchParams.filter = filter;
            }

            const result = await this.client.search(COLLECTION_NAME, searchParams);
            return result;
        } catch (error) {
            console.error('Error searching similar vectors:', error);
            throw error;
        }
    }
}

module.exports = new QdrantService();
