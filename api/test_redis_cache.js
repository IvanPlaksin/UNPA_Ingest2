// api/test_redis_cache.js
require('dotenv').config({ path: 'api/.env' });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // For on-premise ADO

const adoService = require('./src/services/ado.service');
const redisService = require('./src/services/redis.service');

async function runTest() {
    console.log("🚀 Starting Redis Cache Test...");

    try {
        await adoService.connectToAdo();
        console.log("✅ Connected to ADO");

        // Clear cache first to ensure clean state
        await redisService.flush();

        const filters = [{ field: 'System.State', operator: 'Equals', value: 'Active' }];
        const page = 1;
        const limit = 5;

        // --- First Call (Cache MISS) ---
        console.log("\n--- Request 1 (Expecting Cache MISS) ---");
        const start1 = Date.now();
        const result1 = await adoService.searchWorkItems(filters, page, limit);
        const end1 = Date.now();
        const duration1 = end1 - start1;
        console.log(`⏱️ Duration: ${duration1}ms`);
        console.log(`Items found: ${result1.count}`);

        if (result1.error) {
            console.error("❌ Error in Request 1:", result1.error);
            process.exit(1);
        }

        // --- Second Call (Cache HIT) ---
        console.log("\n--- Request 2 (Expecting Cache HIT) ---");
        const start2 = Date.now();
        const result2 = await adoService.searchWorkItems(filters, page, limit);
        const end2 = Date.now();
        const duration2 = end2 - start2;
        console.log(`⏱️ Duration: ${duration2}ms`);
        console.log(`Items found: ${result2.count}`);

        if (result2.error) {
            console.error("❌ Error in Request 2:", result2.error);
            process.exit(1);
        }

        // --- Verification ---
        console.log("\n--- Verification ---");
        if (duration2 < duration1) {
            console.log("✅ SUCCESS: Request 2 was faster than Request 1.");
        } else {
            console.warn("⚠️ WARNING: Request 2 was NOT faster. Cache might not be working or network is unstable.");
        }

        if (JSON.stringify(result1) === JSON.stringify(result2)) {
            console.log("✅ SUCCESS: Results match.");
        } else {
            console.error("❌ FAILURE: Results do not match!");
        }

    } catch (error) {
        console.error("❌ Test Failed:", error);
    } finally {
        process.exit(0);
    }
}

runTest();
