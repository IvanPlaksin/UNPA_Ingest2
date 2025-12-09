// api/tests/nexus.manual.test.js
require('dotenv').config();
const aggregator = require('../src/services/knowledge.aggregator');

async function testAggregator() {
    console.log("Testing Knowledge Aggregator...");
    try {
        // Use a known ID or a random one if we are mocking
        // Since we are using the real ADO service, we need a real ID.
        // But wait, the user might not have a real ID handy.
        // Let's try to search for one first, or just use a dummy one if we can mock ADO.

        // Actually, let's mock the ADO service for this test to avoid network dependency issues during verification
        // and to ensure we are testing the aggregator logic.

        // Mocking adoService
        const adoService = require('../src/services/ado.service');
        adoService.getWorkItemsUniversal = async () => {
            return {
                items: [{
                    id: 123,
                    fields: {
                        'System.Title': 'Test Task',
                        'System.State': 'Active',
                        'System.WorkItemType': 'Task',
                        'System.Description': 'Test Description'
                    }
                }]
            };
        };

        const bundle = await aggregator.aggregateWorkItemContext(123);
        console.log("Result Bundle:", JSON.stringify(bundle, null, 2));

        if (bundle.core.id === 123 && bundle.related.commits.length > 0) {
            console.log("✅ Aggregator Test Passed");
        } else {
            console.error("❌ Aggregator Test Failed");
        }

    } catch (e) {
        console.error("❌ Error:", e);
    }
}

testAggregator();
