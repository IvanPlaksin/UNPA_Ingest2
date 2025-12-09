// api/src/services/queue.service.js
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const REDIS_CONFIG = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: null
};

// Очередь задач (для отправки в Worker)
const knowledgeQueue = new Queue('knowledge-queue', { connection: new IORedis(REDIS_CONFIG) });

// Клиент для подписки (SSE)
const redisSubscriber = new IORedis(REDIS_CONFIG);

/**
 * Добавляет задачу на обработку (Ingestion)
 */
async function addIngestionJob(ids, userId) {
    const job = await knowledgeQueue.add('ingest-work-items', {
        ids,
        userId,
        timestamp: new Date().toISOString()
    });
    return job;
}

/**
 * Подписывается на события конкретной задачи для SSE
 * @param {string} jobId 
 * @param {function} onMessage - callback(channel, message)
 */
async function subscribeToJobEvents(jobId, onMessage) {
    const channel = `job_updates:${jobId}`;

    // Создаем дубликат соединения для подписки (блокирующая операция)
    const subClient = redisSubscriber.duplicate();

    await subClient.subscribe(channel);

    subClient.on('message', (ch, msg) => {
        if (ch === channel) {
            onMessage(JSON.parse(msg));
        }
    });

    // Возвращаем функцию отписки (cleanup)
    return async () => {
        await subClient.unsubscribe(channel);
        subClient.quit();
    };
}

async function checkRedisHealth() {
    try {
        const res = await redisSubscriber.ping();
        return res === 'PONG';
    } catch (e) {
        return false;
    }
}

async function checkWorkerHealth() {
    try {
        const lastHeartbeat = await redisSubscriber.get('worker:heartbeat');
        if (!lastHeartbeat) return false;

        const diff = Date.now() - parseInt(lastHeartbeat, 10);
        return diff < 30000; // Alive if heartbeat within last 30s
    } catch (e) {
        return false;
    }
}

module.exports = {
    addIngestionJob,
    subscribeToJobEvents,
    checkRedisHealth,
    checkWorkerHealth
};
