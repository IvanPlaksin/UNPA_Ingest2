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
async function ingestWorkItems(req, res) {
    try {
        const { ids, userId } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: "Неверный массив ID" });
        }
        if (ids.length > 50) {
            return res.status(400).json({ error: "Лимит 50 записей" });
        }

        // Добавляем в очередь BullMQ
        const job = await queueService.addIngestionJob(ids, userId);

        console.log(`[Knowledge API] Задача создана: ${job.id} (User: ${userId})`);

        res.status(202).json({
            jobId: job.id,
            status: "queued",
            message: "Задача поставлена в очередь"
        });

    } catch (error) {
        console.error("Ошибка ingestWorkItems:", error);
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
        const { attachmentUrl, workItemId, fileType } = req.body;

        if (!attachmentUrl) {
            return res.status(400).json({ error: "Attachment URL is required" });
        }

        console.log(`[Knowledge API] Analyzing attachment: ${attachmentUrl}`);

        // 1. Download file to temp
        // We can reuse ingestionService.downloadAttachment or implement simple download here
        // Since ingestionService is not fully visible, let's use axios directly or assume ingestionService has a helper.
        // But wait, ingestionService.simulateAttachment was the placeholder.
        // Let's implement download here using axios + fs.

        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const { v4: uuidv4 } = require('uuid');

        const tempDir = os.tmpdir();
        const tempFilePath = path.join(tempDir, `sim_${uuidv4()}_${fileType}`);

        // 1. Download file using ADO Service (handles Auth)
        const fileBuffer = await adoService.getAttachmentContent(attachmentUrl);

        // Write buffer to temp file
        fs.writeFileSync(tempFilePath, fileBuffer);

        // 2. Run Simulation
        const result = await simulationService.simulateAttachmentProcessing(tempFilePath, fileType);

        // 3. Cleanup
        fs.unlinkSync(tempFilePath);

        res.json(result);

    } catch (error) {
        console.error("Ingestion error:", error);
        res.status(500).json({ error: error.message });
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
