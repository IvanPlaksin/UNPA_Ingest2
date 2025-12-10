
console.log("Start Redis Debug");

try {
    console.log("1. Requiring ioredis...");
    const IORedis = require('ioredis');
    console.log("IORedis loaded. Type:", typeof IORedis);

    console.log("2. Creating client...");
    const client = new IORedis({
        host: process.env.REDIS_HOST || 'localhost',
        port: 6379,
        maxRetriesPerRequest: null
    });

    client.on('connect', () => {
        console.log("Connected to Redis!");
        client.quit();
    });

    client.on('error', (err) => {
        console.error("Redis Error:", err);
        client.quit();
    });

} catch (e) {
    console.error("CRASH in IORedis test:", e);
}

console.log("3. Requiring local service...");
try {
    const redisService = require('./src/services/redis.service');
    console.log("Redis Service required successfully.");
} catch (e) {
    console.error("CRASH in Redis Service require:", e);
}
