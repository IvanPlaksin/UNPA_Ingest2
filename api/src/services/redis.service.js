// api/src/services/redis.service.js
const IORedis = require('ioredis');

const REDIS_CONFIG = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: null,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
};

let redisClient;
let isReady = false;

function initRedis() {
    if (redisClient) return redisClient;

    console.log(`[Redis Service] Connecting to ${REDIS_CONFIG.host}:${REDIS_CONFIG.port}...`);
    redisClient = new IORedis(REDIS_CONFIG);

    redisClient.on('connect', () => {
        console.log('[Redis Service] Connected to Redis');
        isReady = true;
    });

    redisClient.on('error', (err) => {
        console.error('[Redis Service] Redis Error:', err.message);
        isReady = false;
    });

    return redisClient;
}

// Initialize immediately
initRedis();

async function get(key) {
    if (!isReady) return null;
    try {
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error(`[Redis Service] Get Error for key ${key}:`, error.message);
        return null;
    }
}

async function set(key, value, ttlSeconds = 60) {
    if (!isReady) return false;
    try {
        const stringValue = JSON.stringify(value);
        if (ttlSeconds) {
            await redisClient.set(key, stringValue, 'EX', ttlSeconds);
        } else {
            await redisClient.set(key, stringValue);
        }
        return true;
    } catch (error) {
        console.error(`[Redis Service] Set Error for key ${key}:`, error.message);
        return false;
    }
}

async function del(key) {
    if (!isReady) return false;
    try {
        await redisClient.del(key);
        return true;
    } catch (error) {
        console.error(`[Redis Service] Del Error for key ${key}:`, error.message);
        return false;
    }
}

async function flush() {
    if (!isReady) return false;
    try {
        await redisClient.flushall();
        console.log('[Redis Service] Cache flushed');
        return true;
    } catch (error) {
        console.error('[Redis Service] Flush Error:', error.message);
        return false;
    }
}

module.exports = {
    get,
    set,
    del,
    flush,
    client: redisClient
};
