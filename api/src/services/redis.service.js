// api/src/services/redis.service.js
const IORedis = require('ioredis');

const tlsEnabled = process.env.REDIS_TLS === 'true';
const REDIS_CONFIG = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    ...(tlsEnabled && { tls: {} }),
    ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
};

let redisClient;
let isReady = false;

// Store handler references for cleanup
let connectHandler = null;
let errorHandler = null;

function initRedis() {
    if (redisClient) return redisClient;

    console.log(`[Redis Service] Connecting to ${REDIS_CONFIG.host}:${REDIS_CONFIG.port}...`);
    redisClient = new IORedis(REDIS_CONFIG);

    // Store handlers for later removal
    connectHandler = () => {
        console.log('[Redis Service] Connected to Redis');
        isReady = true;
    };

    errorHandler = (err) => {
        console.error('[Redis Service] Redis Error:', err.message);
        isReady = false;
    };

    redisClient.on('connect', connectHandler);
    redisClient.on('error', errorHandler);

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

// ════════════════════════════════════════════════════════════════════════════
// CACHE HELPERS FOR HEALTHCHECK AND CONFIGURATION
// ════════════════════════════════════════════════════════════════════════════

/**
 * Cache TTL constants (in seconds)
 */
const CACHE_TTL = {
    HEALTH_CHECK: 60,      // 1 minute for health checks
    CONFIG: 300,           // 5 minutes for configuration
    CONFIG_LIST: 120       // 2 minutes for config lists
};

/**
 * Cache key prefixes
 */
const CACHE_KEYS = {
    HEALTH: 'health:',
    CONFIG: 'config:'
};

/**
 * Get or compute cached health check result
 * @param {string} serviceName - Name of the service (e.g., 'main', 'ai-agent', 'aopeg')
 * @param {Function} computeFn - Async function to compute health status if not cached
 * @returns {Promise<{data: any, cached: boolean}>}
 */
async function getCachedHealthCheck(serviceName, computeFn) {
    const cacheKey = `${CACHE_KEYS.HEALTH}${serviceName}`;

    // Try to get from cache
    const cached = await get(cacheKey);
    if (cached !== null) {
        return { data: cached, cached: true };
    }

    // Compute fresh result
    try {
        const result = await computeFn();
        // Cache the result
        await set(cacheKey, result, CACHE_TTL.HEALTH_CHECK);
        return { data: result, cached: false };
    } catch (error) {
        // Don't cache errors, return error result
        return {
            data: {
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            },
            cached: false
        };
    }
}

/**
 * Get or compute cached configuration
 * @param {string} configName - Name of the configuration
 * @param {Function} computeFn - Async function to get configuration if not cached
 * @param {number} [ttl] - Optional custom TTL in seconds
 * @returns {Promise<{data: any, cached: boolean}>}
 */
async function getCachedConfig(configName, computeFn, ttl = CACHE_TTL.CONFIG) {
    const cacheKey = `${CACHE_KEYS.CONFIG}${configName}`;

    // Try to get from cache
    const cached = await get(cacheKey);
    if (cached !== null) {
        return { data: cached, cached: true };
    }

    // Compute fresh result
    try {
        const result = await computeFn();
        if (result !== null && result !== undefined) {
            await set(cacheKey, result, ttl);
        }
        return { data: result, cached: false };
    } catch (error) {
        console.error(`[Redis Service] Config cache error for ${configName}:`, error.message);
        throw error;
    }
}

/**
 * Invalidate cached configuration
 * @param {string} configName - Name of the configuration to invalidate
 */
async function invalidateConfig(configName) {
    const cacheKey = `${CACHE_KEYS.CONFIG}${configName}`;
    await del(cacheKey);
}

/**
 * Invalidate all health check caches
 */
async function invalidateAllHealthChecks() {
    if (!isReady) return false;
    try {
        const keys = await redisClient.keys(`${CACHE_KEYS.HEALTH}*`);
        if (keys.length > 0) {
            await redisClient.del(...keys);
        }
        return true;
    } catch (error) {
        console.error('[Redis Service] Error invalidating health caches:', error.message);
        return false;
    }
}

/**
 * Invalidate all config caches
 */
async function invalidateAllConfigs() {
    if (!isReady) return false;
    try {
        const keys = await redisClient.keys(`${CACHE_KEYS.CONFIG}*`);
        if (keys.length > 0) {
            await redisClient.del(...keys);
        }
        return true;
    } catch (error) {
        console.error('[Redis Service] Error invalidating config caches:', error.message);
        return false;
    }
}

/**
 * Gracefully shutdown Redis connection
 * Removes event listeners and closes connection
 */
async function destroy() {
    if (!redisClient) return;

    // Remove event listeners to prevent memory leaks
    if (connectHandler) {
        redisClient.off('connect', connectHandler);
        connectHandler = null;
    }
    if (errorHandler) {
        redisClient.off('error', errorHandler);
        errorHandler = null;
    }

    try {
        await redisClient.quit();
        console.log('[Redis Service] Connection closed gracefully');
    } catch (error) {
        console.error('[Redis Service] Error closing connection:', error.message);
        // Force disconnect if quit fails
        redisClient.disconnect();
    }

    redisClient = null;
    isReady = false;
}

module.exports = {
    // Core operations
    get,
    set,
    del,
    flush,
    destroy,
    client: redisClient,
    getClient: () => redisClient,
    isReady: () => isReady,

    // Cache helpers
    getCachedHealthCheck,
    getCachedConfig,
    invalidateConfig,
    invalidateAllHealthChecks,
    invalidateAllConfigs,

    // Constants
    CACHE_TTL,
    CACHE_KEYS
};
