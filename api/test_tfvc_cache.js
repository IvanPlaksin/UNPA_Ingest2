// api/test_tfvc_cache.js
require('dotenv').config({ path: 'api/.env' });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // For on-premise ADO

const tfvcService = require('./src/services/tfvc.service');
const redisService = require('./src/services/redis.service');

async function runTest() {
    console.log("🚀 Starting TFVC Cache Test...");

    try {
        // Clear cache first
        await redisService.flush();

        const path = '$/ATSBranch'; // Assuming this path exists based on previous logs

        // --- Test 1: getItems (Tree) ---
        console.log("\n--- Test 1: getItems (Tree) ---");

        console.log("Request 1 (Cache MISS)...");
        const start1 = Date.now();
        const items1 = await tfvcService.getItems(path, 1);
        const end1 = Date.now();
        console.log(`⏱️ Duration: ${end1 - start1}ms, Items: ${items1.length}`);

        console.log("Request 2 (Cache HIT)...");
        const start2 = Date.now();
        const items2 = await tfvcService.getItems(path, 1);
        const end2 = Date.now();
        console.log(`⏱️ Duration: ${end2 - start2}ms, Items: ${items2.length}`);

        if ((end2 - start2) < (end1 - start1)) {
            console.log("✅ SUCCESS: Request 2 was faster.");
        } else {
            console.warn("⚠️ WARNING: Request 2 was NOT faster.");
        }

        // --- Test 2: getChangesets (History) ---
        console.log("\n--- Test 2: getChangesets (History) ---");

        console.log("Request 1 (Cache MISS)...");
        const start3 = Date.now();
        const history1 = await tfvcService.getChangesets(path, 5);
        const end3 = Date.now();
        console.log(`⏱️ Duration: ${end3 - start3}ms, Changesets: ${history1.length}`);

        console.log("Request 2 (Cache HIT)...");
        const start4 = Date.now();
        const history2 = await tfvcService.getChangesets(path, 5);
        const end4 = Date.now();
        console.log(`⏱️ Duration: ${end4 - start4}ms, Changesets: ${history2.length}`);

        if ((end4 - start4) < (end3 - start3)) {
            console.log("✅ SUCCESS: Request 2 was faster.");
        } else {
            console.warn("⚠️ WARNING: Request 2 was NOT faster.");
        }

    } catch (error) {
        console.error("❌ Test Failed:", error);
    } finally {
        process.exit(0);
    }
}

runTest();
