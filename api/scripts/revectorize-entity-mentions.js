'use strict';
/**
 * Re-vectorizes EntityMentions that have no vectorId.
 * Calls TEI for embeddings, upserts to Qdrant `documents_entities`,
 * then patches Memgraph nodes with vectorId.
 *
 * Usage: node api/scripts/revectorize-entity-mentions.js
 * Env overrides: TEI_URL, QDRANT_URL, MEMGRAPH_URL
 */

const axios     = require('axios');
const neo4j     = require('neo4j-driver');
const { QdrantClient } = require('@qdrant/js-client-rest');

const TEI_URL      = process.env.TEI_URL      || 'http://localhost:8081';
const QDRANT_URL   = process.env.QDRANT_URL   || 'http://localhost:6333';
const MEMGRAPH_URL = process.env.MEMGRAPH_URL || 'bolt://localhost:7687';
const MG_USER      = process.env.MEMGRAPH_USER     || 'memgraph';
const MG_PASS      = process.env.MEMGRAPH_PASSWORD || 'secret_password_123';

const COLLECTION   = 'documents_entities';
const BATCH_SIZE   = 10;

const TYPE_TO_FAMILY = {
    BUSINESS_OBJECT: 'STRUCTURAL', ACTOR: 'STRUCTURAL',
    SYSTEM: 'STRUCTURAL',          DOCUMENT: 'STRUCTURAL',
    LOCATION: 'CONTEXTUAL',        ANOMALY: 'CONTEXTUAL',
    EVENT: 'BEHAVIORAL',           PROCESS: 'BEHAVIORAL',
    CONCEPT: 'SEMANTIC',
    POLICY: 'OPERATIONAL',         REQUIREMENT: 'OPERATIONAL',
    DECISION: 'GOVERNANCE',
};

function buildText(em) {
    const parts = [em.name || ''];
    if (em.match)          parts.push(em.match);
    if (em.category)       parts.push('Category: ' + em.category);
    if (em.epistemicLayer) parts.push('Layer: ' + em.epistemicLayer);
    return parts.filter(Boolean).join('. ').substring(0, 1000);
}

async function getEmbeddings(texts) {
    const response = await axios.post(`${TEI_URL}/embed`, {
        inputs: texts, normalize: true, truncate: true,
    }, { timeout: 30000 });
    return response.data;
}

async function main() {
    const driver = neo4j.driver(MEMGRAPH_URL, neo4j.auth.basic(MG_USER, MG_PASS));
    const session = driver.session();
    const qdrant  = new QdrantClient({ url: QDRANT_URL });

    try {
        // 1. Check TEI
        await axios.get(`${TEI_URL}/health`, { timeout: 5000 });
        console.log(`TEI: UP at ${TEI_URL}`);

        // 2. Ensure collection exists
        const colls = await qdrant.getCollections();
        const exists = colls.collections.some(c => c.name === COLLECTION);
        if (!exists) {
            await qdrant.createCollection(COLLECTION, {
                vectors: { size: 1024, distance: 'Cosine' },
            });
            console.log(`Qdrant: created collection '${COLLECTION}'`);
        } else {
            console.log(`Qdrant: collection '${COLLECTION}' exists`);
        }

        // 3. Fetch all EntityMentions without vectorId
        const result = await session.run(`
            MATCH (d:Document)-[:MENTIONS]->(em:EntityMention)
            WHERE em.vectorId IS NULL
            RETURN em.id AS id, em.name AS name, em.type AS type,
                   em.match AS match, em.category AS category,
                   em.epistemicLayer AS epistemicLayer,
                   d.id AS docId, d.documentTitle AS docTitle,
                   em.extractionJobId AS jobId
        `);
        const mentions = result.records.map(r => ({
            id:             r.get('id'),
            name:           r.get('name'),
            type:           r.get('type'),
            match:          r.get('match'),
            category:       r.get('category'),
            epistemicLayer: r.get('epistemicLayer'),
            docId:          r.get('docId'),
            docTitle:       r.get('docTitle'),
            jobId:          r.get('jobId'),
        }));

        console.log(`\nFound ${mentions.length} EntityMentions without vectorId\n`);
        if (mentions.length === 0) {
            console.log('Nothing to do.');
            return;
        }

        const now = new Date().toISOString();
        let indexed = 0, failed = 0;

        // 4. Process in batches
        for (let i = 0; i < mentions.length; i += BATCH_SIZE) {
            const batch = mentions.slice(i, i + BATCH_SIZE);
            const texts = batch.map(buildText);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(mentions.length / BATCH_SIZE);

            process.stdout.write(`  Batch ${batchNum}/${totalBatches} (${batch.length} items)... `);

            let embeddings;
            try {
                embeddings = await getEmbeddings(texts);
            } catch (err) {
                console.log(`TEI ERROR: ${err.message}`);
                failed += batch.length;
                continue;
            }

            // 5. Upsert to Qdrant
            const points = batch.map((em, idx) => ({
                id: em.id,
                vector: embeddings[idx],
                payload: {
                    graphNodeId:       em.id,
                    graphLabel:        'EntityMention',
                    vectorType:        'entity_mention',
                    memgraphNodeId:    em.id,
                    memgraphNodeLabel: 'EntityMention',
                    mode:              'DOCUMENT',
                    sourceId:          em.docId,
                    documentId:        em.docId,
                    sourceDocumentId:  em.docId,
                    extractionJobId:   em.jobId || null,
                    name:              em.name  || '',
                    type:              em.type  || '',
                    entityType:        em.type  || '',
                    knowledgeFamily:   TYPE_TO_FAMILY[em.type] || 'SEMANTIC',
                    epistemicLayer:    em.epistemicLayer || null,
                    embeddingModel:    'intfloat/multilingual-e5-large',
                    indexedAt:         now,
                },
            })).filter(p => Array.isArray(p.vector));

            try {
                await qdrant.upsert(COLLECTION, { wait: true, points });
            } catch (err) {
                console.log(`Qdrant ERROR: ${err.message}`);
                failed += batch.length;
                continue;
            }

            // 6. Patch vectorId back to Memgraph
            const updates = points.map(p => ({ nodeId: p.id, vectorId: p.id }));
            await session.run(
                `UNWIND $updates AS u
                 MATCH (em:EntityMention {id: u.nodeId})
                 SET em.vectorId = u.vectorId, em.vectorIndexedAt = $now`,
                { updates, now }
            ).catch(err => console.warn('Memgraph patch warn:', err.message));

            indexed += points.length;
            failed  += batch.length - points.length;
            console.log(`OK (+${points.length})`);
        }

        console.log(`\n=== DONE ===`);
        console.log(`  Vectors indexed: ${indexed}`);
        console.log(`  Failed:          ${failed}`);

        // 7. Final coverage check
        const coverageRes = await session.run(`
            MATCH (em:EntityMention)
            RETURN count(em) AS total, count(em.vectorId) AS withVec
        `);
        const r = coverageRes.records[0];
        const total   = typeof r.get('total')   === 'object' ? r.get('total').low   : r.get('total');
        const withVec = typeof r.get('withVec') === 'object' ? r.get('withVec').low : r.get('withVec');
        console.log(`  EntityMention coverage: ${withVec}/${total} vectorized`);

    } finally {
        await session.close();
        await driver.close();
    }
}

main().catch(err => { console.error(err.message); process.exit(1); });
