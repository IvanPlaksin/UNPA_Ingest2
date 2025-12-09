const teiService = require('./src/services/tei.service');
const qdrantService = require('./src/services/qdrant.service');
const memgraphService = require('./src/services/memgraph.service');

async function test() {
    console.log('Testing TEI Service...');
    if (typeof teiService.getEmbeddings === 'function') {
        console.log('TEI Service: getEmbeddings is a function.');
    } else {
        console.error('TEI Service: getEmbeddings is NOT a function.');
    }

    console.log('Testing Qdrant Service...');
    if (typeof qdrantService.initCollection === 'function' &&
        typeof qdrantService.upsertPoints === 'function' &&
        typeof qdrantService.searchSimilar === 'function') {
        console.log('Qdrant Service: initCollection, upsertPoints, and searchSimilar are functions.');
    } else {
        console.error('Qdrant Service: Missing functions.');
    }

    console.log('Testing Memgraph Service...');
    if (typeof memgraphService.mergeNode === 'function' &&
        typeof memgraphService.mergeRelationship === 'function' &&
        typeof memgraphService.executeQuery === 'function') {
        console.log('Memgraph Service: mergeNode, mergeRelationship, and executeQuery are functions.');
    } else {
        console.error('Memgraph Service: Missing functions.');
    }

    // Clean up
    if (memgraphService.close) {
        await memgraphService.close();
    }
}

test().catch(console.error);
