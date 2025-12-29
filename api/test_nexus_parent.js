const fs = require('fs');
const path = require('path');
const logFile = path.join(__dirname, 'test_nexus_output.txt');
fs.writeFileSync(logFile, ''); // Clear file

function log(msg) {
    try {
        fs.appendFileSync(logFile, msg + '\n');
        process.stdout.write(msg + '\n');
    } catch (e) { }
}

// Ensure env vars are loaded
require('dotenv').config({ path: path.join(__dirname, 'api', '.env') });
const orchestrator = require('./src/services/nexus.orchestrator');
const adoService = require('./src/services/ado.service');

async function test() {
    log("Starting Nexus Test for Parent Detection...");

    // Initialize ADO Service
    try {
        log("Initializing ADO Service...");
        await adoService.connectToAdo();
        log("ADO Service Initialized.");
    } catch (e) {
        log("Failed to init ADO: " + e.message);
        return;
    }

    const context = {
        entityType: 'workitem',
        entityId: '137837',
        activeSources: ['ado']
    };

    const emit = (event, data) => {
        log(`\n[EVENT: ${event}]`);
        if (event === 'graph_update') {
            log(`Nodes Count: ${data.nodes.length}`);
            log(`Edges Count: ${data.edges.length}`);

            const parentNode = data.nodes.find(n => n.id == '136937');
            if (parentNode) {
                log("SUCCESS: Parent Node 136937 FOUND in graph_update.");
                log("Parent Node Data: " + JSON.stringify(parentNode, null, 2));
            } else {
                log("FAILURE: Parent Node 136937 NOT FOUND.");
                // Log all IDs simply
                log("All Node IDs: " + JSON.stringify(data.nodes.map(n => n.id)));
            }

            const parentEdge = data.edges.find(e => e.label === 'Parent');
            if (parentEdge) {
                log("SUCCESS: Edge 'Parent' FOUND.");
                log("Edge: " + JSON.stringify(parentEdge));
            } else {
                log("FAILURE: Edge 'Parent' NOT FOUND.");
            }
        } else if (event === 'progress') {
            log(`Message: ${data.message}`);
        } else if (event === 'error') {
            log(`ERROR: ${data.message}`);
        }
    };

    try {
        await orchestrator.analyze(context, emit);
        log("\nTest Completed.");
    } catch (err) {
        log("Test Failed with Exception: " + err.message);
        console.error(err);
    }
    process.exit(0);
}

test();
