require('dotenv').config();
const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const adoFetcher = require('./ado.fetcher');
const teiService = require('./services/tei.service');
const qdrantService = require('./services/qdrant.service');
const memgraphService = require('./services/memgraph.service');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const { getAIProvider } = require('./services/llm/ai.factory');
// New Parsers
const pdfParser = require('./services/parsers/pdf.parser');
const msgParser = require('./services/parsers/msg.parser');
const enrichmentService = require('./services/enrichment.service');
// const docxProcessor = require('./processors/docx.structure.processor'); // Disabled for now

// Redis Config
const redisOptions = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: null
};

const redisConnection = new IORedis(redisOptions);
const redisPublisher = new IORedis(redisOptions);

// Функция для отправки событий в UI
async function publishEvent(jobId, type, status, data = null) {
    const channel = `job_updates:${jobId}`;
    const message = {
        type: type,
        payload: {
            status: status, // 'running', 'completed', 'error'
            data: data
        }
    };
    await redisPublisher.publish(channel, JSON.stringify(message));
}

async function processWorkItems(job, ai, ids) {
    const jobId = job.id;

    // --- STEP 1: EXTRACTION ---
    await publishEvent(jobId, 'step_extraction', 'running');

    let items;
    try {
        items = await adoFetcher.getWorkItemsData(ids);

        // ⭐ FAIL-FAST CHECK
        if (!items || items.length === 0) {
            throw new Error("Extraction returned no items. Check IDs or permissions.");
        }

        await publishEvent(jobId, 'step_extraction', 'completed', { count: items.length, sample: items[0]?.title });
    } catch (e) {
        await publishEvent(jobId, 'step_extraction', 'error', e.message);
        throw e; // Останавливаем выполнение всей функции
    }

    const documentsToSave = [];

    // --- STEP 2: REFINING & SANITIZATION ---
    await publishEvent(jobId, 'step_refining', 'running');

    try {
        for (const item of items) {
            const rawText = `Task #${item.id}: ${item.title}. ${item.description}`;
            // Здесь можно добавить проверку на пустоту контента
            if (!rawText.trim()) {
                console.warn(`Task ${item.id} is empty, skipping refining.`);
                continue;
            }
            const cleanText = rawText;

            documentsToSave.push({
                id: `workitem_${item.id}`,
                text: cleanText,
                metadata: { type: 'WorkItem', adoId: item.id, status: 'GENERATED', title: item.title }
            });
        }

        // ⭐ FAIL-FAST CHECK
        if (documentsToSave.length === 0) {
            throw new Error("Refining resulted in 0 documents.");
        }

        await publishEvent(jobId, 'step_refining', 'completed', { count: documentsToSave.length });
    } catch (e) {
        await publishEvent(jobId, 'step_refining', 'error', e.message);
        throw e;
    }

    // --- STEP 3: VECTORIZATION (TEI - Batch) ---
    await publishEvent(jobId, 'step_vectorization', 'running');

    let vectors = [];
    try {
        const textsToEmbed = documentsToSave.map(doc => doc.text);
        vectors = await teiService.getEmbeddings(textsToEmbed);

        if (!vectors || vectors.length !== documentsToSave.length) {
            throw new Error("Vectorization mismatch or failure.");
        }

        await publishEvent(jobId, 'step_vectorization', 'completed', { vectorSize: vectors[0]?.length });
    } catch (e) {
        await publishEvent(jobId, 'step_vectorization', 'error', e.message);
        throw e;
    }

    // --- STEP 4: STRUCTURING (DB SAVE - Qdrant + Memgraph) ---
    await publishEvent(jobId, 'step_structuring', 'running');

    try {
        const qdrantPoints = [];

        for (let i = 0; i < documentsToSave.length; i++) {
            const doc = documentsToSave[i];
            const vector = vectors[i];
            const pointId = uuidv4(); // Генерируем UUID для Qdrant

            // Подготовка для Qdrant
            qdrantPoints.push({
                id: pointId,
                vector: vector,
                payload: {
                    original_id: doc.id,
                    text: doc.text,
                    ...doc.metadata
                }
            });

            // Сохранение в Граф (Memgraph)
            // Пример: MERGE (w:WorkItem {id: "123"})
            await memgraphService.mergeNode('WorkItem', {
                id: doc.metadata.adoId.toString(),
                title: doc.metadata.title,
                qdrant_id: pointId // Связь с вектором!
            });
        }

        // Батч-запись в Qdrant
        await qdrantService.upsertPoints(qdrantPoints);

        await publishEvent(jobId, 'step_structuring', 'completed', { savedNodes: documentsToSave.length });
    } catch (e) {
        await publishEvent(jobId, 'step_structuring', 'error', e.message);
        throw e;
    }

    return documentsToSave;
}

