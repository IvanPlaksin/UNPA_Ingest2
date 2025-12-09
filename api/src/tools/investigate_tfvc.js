
require('dotenv').config({ path: '.env' });
const tfvcService = require('../services/tfvc.service');

async function run() {
    try {
        console.log("--- Testing getTfvcLabels ---");

        // Test getTfvcLabels (Server-side Name Filter)
        console.log("\nFetching labels matching '*Build*'...");
        const labels = await tfvcService.getTfvcLabels({ name: '*Build*' });
        console.log(`Found ${labels.length} labels.`);
        if (labels.length > 0) {
            console.log("First label:", labels[0].name);
        } else {
            console.log("No labels found matching '*Build*'. Trying wildcard '*'...");
            const allLabels = await tfvcService.getTfvcLabels({ name: '*' });
            console.log(`Found ${allLabels.length} total labels.`);
            if (allLabels.length > 0) {
                console.log("First label:", allLabels[0].name);
            }
        }

    } catch (e) {
        console.error("Fatal error:", e);
    } finally {
        // Force exit to close Redis connection if any
        process.exit(0);
    }
}

run();
