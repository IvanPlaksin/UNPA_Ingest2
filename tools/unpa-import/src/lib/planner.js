'use strict';

/**
 * Shared import planner — computes the diff between a UGP package and the target
 * Memgraph (+ optionally Qdrant), WITHOUT writing. Used by both the `plan`
 * command (prints/exits) and `apply` (executes the annotated plan).
 *
 * Identity is per-label: lookups/MERGE are scoped by (primaryLabel, identityProp)
 * — the ratified convention (TASK-EXP-006). Nodes/relationships are annotated
 * in place with `_action` so the importer can act without re-matching.
 */

const { ugp, createMemgraphDriver, createQdrantClient } = require('./targets');

const idStr = (id) => (id ? `${id.property}:${id.value}` : '(none)');
const sanitizeLabel = (l) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(l) ? l : null);
const sanitizeRelType = (t) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t) ? t : null);
function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

/**
 * @param {string} file - path to the .ugp.tar.gz
 * @param {object} config - resolved config (memgraph/qdrant/conflict/batchSize)
 * @param {object} [opts] - { includeVectors?: boolean, batchSize?: number }
 * @returns {Promise<{manifest, nodes, rels, plan, summary, labelByIdentity}>}
 */
async function computePlan(file, config, opts = {}) {
    const includeVectors = opts.includeVectors !== false;
    const batchSize = parseInt(opts.batchSize || config.batchSize || 100, 10);

    const reader = new ugp.UGPReader(file);
    const { manifest } = await reader.readManifest();
    if (!manifest) throw new Error('Package has no valid manifest — run `validate` first.');

    const nodes = [];
    for await (const n of reader.readNodes()) nodes.push(n);
    const rels = [];
    for await (const r of reader.readRelationships()) rels.push(r);

    // Map identityKey -> primary label, from the package's own nodes. Relationship
    // endpoints reference these identities, so we can scope their MATCH by label.
    const labelByIdentity = new Map();
    for (const node of nodes) {
        if (node._identity) labelByIdentity.set(idStr(node._identity), (node.labels || [])[0] || null);
    }

    const plan = {
        nodes: { create: [], update: [], skip: [], conflict: [] },
        relationships: { create: [], skip: [], orphan: [] },
        vectors: { upsert: [], skip: [] },
    };

    const { driver } = createMemgraphDriver(config.memgraph);
    const session = driver.session();
    try {
        // ── Nodes: batched lookup grouped by (primary label, identity property) ──
        const byGroup = new Map();
        for (const node of nodes) {
            const p = node._identity?.property;
            const label = sanitizeLabel((node.labels || [])[0] || '');
            if (!p) { node._action = 'CONFLICT'; plan.nodes.conflict.push({ identity: node._identity || null, incomingLabels: node.labels, reason: 'NO_IDENTITY' }); continue; }
            if (!label) { node._action = 'CONFLICT'; plan.nodes.conflict.push({ identity: node._identity, incomingLabels: node.labels, reason: 'NO_LABEL' }); continue; }
            const key = `${label} ${p}`;
            if (!byGroup.has(key)) byGroup.set(key, { label, prop: p, nodes: [] });
            byGroup.get(key).nodes.push(node);
        }

        for (const { label, prop, nodes: group } of byGroup.values()) {
            for (const batch of chunk(group, batchSize)) {
                const values = batch.map((n) => n._identity.value);
                const res = await session.run(
                    `UNWIND $values AS v OPTIONAL MATCH (n:${label} {${prop}: v}) RETURN v AS v, labels(n) AS labels, properties(n) AS props`,
                    { values }
                );
                const found = new Map();
                for (const rec of res.records) {
                    const v = rec.get('v');
                    const labels = rec.get('labels');
                    if (labels && labels.length) {
                        if (!found.has(v)) found.set(v, { labels: new Set(labels), props: rec.get('props'), count: 1 });
                        else found.get(v).count++;
                    }
                }
                for (const node of batch) {
                    const t = found.get(node._identity.value);
                    if (!t) {
                        node._action = node.stub ? 'CREATE_STUB' : 'CREATE';
                        plan.nodes.create.push({ identity: node._identity, labels: node.labels, stub: !!node.stub, action: node._action });
                        continue;
                    }
                    if (t.count > 1) { node._action = 'CONFLICT'; plan.nodes.conflict.push({ identity: node._identity, incomingLabels: node.labels, targetLabels: [...t.labels], reason: 'AMBIGUOUS_TARGET' }); continue; }
                    const incoming = new Set(node.labels);
                    const labelsMatch = [...incoming].every((l) => t.labels.has(l)) || [...t.labels].every((l) => incoming.has(l));
                    if (!labelsMatch) { node._action = 'CONFLICT'; plan.nodes.conflict.push({ identity: node._identity, incomingLabels: node.labels, targetLabels: [...t.labels], reason: 'LABEL_MISMATCH' }); continue; }
                    switch (config.conflict) {
                        case 'overwrite':
                            node._action = 'OVERWRITE';
                            plan.nodes.update.push({ identity: node._identity, labels: node.labels, action: 'OVERWRITE' });
                            break;
                        case 'newer-wins': {
                            const ti = t.props?.updatedAt;
                            const ii = node.props?.updatedAt;
                            if (ii && ti && new Date(ii) > new Date(ti)) { node._action = 'UPDATE_NEWER'; plan.nodes.update.push({ identity: node._identity, action: 'UPDATE_NEWER' }); }
                            else { node._action = 'SKIP'; plan.nodes.skip.push({ identity: node._identity, reason: ti ? 'TARGET_NEWER_OR_EQUAL' : 'EXISTS' }); }
                            break;
                        }
                        case 'skip':
                        default:
                            node._action = 'SKIP';
                            plan.nodes.skip.push({ identity: node._identity, reason: 'EXISTS' });
                    }
                }
            }
        }

        // Identities that will exist on target after import.
        const willExist = new Set();
        for (const n of nodes) if (['CREATE', 'CREATE_STUB', 'OVERWRITE', 'UPDATE_NEWER', 'SKIP'].includes(n._action) && n._identity) willExist.add(idStr(n._identity));

        // ── Relationships ─────────────────────────────────────────────────────
        for (const rel of rels) {
            const fromKey = idStr(rel.from);
            const toKey = idStr(rel.to);
            // annotate endpoint labels from the package node set
            rel.from.label = labelByIdentity.get(fromKey) || null;
            rel.to.label = labelByIdentity.get(toKey) || null;

            if (!willExist.has(fromKey) || !willExist.has(toKey)) {
                rel._action = 'ORPHAN';
                plan.relationships.orphan.push({ type: rel.type, from: rel.from, to: rel.to, reason: !willExist.has(fromKey) ? 'FROM_MISSING' : 'TO_MISSING' });
                continue;
            }
            const relType = sanitizeRelType(rel.type);
            const fromLabel = sanitizeLabel(rel.from.label || '');
            const toLabel = sanitizeLabel(rel.to.label || '');
            if (!relType || !fromLabel || !toLabel) {
                rel._action = 'ORPHAN';
                plan.relationships.orphan.push({ type: rel.type, from: rel.from, to: rel.to, reason: 'INVALID_TYPE_OR_LABEL' });
                continue;
            }
            const exists = await session.run(
                `MATCH (a:${fromLabel} {${rel.from.property}: $fromVal})-[r:${relType}]->(b:${toLabel} {${rel.to.property}: $toVal}) RETURN count(r) AS cnt`,
                { fromVal: rel.from.value, toVal: rel.to.value }
            );
            const cnt = Number(exists.records[0]?.get('cnt') || 0);
            if (cnt > 0) { rel._action = 'SKIP'; plan.relationships.skip.push({ type: rel.type, from: rel.from, to: rel.to, reason: 'EXISTS' }); }
            else { rel._action = 'CREATE'; plan.relationships.create.push({ type: rel.type, from: rel.from, to: rel.to }); }
        }
    } finally {
        await session.close();
        await driver.close();
    }

    // ── Vectors (optional; apply streams them itself) ──────────────────────────
    if (includeVectors) {
        const pkgCollections = await reader.listVectorCollections();
        if (manifest.vectorPolicy !== 'NONE' && pkgCollections.length) {
            const qdrant = createQdrantClient(config.qdrant);
            const colInfo = new Map();
            for (const col of pkgCollections) {
                try {
                    const info = await qdrant.getCollection(col);
                    const vp = info.config?.params?.vectors;
                    const dims = vp && vp.size ? vp.size : (vp ? Object.values(vp)[0]?.size : null);
                    colInfo.set(col, { exists: true, dims });
                } catch { colInfo.set(col, { exists: false }); }
            }
            const expectedDims = manifest.embedding?.dims;
            for await (const { collection, point } of reader.readVectors()) {
                const info = colInfo.get(collection);
                if (!info || !info.exists) { plan.vectors.skip.push({ collection, pointId: point.id, reason: 'COLLECTION_NOT_FOUND' }); continue; }
                if (expectedDims && info.dims && expectedDims !== info.dims) { plan.vectors.skip.push({ collection, pointId: point.id, reason: `DIM_MISMATCH ${expectedDims}!=${info.dims}` }); continue; }
                plan.vectors.upsert.push({ collection, pointId: point.id });
            }
        }
    }

    const summary = {
        nodes: { create: plan.nodes.create.length, update: plan.nodes.update.length, skip: plan.nodes.skip.length, conflict: plan.nodes.conflict.length },
        relationships: { create: plan.relationships.create.length, skip: plan.relationships.skip.length, orphan: plan.relationships.orphan.length },
        vectors: { upsert: plan.vectors.upsert.length, skip: plan.vectors.skip.length },
        hasHardConflicts: plan.nodes.conflict.length > 0,
        hasOrphans: plan.relationships.orphan.length > 0,
    };

    return { manifest, nodes, rels, plan, summary, labelByIdentity };
}

module.exports = { computePlan, idStr, sanitizeLabel, sanitizeRelType, chunk };
