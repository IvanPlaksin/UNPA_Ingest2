const { ChromaClient } = require('chromadb');
const CONFIG = require('../config');

class ChromaService {
    constructor() {
        this.client = new ChromaClient({ path: CONFIG.chroma.url });
        this.collectionName = "ado_knowledge_base";
    }

    async initCollection() {
        return await this.client.getOrCreateCollection({
            name: this.collectionName,
            metadata: { "description": "Knowledge Base for ADO Attachments" }
        });
    }

    /**
     * Saves vectors to ChromaDB.
     * @param {Array} chunks [{ id, text, metadata, vector }]
     */
    async saveVectors(chunks) {
        const collection = await this.initCollection();

        if (!chunks || chunks.length === 0) return;

        const ids = chunks.map(c => c.id);
        const embeddings = chunks.map(c => c.vector);
        const metadatas = chunks.map(c => c.metadata);
        const documents = chunks.map(c => c.text);

        await collection.add({
            ids,
            embeddings,
            metadatas,
            documents
        });
    }

    /**
     * Queries vectors by similarity.
     * @param {Array} queryVector 
     * @param {number} nResults 
     * @returns {Promise<Array>}
     */
    async queryVectors(queryVector, nResults = 10) {
        const collection = await this.initCollection();
        const results = await collection.query({
            queryEmbeddings: [queryVector],
            nResults: nResults
        });
        return results;
    }
}

module.exports = new ChromaService();
