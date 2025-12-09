const { ChromaClient } = require('chromadb');

// URL ChromaDB внутри Docker сети
const CHROMA_URL = process.env.CHROMA_URL || "http://chroma:8000";
const client = new ChromaClient({ path: CHROMA_URL });

const COLLECTION_NAME = "ado_master_data";

async function initCollection() {
    console.log(`[Vector Store] Подключение к ChromaDB по ${CHROMA_URL}...`);
    // Удаляем старую коллекцию для чистоты эксперимента (в проде так не делать!)
    try {
        await client.deleteCollection({ name: COLLECTION_NAME });
    } catch (e) { }

    return await client.getOrCreateCollection({
        name: COLLECTION_NAME,
        metadata: { "description": "Master Data for ADO Project Context" }
    });
}

/**
 * Сохраняет документы в векторную базу
 * @param {Array} documents - массив объектов { id, text, metadata }
 * @param {Array} embeddings - массив векторов (от Ollama/Gemini)
 */
async function saveVectors(documents, embeddings) {
    const collection = await initCollection();

    const ids = documents.map(d => d.id);
    const texts = documents.map(d => d.text);
    const metadatas = documents.map(d => d.metadata);

    console.log(`[Vector Store] Сохранение ${ids.length} векторов...`);

    await collection.add({
        ids: ids,
        embeddings: embeddings,
        metadatas: metadatas,
        documents: texts
    });

    console.log(`[Vector Store] Успешно сохранено.`);
}

module.exports = { saveVectors };