async function processDocument(job, ai, filePath) {
    const jobId = job.id;

    // --- STEP 1: PARSING & ATOMIZATION ---
    await publishEvent(jobId, 'step_parsing', 'running');

    const ext = path.extname(filePath).toLowerCase();
    let atoms = [];

    try {
        if (ext === '.pdf') {
            atoms = await pdfParser.parse(filePath);
        } else if (ext === '.msg') {
            atoms = await msgParser.parse(filePath);
        } else {
            // TODO: Add DOCX support if needed
            throw new Error(`Unsupported file type: ${ext}`);
        }

        await publishEvent(jobId, 'step_parsing', 'completed', { count: atoms.length });

        // --- STEP 2: ENRICHMENT (Summary + Graph) ---
        await publishEvent(jobId, 'step_enrichment', 'running');

        const documentsToSave = [];
        const textsToEmbed = [];

        // Create Document Node
        const docNodeId = `doc_${path.basename(filePath)}`;
        const docNode = {
            id: docNodeId,
            label: path.basename(filePath),
            type: 'Document',
            path: filePath
        };

        // Save Document Node immediately
        await memgraphService.mergeNode('Document', docNode);

        for (let i = 0; i < atoms.length; i++) {
            const atom = atoms[i];

            // 1. Generate Summary
            const summary = await enrichmentService.generateSummary(atom.content);

            // 2. Extract Graph Entities
            const graphData = await enrichmentService.extractGraphEntities(atom.content);

            // 3. Prepare Text for Embedding
            // Format: ${atom.context}\n${summary}\n${atom.content}
            const textToEmbed = `${atom.context}\n${summary}\n${atom.content}`;

            const doc = {
                id: atom.id,
                text: textToEmbed,
                metadata: {
                    ...atom.metadata,
                    context: atom.context,
                    summary: summary,
                    type: atom.type,
                    jobId: jobId,
                    original_content: atom.content
                }
            };

            documentsToSave.push(doc);
            textsToEmbed.push(textToEmbed);

            // --- GRAPH PERSISTENCE (Per Atom) ---

            // Save Atom Node
            await memgraphService.mergeNode('Atom', {
                id: doc.id,
                type: doc.metadata.type,
                summary: doc.metadata.summary,
                context: doc.metadata.context,
                content: doc.metadata.original_content.substring(0, 100) + "..."
            });

            // Link Document -> Atom
            await memgraphService.mergeRelationship(docNodeId, doc.id, 'CONTAINS');

            // Save Extracted Entities & Link to Atom
            if (graphData.nodes && graphData.nodes.length > 0) {
                for (const node of graphData.nodes) {
                    // Normalize ID (Idempotency)
                    if (!node.id) continue;
                    const entityId = node.id.toLowerCase().replace(/\s+/g, '_');
                    const nodeType = node.type || 'Entity';

                    // Merge Entity Node
                    await memgraphService.mergeNode(nodeType, {
                        id: entityId,
                        name: node.label || node.id // Use label as name, fallback to id
                    });

                    // Link Atom -> Entity
                    await memgraphService.mergeRelationship(doc.id, entityId, 'MENTIONS');
                }
            }

            // Save Extracted Relationships
            if (graphData.edges && graphData.edges.length > 0) {
                for (const edge of graphData.edges) {
                    if (!edge.source || !edge.target || !edge.label) continue;

                    const sourceId = edge.source.toLowerCase().replace(/\s+/g, '_');
                    const targetId = edge.target.toLowerCase().replace(/\s+/g, '_');

                    await memgraphService.mergeRelationship(sourceId, targetId, edge.label);
                }
            }
        }

        await publishEvent(jobId, 'step_enrichment', 'completed', { count: documentsToSave.length });

        // --- STEP 3: VECTORIZATION (TEI) ---
        await publishEvent(jobId, 'step_vectorization', 'running');

        let vectors = [];
        if (textsToEmbed.length > 0) {
            vectors = await teiService.getEmbeddings(textsToEmbed);
        }

        await publishEvent(jobId, 'step_vectorization', 'completed', { vectorSize: vectors[0]?.length });

        // --- STEP 4: PERSISTENCE (Qdrant) ---
        await publishEvent(jobId, 'step_structuring', 'running');

        const qdrantPoints = [];

        for (let i = 0; i < documentsToSave.length; i++) {
            const doc = documentsToSave[i];
            const vector = vectors[i];

            qdrantPoints.push({
                id: doc.id,
                vector: vector,
                payload: {
                    text: doc.text,
                    ...doc.metadata
                }
            });
        }

        // Batch save to Qdrant
        if (qdrantPoints.length > 0) {
            await qdrantService.upsertPoints(qdrantPoints);
        }

        await publishEvent(jobId, 'step_structuring', 'completed', { savedNodes: documentsToSave.length });

    } catch (e) {
        await publishEvent(jobId, 'step_parsing', 'error', e.message);
        throw e;
    }
}

// --- WORKER SETUP ---

const worker = new Worker('knowledge-queue', async (job) => {
    console.log(`Processing job ${job.id}`);

    try {
        const ai = getAIProvider('local', 'llama3');

        if (job.name === 'ingest-work-items') {
            await processWorkItems(job, ai, job.data.ids);
        } else if (job.name === 'process-document') {
            await processDocument(job, ai, job.data.filePath);
        }

        await publishEvent(job.id, 'job_complete', 'success');
        return "Done";

    } catch (e) {
        // Глобальный перехватчик ошибок
        console.error(`Job ${job.id} failed:`, e);
        await publishEvent(job.id, 'job_failed', 'error', { message: e.message });
        throw e;
    }

}, { connection: redisConnection });

console.log("🚀 Worker started.");

// Heartbeat for monitoring
setInterval(async () => {
    try {
        await redisConnection.set('worker:heartbeat', Date.now(), 'EX', 30); // Expires in 30s
    } catch (e) {
        console.error("Heartbeat failed:", e.message);
    }
}, 10000);