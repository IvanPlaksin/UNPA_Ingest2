'use strict';

/**
 * ImportEngine — writes the annotated plan into the target Memgraph in atomic,
 * per-batch managed transactions (`session.executeWrite`, which also retries
 * transient serialization conflicts). MERGE key = (primaryLabel, identityProp)
 * per the ratified convention; secondary labels are added with SET n:L2:L3.
 *
 * Property temporal envelopes are unwrapped before writing (the package stores
 * neo4j temporals as {$type,value} — they must become real values, not maps).
 */

const { ugp } = require('./targets');
const { sanitizeLabel, sanitizeRelType } = require('./planner');

const WRITE_ACTIONS_CREATE = new Set(['CREATE', 'CREATE_STUB']);
const WRITE_ACTIONS_UPDATE = new Set(['OVERWRITE', 'UPDATE_NEWER']);

class ImportEngine {
    constructor(driver, config = {}) {
        this.driver = driver;
        this.batchSize = parseInt(config.batchSize || 1000, 10);
    }

    /** Import annotated nodes. @returns {{created,updated,skipped,failed}} */
    async importNodes(nodes, onProgress) {
        const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };
        const work = [];
        for (const node of nodes) {
            if (WRITE_ACTIONS_CREATE.has(node._action) || WRITE_ACTIONS_UPDATE.has(node._action)) work.push(node);
            else stats.skipped++;
        }
        for (let i = 0; i < work.length; i += this.batchSize) {
            const batch = work.slice(i, i + this.batchSize);
            const r = await this._writeNodeBatch(batch);
            stats.created += r.created; stats.updated += r.updated; stats.failed += r.failed;
            onProgress?.(Math.min(i + batch.length, work.length), work.length);
        }
        return stats;
    }

    async _writeNodeBatch(batch) {
        const stats = { created: 0, updated: 0, failed: 0 };
        const session = this.driver.session();
        try {
            await session.executeWrite(async (tx) => {
                for (const node of batch) {
                    const primary = sanitizeLabel((node.labels || [])[0]);
                    if (!primary) { stats.failed++; continue; }
                    const others = (node.labels || []).slice(1).map(sanitizeLabel).filter(Boolean);
                    const { property, value } = node._identity;
                    const props = ugp.unwrapPropertiesDeep({ ...(node.props || {}) });
                    delete props[property]; // identity is the MERGE key, not a SET target

                    const labelSet = others.length ? `SET n:${others.join(':')}` : '';
                    if (WRITE_ACTIONS_CREATE.has(node._action)) {
                        const stubSet = node.stub ? 'SET n._ugpStub = true' : '';
                        await tx.run(
                            `MERGE (n:${primary} {${property}: $v}) ON CREATE SET n += $props ${labelSet} ${stubSet}`,
                            { v: value, props }
                        );
                        stats.created++;
                    } else {
                        await tx.run(
                            `MERGE (n:${primary} {${property}: $v}) SET n += $props ${labelSet}`,
                            { v: value, props }
                        );
                        stats.updated++;
                    }
                }
            });
        } catch (err) {
            stats.failed += batch.length;
            throw err;
        } finally {
            await session.close();
        }
        return stats;
    }

    /** Import annotated relationships (only _action==='CREATE'). @returns {{created,skipped,failed}} */
    async importRelationships(rels, onProgress) {
        const stats = { created: 0, skipped: 0, failed: 0 };
        const work = [];
        for (const rel of rels) {
            if (rel._action === 'CREATE') work.push(rel);
            else stats.skipped++;
        }
        for (let i = 0; i < work.length; i += this.batchSize) {
            const batch = work.slice(i, i + this.batchSize);
            const r = await this._writeRelBatch(batch);
            stats.created += r.created; stats.failed += r.failed;
            onProgress?.(Math.min(i + batch.length, work.length), work.length);
        }
        return stats;
    }

    async _writeRelBatch(batch) {
        const stats = { created: 0, failed: 0 };
        const session = this.driver.session();
        try {
            await session.executeWrite(async (tx) => {
                for (const rel of batch) {
                    const type = sanitizeRelType(rel.type);
                    const fromLabel = sanitizeLabel(rel.from.label);
                    const toLabel = sanitizeLabel(rel.to.label);
                    if (!type || !fromLabel || !toLabel) { stats.failed++; continue; }
                    const props = ugp.unwrapPropertiesDeep({ ...(rel.props || {}) });
                    await tx.run(
                        `MATCH (a:${fromLabel} {${rel.from.property}: $fromVal})
                         MATCH (b:${toLabel} {${rel.to.property}: $toVal})
                         MERGE (a)-[r:${type}]->(b) SET r += $props`,
                        { fromVal: rel.from.value, toVal: rel.to.value, props }
                    );
                    stats.created++;
                }
            });
        } catch (err) {
            stats.failed += batch.length;
            throw err;
        } finally {
            await session.close();
        }
        return stats;
    }
}

/**
 * Import vectors into Qdrant AFTER the graph (Canonical Write Order). Groups by
 * collection, checks existence + dims, batch-upserts (named + default vectors).
 * @returns {{upserted, skipped, failed, byCollection}}
 */
async function importVectors(reader, manifest, qdrant, config) {
    const stats = { upserted: 0, skipped: 0, failed: 0, byCollection: {} };
    if (config.skipVectors || manifest.vectorPolicy === 'NONE') return stats;

    const byCollection = new Map();
    for await (const { collection, point } of reader.readVectors()) {
        if (!byCollection.has(collection)) byCollection.set(collection, []);
        byCollection.get(collection).push(point);
    }

    const expectedDims = manifest.embedding?.dims;
    const BATCH = 256;
    for (const [collection, points] of byCollection) {
        let dims = null;
        try {
            const info = await qdrant.getCollection(collection);
            const vp = info.config?.params?.vectors;
            dims = vp && vp.size ? vp.size : (vp ? Object.values(vp)[0]?.size : null);
        } catch {
            stats.skipped += points.length;
            stats.byCollection[collection] = { skipped: points.length, reason: 'COLLECTION_NOT_FOUND' };
            continue;
        }
        if (expectedDims && dims && expectedDims !== dims) {
            stats.skipped += points.length;
            stats.byCollection[collection] = { skipped: points.length, reason: `DIM_MISMATCH ${expectedDims}!=${dims}` };
            continue;
        }
        let up = 0;
        for (let i = 0; i < points.length; i += BATCH) {
            const chunk = points.slice(i, i + BATCH).map((p) => ugp.toQdrantPoint(p));
            await qdrant.upsert(collection, { wait: true, points: chunk });
            up += chunk.length;
        }
        stats.upserted += up;
        stats.byCollection[collection] = { upserted: up };
    }
    return stats;
}

module.exports = { ImportEngine, importVectors };
