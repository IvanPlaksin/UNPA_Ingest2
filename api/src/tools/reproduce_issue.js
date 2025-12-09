
require('dotenv').config({ path: '.env' });
const tfvcService = require('../services/tfvc.service');

async function run() {
    try {
        console.log("Calling getTfvcLabels...");
        const labels = await tfvcService.getTfvcLabels({ name: '*Build*' });
        console.log("Labels found:", labels.length);
    } catch (error) {
        console.error("Caught error:", error);
    }
}

run();
