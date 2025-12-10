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

const fs = require('fs');
const crypto = require('crypto');

async function processDocument(job, ai, filePath) {
    const jobId = job.id;
    const workItemId = job.data.workItemId; // Assuming passed in job data if linked to a User Story

    // --- STEP A: DEDUPLICATION (Hash Check) ---
    await publishEvent(jobId, 'step_dedup', 'running');

    const fileBuffer = fs.readFileSync(filePath);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const fileName = path.basename(filePath);

    // Check Memgraph
    const existingNode = await memgraphService.findNodeByHash(fileHash);
    if (existingNode) {
        console.log(`[Ingest] Deduplication: Document ${fileName} already exists (Hash: ${fileHash.substring(0, 8)}).`);

        if (workItemId) {
            // Link existing document to Work Item if needed
            // await memgraphService.mergeRelationship(workItemId, existingNode.id, 'HAS_ATTACHMENT');
        }

        await publishEvent(jobId, 'step_dedup', 'completed', { status: 'duplicate', id: existingNode.id });
        return; // STOP
    }

    await publishEvent(jobId, 'step_dedup', 'completed', { status: 'new', hash: fileHash });

    // --- STEP B: TRANSFORMATION (Parsing & Enrichment) ---
    await publishEvent(jobId, 'step_parsing', 'running');

    const ext = path.extname(filePath).toLowerCase();
    let atoms = [];

    try {
        if (ext === '.pdf') {
            atoms = await pdfParser.parse(fileBuffer); // Pass buffer!
        } else if (ext === '.msg') {
            atoms = await msgParser.parse(filePath); // MSG Parser reads file usually, or refactor to buffer
        } else {
            throw new Error(`Unsupported file type: ${ext}`);
        }

        await publishEvent(jobId, 'step_parsing', 'completed', { count: atoms.length });

        // Enrichment
        await publishEvent(jobId, 'step_enrichment', 'running');

        const enrichedAtoms = [];
        const textsToEmbed = [];
        const qdrantPoints = [];

        // Pre-calculate Qdrant IDs to use in Graph
        for (let i = 0; i < atoms.length; i++) {
            const atom = atoms[i];

            // Generate deterministic Vector ID: Hash(FileHash + Index)
            // This ensures if we re-process same file, we get same IDs
            const vectorId = uuidv4(); // Or deterministic: crypto.createHash('md5').update(fileHash + i).digest('hex');

            // 1. Enrich (Summary + Graph)
            // Note: enrichmentService.extractGraphEntities calls strict graph extractor now
            const graphData = await enrichmentService.extractGraphEntities(atom.content);
            const summary = await enrichmentService.generateSummary(atom.content);

            const textToEmbed = `${atom.context}\n${summary}\n${atom.content}`;

            enrichedAtoms.push({
                ...atom,
                id: atom.id || `atom_${fileHash}_${i}`,
                vectorId: vectorId,
                summary: summary,
                graphData: graphData,
                textToEmbed: textToEmbed
            });

            textsToEmbed.push(textToEmbed);
        }

        await publishEvent(jobId, 'step_enrichment', 'completed', { count: enrichedAtoms.length });

        // --- STEP C: VECTORIZATION & QDRANT ---
        await publishEvent(jobId, 'step_vectorization', 'running');

        let vectors = [];
        if (textsToEmbed.length > 0) {
            vectors = await teiService.getEmbeddings(textsToEmbed);
        }

        // Prepare Qdrant Points
        for (let i = 0; i < enrichedAtoms.length; i++) {
            const atom = enrichedAtoms[i];
            qdrantPoints.push({
                id: atom.vectorId,
                vector: vectors[i],
                payload: {
                    file_name: fileName,
                    file_hash: fileHash,
                    content: atom.content,
                    context: atom.context,
                    summary: atom.summary,
                    type: atom.type
                }
            });
        }

        // Action: Upsert to Qdrant
        if (qdrantPoints.length > 0) {
            await qdrantService.upsertPoints(qdrantPoints);
        }

        await publishEvent(jobId, 'step_vectorization', 'completed', { count: vectors.length });


        // --- STEP D: GRAPH PERSISTENCE (With Rollback) ---
        await publishEvent(jobId, 'step_graph_persistence', 'running');

        try {
            // 1. Create Document Node
            const docNodeId = `doc_${fileHash}`;
            await memgraphService.mergeNode('Document', {
                id: docNodeId,
                name: fileName,
                fileHash: fileHash,
                type: 'Document'
            });

            // 2. Loop Atoms
            for (const atom of enrichedAtoms) {
                // Atom Node with vector reference
                await memgraphService.mergeNode('Atom', {
                    id: atom.id,
                    content: atom.content.substring(0, 200),
                    summary: atom.summary,
                    qdrant_vector_id: atom.vectorId, // LINK TO VECTOR
                    type: atom.type
                });

                // Link Document -> Atom
                await memgraphService.mergeRelationship(docNodeId, atom.id, 'CONTAINS');

                // 3. Merges Entites & Relationships
                const { nodes, edges } = atom.graphData;

                // Entities
                if (nodes) {
                    for (const n of nodes) {
                        if (!n.id) continue;
                        await memgraphService.mergeNode(n.type || 'Concept', {
                            id: n.id,
                            name: n.label || n.id
                        });
                        // Link Atom -> Entity
                        await memgraphService.mergeRelationship(atom.id, n.id, 'MENTIONS');
                    }
                }

                // Internal Edges (Entity -> Entity)
                if (edges) {
                    for (const e of edges) {
                        try {
                            await memgraphService.mergeRelationship(e.source, e.target, e.label || 'RELATED_TO');
                        } catch (edgeErr) {
                            console.warn(`Edge creation failed: ${e.source}->${e.target}`, edgeErr.message);
                        }
                    }
                }
            }

            await publishEvent(jobId, 'step_graph_persistence', 'completed', { status: 'success' });

        } catch (graphError) {
            console.error(`[Ingest] Graph persistence failed! Initiating Rollback... Error: ${graphError.message}`);

            // --- ROLLBACK LOGIC ---
            // Delete the vectors we just inserted
            const vectorIdsToDelete = enrichedAtoms.map(a => a.vectorId);
            try {
                await qdrantService.deletePoints(vectorIdsToDelete);
                console.log(`[Ingest] Rollback successful: Deleted ${vectorIdsToDelete.length} vectors.`);
            } catch (rollbackError) {
                console.error(`[Ingest] CRITICAL: Rollback failed! Vectors orphaned. IDs: ${vectorIdsToDelete.join(',')}`, rollbackError);
            }

            // Fail the job
            throw new Error(`Graph sync failed: ${graphError.message}. Vectors rolled back.`);
        }

    } catch (e) {
        await publishEvent(jobId, 'step_processing', 'error', e.message);
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