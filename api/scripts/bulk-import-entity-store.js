'use strict';
/**
 * Bulk-imports EntityMentions → ESEntity for all documents that have
 * unlinked EntityMentions (not yet promoted to the Entity Store).
 *
 * Usage: node api/scripts/bulk-import-entity-store.js [--namespace DEFAULT]
 */

const { v4: uuidv4 } = require('uuid');
const neo4j = require('neo4j-driver');

const BOLT_URL  = process.env.MEMGRAPH_URL      || 'bolt://localhost:7687';
const USER      = process.env.MEMGRAPH_USER     || 'memgraph';
const PASSWORD  = process.env.MEMGRAPH_PASSWORD || 'secret_password_123';

const args = process.argv.slice(2);
const nsIdx = args.indexOf('--namespace');
const namespace = nsIdx >= 0 ? args[nsIdx + 1] : 'DEFAULT';

async function run(session, query, params = {}) {
    const result = await session.run(query, params);
    return result.records.map(r => {
        const obj = {};
        r.keys.forEach(k => {
            const v = r.get(k);
            obj[k] = (v && typeof v === 'object' && 'low' in v) ? v.low : v;
        });
        return obj;
    });
}

async function importDoc(session, docId, ns) {
    const now = new Date().toISOString();
    const result = { created: 0, linked: 0, skipped: 0 };

    // Fetch all unlinked EntityMentions for this doc
    const mentions = await run(session,
        `MATCH (d:Document {id: $docId})-[:MENTIONS]->(em:EntityMention)
         WHERE em.esEntityId IS NULL
         RETURN em.id AS id, em.name AS name, em.type AS type,
                em.category AS category, em.epistemicLayer AS epistemicLayer,
                em.match AS match`,
        { docId }
    );

    for (const m of mentions) {
        if (!m.name || !m.type) { result.skipped++; continue; }

        // Check if ESEntity already exists for this name+type+namespace
        const existing = await run(session,
            `MATCH (e:ESEntity {name: $name, type: $type, namespace: $namespace})
             RETURN e.id AS id LIMIT 1`,
            { name: m.name, type: m.type, namespace: ns }
        );

        let esId;
        if (existing.length > 0) {
            esId = existing[0].id;
            result.linked++;
        } else {
            esId = uuidv4();
            await session.run(
                `CREATE (e:ESEntity {
                    id: $id, name: $name, type: $type, category: $category,
                    namespace: $namespace, description: $description,
                    epistemicLayer: $epistemicLayer, createdAt: $ts, updatedAt: $ts,
                    provenanceType: 'DOCUMENT_IMPORT', provenanceDocId: $docId,
                    provenanceImportedAt: $ts
                })`,
                {
                    id: esId,
                    name: m.name,
                    type: m.type,
                    category: m.category || '',
                    namespace: ns,
                    description: m.match || '',
                    epistemicLayer: m.epistemicLayer || '',
                    ts: now,
                    docId,
                }
            );
            result.created++;
        }

        // Link EntityMention → ESEntity
        await session.run(
            `MATCH (em:EntityMention {id: $emId}), (es:ESEntity {id: $esId})
             MERGE (em)-[:LINKED_TO_ES]->(es)
             SET em.esEntityId = $esId`,
            { emId: m.id, esId }
        );
    }

    // Transfer RELATED_TO edges between EntityMention pairs → ES_RELATED_TO
    try {
        const linked = await run(session,
            `MATCH (d:Document {id: $docId})-[:MENTIONS]->(em:EntityMention)
             WHERE em.esEntityId IS NOT NULL
             RETURN em.id AS emId, em.esEntityId AS esId`,
            { docId }
        );
        if (linked.length >= 2) {
            const emIds = linked.map(r => r.emId);
            const esMap = Object.fromEntries(linked.map(r => [r.emId, r.esId]));
            const rels = await run(session,
                `MATCH (a:EntityMention)-[r:RELATED_TO]->(b:EntityMention)
                 WHERE a.id IN $ids AND b.id IN $ids AND a.id <> b.id
                 RETURN a.id AS aId, b.id AS bId, r.type AS relType,
                        r.context AS context, r.confidence AS confidence
                 LIMIT 200`,
                { ids: emIds }
            );
            for (const rel of rels) {
                const srcId = esMap[rel.aId], tgtId = esMap[rel.bId];
                if (srcId && tgtId && srcId !== tgtId) {
                    await session.run(
                        `MATCH (s:ESEntity {id: $s}), (t:ESEntity {id: $t})
                         MERGE (s)-[r:ES_RELATED_TO {relType: $rt}]->(t)
                         SET r.documentId = $docId, r.extractedAt = $ts`,
                        { s: srcId, t: tgtId, rt: rel.relType || 'RELATED_TO', docId, ts: now }
                    ).catch(() => {});
                }
            }
        }
    } catch (_) { /* non-fatal */ }

    return result;
}

async function main() {
    const driver = neo4j.driver(BOLT_URL, neo4j.auth.basic(USER, PASSWORD));
    const session = driver.session();

    try {
        // Find all docs with unlinked EntityMentions
        const docs = await run(session,
            `MATCH (d:Document)-[:MENTIONS]->(em:EntityMention)
             WHERE em.esEntityId IS NULL
             WITH d, count(em) AS unlinked
             RETURN d.id AS docId, d.documentTitle AS title, unlinked
             ORDER BY unlinked DESC`
        );

        if (docs.length === 0) {
            console.log('All EntityMentions are already linked to ESEntity. Nothing to do.');
            return;
        }

        console.log(`Found ${docs.length} documents with unlinked EntityMentions (namespace="${namespace}"):\n`);
        docs.forEach(d => console.log(`  [${d.unlinked} unlinked] ${(d.title || '(no title)').slice(0, 70)}`));
        console.log('');

        let totalCreated = 0, totalLinked = 0, totalSkipped = 0;

        for (const doc of docs) {
            process.stdout.write(`  Processing: ${(doc.title || doc.docId).slice(0, 60)}...`);
            try {
                const result = await importDoc(session, doc.docId, namespace);
                console.log(` +${result.created} new, ${result.linked} dedup, ${result.skipped} skipped`);
                totalCreated  += result.created;
                totalLinked   += result.linked;
                totalSkipped  += result.skipped;
            } catch (err) {
                console.log(` ERROR: ${err.message}`);
            }
        }

        console.log('\n=== DONE ===');
        console.log(`  ESEntity nodes created:   ${totalCreated}`);
        console.log(`  Mentions linked (dedup):   ${totalLinked}`);
        console.log(`  Mentions skipped (no name/type): ${totalSkipped}`);

        // Final counts
        const esTotal = await run(session, 'MATCH (e:ESEntity) RETURN count(e) AS cnt');
        console.log(`  ESEntity total in graph:  ${esTotal[0]?.cnt ?? '?'}`);

    } finally {
        await session.close();
        await driver.close();
    }
}

main().catch(err => { console.error(err.message); process.exit(1); });
