// api/src/controllers/knowledge.controller.js
const queueService = require('../services/queue.service');
const aggregator = require('../services/knowledge.aggregator');
const simulator = require('../services/ingestion.simulator');
const simulationService = require('../services/simulation.service');
const ingestionService = require('../services/ingestion.service');
const adoService = require('../services/ado.service');

/**
 * POST /ingest
 * Запускает задачу и возвращает ID для трекинга
 */
/**
 * POST /ingest
 * Запускает задачу и возвращает ID для трекинга
 * Supports legacy { ids: [] } or new { sourceConfig: { type, filter } }
 */
async function ingestWorkItems(req, res) {
    try {
        const { ids, userId, sourceConfig } = req.body;

        let formattedConfig = null;

        // Legacy support
        if (ids && Array.isArray(ids) && ids.length > 0) {
            if (ids.length > 50) return res.status(400).json({ error: "Limit 50 items" });
            formattedConfig = { type: 'ado', filter: { ids } };
        }
        // New Source Config
        else if (sourceConfig && sourceConfig.type) {
            formattedConfig = sourceConfig;
        } else {
            return res.status(400).json({ error: "Invalid request. Provide 'ids' or 'sourceConfig'." });
        }

        // Add to Queue (Unified)
        const job = await queueService.addIngestionJob(formattedConfig, userId);

        console.log(`[Knowledge API] Job Created: ${job.id} (Type: ${formattedConfig.type})`);

        res.status(202).json({
            jobId: job.id,
            status: "queued",
            message: "Ingestion job queued successfully"
        });

    } catch (error) {
        console.error("Error ingestWorkItems:", error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * GET /stream/:jobId
 * Server-Sent Events endpoint для визуализации
 */
async function streamIngestionStatus(req, res) {
    const { jobId } = req.params;

    // Настройка заголовков SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    console.log(`[SSE] Клиент подключился к потоку задачи ${jobId}`);

    // Отправляем приветственное событие
    res.write(`event: log\ndata: ${JSON.stringify({ message: "Connection established. Waiting for worker..." })}\n\n`);

    // Подписываемся на Redis Pub/Sub
    const unsubscribe = await queueService.subscribeToJobEvents(jobId, (eventData) => {
        // eventData формат: { type: 'step_extraction', payload: { ... } }

        const eventType = eventData.type;
        const payload = JSON.stringify(eventData.payload);

        // Отправляем в SSE поток
        res.write(`event: ${eventType}\ndata: ${payload}\n\n`);

        // Если работа завершена - закрываем поток
        if (eventType === 'job_complete' || eventType === 'job_failed') {
            res.end();
        }
    });

    // Keep-alive пинг каждые 15 сек, чтобы соединение не рвалось
    const intervalId = setInterval(() => {
        res.write(': keep-alive\n\n');
    }, 15000);

    // Очистка при разрыве соединения клиентом
    req.on('close', async () => {
        console.log(`[SSE] Клиент отключился от ${jobId}`);
        clearInterval(intervalId);
        await unsubscribe();
    });
}

async function getContext(req, res) {
    try {
        const bundle = await aggregator.aggregateWorkItemContext(req.params.id);
        res.json(bundle);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

async function processContext(req, res) {
    try {
        // Получаем утвержденный бандл от клиента
        const bundle = req.body;
        const report = await simulator.simulateIngestionPipeline(bundle);
        res.json({ report });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

async function analyzeAttachment(req, res) {
    try {
        // Multer puts fields in req.body and file in req.file
        const { attachmentUrl, workItemId, fileType, type } = req.body;
        const uploadedFile = req.file;

        console.log(`[Knowledge API] Analyze request. Type: ${type}, WorkItem: ${workItemId}, File: ${uploadedFile ? uploadedFile.originalname : 'None'}`);

        let targetFilePath = null;
        let targetFileType = fileType || 'unknown';

        // Case 1: Direct File Upload
        if (uploadedFile) {
            targetFilePath = uploadedFile.path;
            targetFileType = uploadedFile.originalname; // e.g. "doc.pdf"
        }
        // Case 2: Attachment URL (Download needed)
        else if (attachmentUrl) {
            // ... (Previous download logic would go here if needed)
            // For now, assume we need a file.
            return res.status(400).json({ error: "Attachment URL download not implemented yet. Please upload file directly." });
        }
        // Case 3: ADO Work Item ID (Just simulate based on ID?)
        else if (workItemId) {
            console.log(`[Knowledge API] Simulating based on Work Item ID: ${workItemId}`);
            // If this is a simulation WITHOUT a file (just data), we might need a different flow.
            // But the user clicked "Run Analysis" in Source Selector -> ADO Tab.
            // This usually implies fetching the work item content and simulating THAT.

            // Let's fetch the work item content using ADO service
            const adoService = require('../services/ado.service');
            const workItem = await adoService.getWorkItemById(workItemId);

            if (!workItem) throw new Error("Work Item not found");

            // Create a temp file with the Work Item content for simulation?
            // Or adapt simulation service to accept string content.
            // SimulationService expects a filePath currently.

            const fs = require('fs');
            const path = require('path');
            const os = require('os');
            const { v4: uuidv4 } = require('uuid');

            const tempDir = os.tmpdir();
            targetFilePath = path.join(tempDir, `workitem_${workItemId}_${uuidv4()}.txt`);

            const content = `Title: ${workItem.fields['System.Title']}\n\nDescription:\n${workItem.fields['System.Description'] || ''}`;
            fs.writeFileSync(targetFilePath, content);
            targetFileType = 'workitem.txt'; // Treat as text file
        }
        else {
            return res.status(400).json({ error: "No file, URL, or Work Item ID provided." });
        }

        // 2. Call Simulation Service
        // Note: simulationService.simulateAttachment expects a file path.
        const simulationResult = await simulationService.simulateAttachmentProcessing(targetFilePath, targetFileType);

        // Cleanup temp file if it was uploaded/created
        const fs = require('fs');
        if (targetFilePath && fs.existsSync(targetFilePath)) {
            // fs.unlinkSync(targetFilePath); // Optional: keep for debugging for now
        }

        res.json(simulationResult);

    } catch (e) {
        console.error("Analysis Error:", e);
        res.status(500).json({ error: e.message });
    }
}



async function vectorizeQuery(req, res) {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: "Text is required" });

        const result = await ingestionService.vectorizeQuery(text);
        res.json(result);
    } catch (error) {
        console.error("Vectorization error:", error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    ingestWorkItems,
    streamIngestionStatus,
    getContext,
    processContext,
    analyzeAttachment,
    vectorizeQuery
};
