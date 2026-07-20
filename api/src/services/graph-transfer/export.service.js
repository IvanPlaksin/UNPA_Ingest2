'use strict';

/**
 * Graph-Transfer Export Service
 *
 * Builds a UGP (UNPA Graph Package) from a selective slice of Memgraph (+ the
 * linked Qdrant vector points) for transfer to another instance. Pure backend
 * logic — the queue/route layers call preview()/executeExport().
 *
 * Strategy (ratified in TASK-EXP-000/§10 v2):
 *  - identity: per-label Identity Map (no mass uuid generation)
 *  - Qdrant: REVERSE payload lookup (point payload → node identity value)
 *  - boundary: STUB (default) / EXCLUDE / CLOSURE for edges leaving the slice
 *  - transactions/reads via memgraph.runQuery; qdrant via qdrantService.client
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const ugp = require('../../lib/ugp');
const {
    UGPWriter,
    buildManifest,
    serializeNode,
    serializeRelationship,
    serializeVectorPoint,
    resolveIdentity,
    getCollectionLinkage,
    resolveLinkageValue,
    BOUNDARY_POLICY,
    VECTOR_POLICY,
} = ugp;

// Lazy singletons (avoid circular deps at module load)
let _mg = null;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }
let _qd = null;
function qd() { if (!_qd) _qd = require('../qdrant.service'); return _qd; }

const EXPORTS_DIR = path.resolve(process.cwd(), 'Artefacts', 'Exports');

const MAX_SLICE_NODES = parseInt(process.env.GRAPH_TRANSFER_MAX_NODES || '200000', 10);
const NODE_FETCH_BATCH = 1000;
const EDGE_BATCH = 500;
const VECTOR_SCROLL = 256;

// Payload-schema discovery (TASK-GT-004): sample size + max distinct values to enumerate.
const PAYLOAD_SAMPLE_SIZE = parseInt(process.env.GRAPH_TRANSFER_PAYLOAD_SAMPLE || '1000', 10);
const MAX_DISTINCT_VALUES = 50;

/**
 * Translate a vectorFilters collection config into a Qdrant filter object.
 * operators: eq | in | any | range | exists. logic AND (default) → must, OR → should.
 * `exists` becomes a must_not is_null clause (always ANDed). Returns null if empty.
 * @throws on an unknown operator.
 */
function buildQdrantFilter(cfg) {
    if (!cfg || !Array.isArray(cfg.conditions) || cfg.conditions.length === 0) return null;
    const positives = [];
    const negatives = [];
    for (const c of cfg.conditions) {
        switch (c.operator) {
            case 'eq': positives.push({ key: c.field, match: { value: c.value } }); break;
            case 'in':
            case 'any': positives.push({ key: c.field, match: { any: Array.isArray(c.value) ? c.value : [c.value] } }); break;
            case 'range': positives.push({ key: c.field, range: c.value || {} }); break;
            case 'exists': negatives.push({ is_null: { key: c.field } }); break;
            default: throw new Error(`Unknown vector filter operator: ${c.operator}`);
        }
    }
    const filter = {};
    if (positives.length) { if (cfg.logic === 'OR') filter.should = positives; else filter.must = positives; }
    if (negatives.length) filter.must_not = negatives;
    return Object.keys(filter).length ? filter : null;
}

/** Human-readable one-line summary of a vectorFilters collection config. */
function summarizeFilter(cfg) {
    if (!cfg || !Array.isArray(cfg.conditions) || cfg.conditions.length === 0) return null;
    const parts = cfg.conditions.map((c) => {
        switch (c.operator) {
            case 'eq': return `${c.field}=${c.value}`;
            case 'in':
            case 'any': {
                const arr = Array.isArray(c.value) ? c.value : [c.value];
                return `${c.field} in [${arr.slice(0, 3).join(',')}${arr.length > 3 ? '…' : ''}]`;
            }
            case 'range': {
                const r = [];
                if (c.value?.gte !== undefined) r.push(`>=${c.value.gte}`);
                if (c.value?.gt !== undefined) r.push(`>${c.value.gt}`);
                if (c.value?.lte !== undefined) r.push(`<=${c.value.lte}`);
                if (c.value?.lt !== undefined) r.push(`<${c.value.lt}`);
                return `${c.field} ${r.join(' ')}`;
            }
            case 'exists': return `${c.field} exists`;
            default: return `${c.field} ${c.operator} ${c.value}`;
        }
    });
    return parts.join(cfg.logic === 'OR' ? ' OR ' : ' AND ');
}

/** Infer a Qdrant-ish payload field type from a JS value. */
function inferPayloadType(value) {
    if (typeof value === 'string') return 'keyword';
    if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'float';
    if (typeof value === 'boolean') return 'bool';
    if (Array.isArray(value)) return 'array';
    return 'object';
}

// Known embedding fingerprint for this platform (multilingual-e5-large, 1024d).
const DEFAULT_EMBEDDING = { model: 'multilingual-e5-large', dims: 1024 };

const SELECTION_MODES = ['NAMESPACE', 'LABELS', 'CYPHER', 'CATALOG_GRAPHS'];
const WRITE_CLAUSES = ['CREATE', 'MERGE', 'DELETE', 'DETACH', 'SET', 'REMOVE', 'DROP', 'CALL', 'FOREACH', 'LOAD'];

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

/** Reject write clauses in a user-supplied CYPHER selection. */
function validateReadOnlyCypher(cypher) {
    if (!cypher || typeof cypher !== 'string') throw new Error('CYPHER mode requires a cypher string');
    const upper = cypher.toUpperCase();
    for (const kw of WRITE_CLAUSES) {
        if (new RegExp(`\\b${kw}\\b`).test(upper)) {
            throw new Error(`Write/side-effecting clause "${kw}" is not allowed in an export selection`);
        }
    }
    if (!/\bRETURN\b/.test(upper)) throw new Error('CYPHER selection must contain a RETURN clause returning n');
    if (!/\bn\b/.test(cypher)) throw new Error('CYPHER selection must return a node bound as n');
}

class ExportService {
    /** Validate a Selection/Export request; returns { errors: string[] }. */
    validateRequest(request) {
        const errors = [];
        if (!request || typeof request !== 'object') return { errors: ['request must be an object'] };
        if (!SELECTION_MODES.includes(request.selectionMode)) {
            errors.push(`selectionMode must be one of ${SELECTION_MODES.join(', ')}`);
        }
        switch (request.selectionMode) {
            case 'NAMESPACE':
                if (!Array.isArray(request.namespacePrefixes) || request.namespacePrefixes.length === 0)
                    errors.push('NAMESPACE mode requires namespacePrefixes[]');
                break;
            case 'LABELS':
                if (!Array.isArray(request.labels) || request.labels.length === 0)
                    errors.push('LABELS mode requires labels[]');
                break;
            case 'CYPHER':
                try { validateReadOnlyCypher(request.cypher); } catch (e) { errors.push(e.message); }
                break;
            case 'CATALOG_GRAPHS':
                if (!Array.isArray(request.graphIds) || request.graphIds.length === 0)
                    errors.push('CATALOG_GRAPHS mode requires graphIds[]');
                break;
        }
        if (request.boundaryPolicy && !Object.values(BOUNDARY_POLICY).includes(request.boundaryPolicy))
            errors.push(`invalid boundaryPolicy: ${request.boundaryPolicy}`);
        if (request.vectorPolicy && !Object.values(VECTOR_POLICY).includes(request.vectorPolicy))
            errors.push(`invalid vectorPolicy: ${request.vectorPolicy}`);
        return { errors };
    }

    /**
     * Collect the internal ids of the slice (capped at MAX_SLICE_NODES).
     * @returns {Promise<{ iids: number[], truncated: boolean }>}
     */
    async _collectSliceIds(request) {
        const cap = MAX_SLICE_NODES;
        let rows;
        if (request.selectionMode === 'CYPHER') {
            // Run the user query as-is (it may carry its own LIMIT — do NOT append one,
            // that would produce a double-LIMIT syntax error). Cap in app instead.
            validateReadOnlyCypher(request.cypher);
            const r = await mg().runQuery(request.cypher, {});
            const iids = [];
            for (const row of r) {
                const node = row.n;
                if (node && typeof node.identity !== 'undefined') iids.push(Number(node.identity));
            }
            return { iids: iids.slice(0, cap), truncated: iids.length > cap };
        }

        let cypher;
        let params = {};
        switch (request.selectionMode) {
            case 'NAMESPACE':
                cypher = `MATCH (n) WHERE any(p IN $prefixes WHERE n.namespace STARTS WITH p) RETURN id(n) AS iid LIMIT ${cap + 1}`;
                params = { prefixes: request.namespacePrefixes };
                break;
            case 'LABELS':
                cypher = `MATCH (n) WHERE any(l IN labels(n) WHERE l IN $labels) RETURN id(n) AS iid LIMIT ${cap + 1}`;
                params = { labels: request.labels };
                break;
            case 'CATALOG_GRAPHS':
                cypher = `
                    MATCH (g:GraphDefinition) WHERE g.graphId IN $graphIds
                    OPTIONAL MATCH (g)-[*1..3]-(rel)
                    WITH collect(DISTINCT g) + collect(DISTINCT rel) AS ns
                    UNWIND ns AS n
                    WITH DISTINCT n WHERE n IS NOT NULL
                    RETURN id(n) AS iid LIMIT ${cap + 1}`;
                params = { graphIds: request.graphIds };
                break;
        }
        rows = await mg().runQuery(cypher, params);
        const iids = rows.map((r) => Number(r.iid));
        return { iids: iids.slice(0, cap), truncated: iids.length > cap };
    }

    /** Fetch full nodes for a batch of internal ids. */
    async _fetchNodes(iids) {
        if (iids.length === 0) return [];
        const r = await mg().runQuery('MATCH (n) WHERE id(n) IN $iids RETURN id(n) AS iid, n', { iids });
        return r.map((row) => ({
            iid: Number(row.iid),
            labels: row.n.labels,
            properties: row.n.properties,
        }));
    }

    /**
     * Preview: counts + validation, no file written.
     * @param {object} request
     * @returns {Promise<object>} PreviewResult
     */
    async preview(request) {
        const errors = [];
        const warnings = [];
        const { errors: vErrors } = this.validateRequest(request);
        errors.push(...vErrors);
        const empty = {
            counts: { nodes: 0, nodesByLabel: {}, relationships: 0, relationshipsByType: {}, boundaryEdges: 0, stubNodes: 0 },
            vectors: { collections: [] },
            nodesWithoutIdentity: [],
            containsExecutableGraphs: false,
        };
        if (errors.length) return { valid: false, errors, warnings, ...empty };

        let iids, truncated;
        try {
            ({ iids, truncated } = await this._collectSliceIds(request));
        } catch (e) {
            return { valid: false, errors: [`slice query failed: ${e.message}`], warnings, ...empty };
        }
        if (truncated) warnings.push(`Selection truncated at ${MAX_SLICE_NODES} nodes; preview counts are partial.`);
        if (iids.length === 0) warnings.push('Selection matched 0 nodes.');

        const sliceSet = new Set(iids);
        const nodeCountByLabel = {};
        const identityGaps = {}; // label -> { count, samples[] }
        const identityValues = new Set();
        const identityToLabel = new Map(); // identity value → primary label (for per-label vector linkage)
        let containsExecutableGraphs = false;

        for (const batch of chunk(iids, NODE_FETCH_BATCH)) {
            const nodes = await this._fetchNodes(batch);
            for (const node of nodes) {
                for (const label of node.labels) {
                    nodeCountByLabel[label] = (nodeCountByLabel[label] || 0) + 1;
                    if (label === 'GraphDefinition' || label === 'CatalogEntry' || label === 'GraphVersion')
                        containsExecutableGraphs = true;
                }
                const ident = resolveIdentity(node.labels, node.properties);
                if (!ident) {
                    const key = node.labels[0] || '(no-label)';
                    if (!identityGaps[key]) identityGaps[key] = { labels: node.labels, count: 0, sampleInternalIds: [] };
                    identityGaps[key].count++;
                    if (identityGaps[key].sampleInternalIds.length < 5) identityGaps[key].sampleInternalIds.push(node.iid);
                } else {
                    identityValues.add(String(ident.value));
                    if (!identityToLabel.has(String(ident.value))) identityToLabel.set(String(ident.value), node.labels[0]);
                }
            }
        }

        // Relationships + boundary edges
        let relationships = 0;
        let boundaryEdges = 0;
        const relationshipsByType = {};
        const externalEndpoints = new Set();
        for (const batch of chunk(iids, EDGE_BATCH)) {
            // outgoing
            const out = await mg().runQuery(
                'MATCH (a)-[r]->(b) WHERE id(a) IN $iids RETURN id(b) AS bid, type(r) AS t',
                { iids: batch }
            );
            for (const row of out) {
                const bid = Number(row.bid);
                if (sliceSet.has(bid)) {
                    relationships++;
                    relationshipsByType[row.t] = (relationshipsByType[row.t] || 0) + 1;
                } else {
                    boundaryEdges++;
                    externalEndpoints.add(bid);
                }
            }
            // incoming boundary (source outside slice)
            const inc = await mg().runQuery(
                'MATCH (a)-[r]->(b) WHERE id(b) IN $iids RETURN id(a) AS aid',
                { iids: batch }
            );
            for (const row of inc) {
                const aid = Number(row.aid);
                if (!sliceSet.has(aid)) {
                    boundaryEdges++;
                    externalEndpoints.add(aid);
                }
            }
        }

        const boundaryPolicy = request.boundaryPolicy || BOUNDARY_POLICY.STUB;
        const stubNodes = boundaryPolicy === BOUNDARY_POLICY.EXCLUDE ? 0 : externalEndpoints.size;

        // Vector collections preview (also yields per-label vector linkage, single-scroll)
        const { collections, labelLinkage } = await this._previewVectors(request, identityValues, identityToLabel);

        // Enrich nodes-by-label with vector dependency info (data-slice graph↔vector marks).
        const nodesByLabel = {};
        for (const [label, count] of Object.entries(nodeCountByLabel)) {
            const ll = labelLinkage[label];
            nodesByLabel[label] = {
                count,
                vectorLinkage: ll
                    ? {
                        hasVectors: ll.linkedPoints > 0,
                        linkedCollection: ll.linkedCollection,
                        linkedPoints: ll.linkedPoints,
                        coverage: count > 0 ? Math.round((ll.linkedPoints / count) * 100) / 100 : 0,
                        namedVectors: ll.namedVectors || null,
                    }
                    : { hasVectors: false, linkedCollection: null, linkedPoints: 0, coverage: 0, namedVectors: null },
            };
        }

        return {
            valid: true,
            errors: [],
            warnings,
            counts: {
                nodes: iids.length,
                nodesByLabel,
                relationships,
                relationshipsByType,
                boundaryEdges,
                stubNodes,
            },
            vectors: { collections },
            nodesWithoutIdentity: Object.values(identityGaps),
            containsExecutableGraphs,
        };
    }

    /**
     * Build the per-collection vector preview + per-label vector linkage in ONE
     * scroll per collection. Returns { collections, labelLinkage } where
     * labelLinkage[label] = { linkedCollection, linkedPoints, namedVectors }.
     */
    async _previewVectors(request, identityValues, identityToLabel = new Map()) {
        const selected = request.selectedCollections || {};
        const vectorFilters = request.vectorFilters || {};
        const labelLinkage = {};
        let live;
        try {
            live = await qd().client.getCollections();
        } catch (e) {
            return { collections: [{ name: '(qdrant unavailable)', linked: false, error: e.message, selected: false, pointsInSlice: 0, totalPoints: 0 }], labelLinkage };
        }
        const out = [];
        for (const c of live.collections || []) {
            const name = c.name;
            let info;
            try { info = await qd().client.getCollection(name); } catch { info = {}; }
            const totalPoints = info.points_count || 0;
            if (totalPoints === 0) continue; // skip empty collections (most workspace_*)

            const linkage = getCollectionLinkage(name);
            const defaultSelected = linkage.linked === true; // ratified: linked default-on, unlinked default-off
            const isSelected = Object.prototype.hasOwnProperty.call(selected, name) ? !!selected[name] : defaultSelected;

            // User payload filter for this collection (if any).
            let qdrantFilter = null;
            let filterError = null;
            try { qdrantFilter = buildQdrantFilter(vectorFilters[name]); }
            catch (e) { filterError = e.message; }
            const filterSummary = summarizeFilter(vectorFilters[name]);

            let pointsInSlice = 0;
            let linkedLabels = [];
            if (linkage.linked) {
                const r = await this._countLinkedPoints(name, identityValues, qdrantFilter, identityToLabel);
                pointsInSlice = r.count;
                linkedLabels = [...r.matchedLabels];
                for (const [label, cnt] of Object.entries(r.perLabel)) {
                    // A label maps to one collection; keep the collection with the most matches.
                    if (!labelLinkage[label] || cnt > labelLinkage[label].linkedPoints) {
                        labelLinkage[label] = { linkedCollection: name, linkedPoints: cnt, namedVectors: linkage.namedVectors || null };
                    }
                }
            } else if (qdrantFilter) {
                pointsInSlice = await this._countFilteredPoints(name, qdrantFilter);
            }

            out.push({
                name,
                linked: !!linkage.linked,
                unknown: !!linkage.unknown,
                namedVectors: linkage.namedVectors || null,
                linkedLabels,
                pointsInSlice,
                totalPoints,
                selected: isSelected,
                filtered: !!qdrantFilter,
                filterSummary: filterSummary || null,
                filterError,
            });
        }
        return { collections: out, labelLinkage };
    }

    /**
     * Count linked points whose linkage value is in the slice, with an optional
     * server-side payload filter. Also breaks matched points down per source
     * label (via identityToLabel) for the data-slice dependency badges.
     * @returns {{ count, perLabel, matchedLabels:Set }}
     */
    async _countLinkedPoints(collection, identityValues, qdrantFilter = null, identityToLabel = new Map()) {
        const result = { count: 0, perLabel: {}, matchedLabels: new Set() };
        if (identityValues.size === 0) return result;
        let offset = null;
        // User filter is applied server-side (narrows the scroll); linkage identity
        // match stays in-app because the identity set can be very large (100k+),
        // which makes a Qdrant `match any [...]` impractical.
        for (let i = 0; i < 100000; i++) {
            let resp;
            try {
                resp = await qd().client.scroll(collection, {
                    limit: VECTOR_SCROLL, offset, with_payload: true, with_vector: false,
                    ...(qdrantFilter ? { filter: qdrantFilter } : {}),
                });
            } catch { break; }
            for (const p of resp.points || []) {
                const v = resolveLinkageValue(collection, p.payload);
                if (v !== null && identityValues.has(String(v))) {
                    result.count++;
                    const label = identityToLabel.get(String(v));
                    if (label) {
                        result.perLabel[label] = (result.perLabel[label] || 0) + 1;
                        result.matchedLabels.add(label);
                    }
                }
            }
            if (!resp.next_page_offset) break;
            offset = resp.next_page_offset;
        }
        return result;
    }

    /** Count points matching a payload filter (unlinked collections). */
    async _countFilteredPoints(collection, qdrantFilter) {
        try {
            const r = await qd().client.count(collection, { filter: qdrantFilter, exact: true });
            return r.count || 0;
        } catch {
            return 0;
        }
    }

    /**
     * Execute the export, streaming to a UGP package on disk.
     * @param {object} request
     * @param {(percent:number, phase:string, message?:string)=>void} onProgress
     * @returns {Promise<{ filePath, fileSize, exportRecordId, counts }>}
     */
    async executeExport(request, onProgress = () => {}) {
        const { errors } = this.validateRequest(request);
        if (errors.length) throw new Error(`Invalid export request: ${errors.join('; ')}`);

        const boundaryPolicy = request.boundaryPolicy || BOUNDARY_POLICY.STUB;
        const vectorPolicy = request.vectorPolicy || VECTOR_POLICY.EMBED_POINTS;
        const selectedCollections = request.selectedCollections || {};

        fs.mkdirSync(EXPORTS_DIR, { recursive: true });
        const exportId = uuidv4();
        const filePath = path.join(EXPORTS_DIR, `${exportId}.ugp.tar.gz`);

        onProgress(0, 'init', 'Collecting slice');
        const { iids, truncated } = await this._collectSliceIds(request);
        const sliceSet = new Set(iids);

        const writer = new UGPWriter(filePath);
        await writer.open();

        const counts = {
            nodes: 0,
            relationships: 0,
            stubNodes: 0,
            skippedNoIdentity: 0,
            vectorPoints: {},
        };
        const identityByIid = new Map(); // iid -> {property, value}
        const identityValues = new Set();
        let containsExecutableGraphs = false;

        // ── Phase 1: nodes (5-40%) ────────────────────────────────────────────
        const nodeBatches = chunk(iids, NODE_FETCH_BATCH);
        for (let bi = 0; bi < nodeBatches.length; bi++) {
            const nodes = await this._fetchNodes(nodeBatches[bi]);
            for (const node of nodes) {
                const ident = resolveIdentity(node.labels, node.properties);
                if (!ident) { counts.skippedNoIdentity++; continue; }
                identityByIid.set(node.iid, ident);
                identityValues.add(String(ident.value));
                if (node.labels.some((l) => ['GraphDefinition', 'CatalogEntry', 'GraphVersion'].includes(l)))
                    containsExecutableGraphs = true;
                writer.writeNode(serializeNode(node));
                counts.nodes++;
            }
            onProgress(5 + Math.round((35 * (bi + 1)) / Math.max(1, nodeBatches.length)), 'nodes',
                `Nodes ${counts.nodes}`);
        }

        // ── Phase 2: relationships + boundary (40-70%) ────────────────────────
        onProgress(40, 'relationships', 'Scanning relationships');
        const boundaryEdges = []; // {aid, bid, type, props}
        const internalEdges = []; // {aid, bid, type, props}
        const externalEndpoints = new Set();
        const edgeBatches = chunk(iids, EDGE_BATCH);
        for (let bi = 0; bi < edgeBatches.length; bi++) {
            const batch = edgeBatches[bi];
            const out = await mg().runQuery(
                'MATCH (a)-[r]->(b) WHERE id(a) IN $iids RETURN id(a) AS aid, id(b) AS bid, type(r) AS t, properties(r) AS props',
                { iids: batch }
            );
            for (const row of out) {
                const aid = Number(row.aid), bid = Number(row.bid);
                const edge = { aid, bid, type: row.t, props: row.props || {} };
                if (sliceSet.has(bid)) internalEdges.push(edge);
                else { boundaryEdges.push(edge); externalEndpoints.add(bid); }
            }
            const inc = await mg().runQuery(
                'MATCH (a)-[r]->(b) WHERE id(b) IN $iids RETURN id(a) AS aid, id(b) AS bid, type(r) AS t, properties(r) AS props',
                { iids: batch }
            );
            for (const row of inc) {
                const aid = Number(row.aid), bid = Number(row.bid);
                if (sliceSet.has(aid)) continue; // internal — already captured by outgoing pass
                boundaryEdges.push({ aid, bid, type: row.t, props: row.props || {} });
                externalEndpoints.add(aid);
            }
            onProgress(40 + Math.round((15 * (bi + 1)) / Math.max(1, edgeBatches.length)), 'relationships',
                `Edges scanned (batch ${bi + 1}/${edgeBatches.length})`);
        }

        // Resolve external endpoints (stub/closure) — needed before finalizing nodes.
        if (boundaryPolicy !== BOUNDARY_POLICY.EXCLUDE && externalEndpoints.size > 0) {
            for (const batch of chunk([...externalEndpoints], NODE_FETCH_BATCH)) {
                const extNodes = await this._fetchNodes(batch);
                for (const node of extNodes) {
                    const ident = resolveIdentity(node.labels, node.properties);
                    if (!ident) { counts.skippedNoIdentity++; continue; }
                    identityByIid.set(node.iid, ident);
                    if (boundaryPolicy === BOUNDARY_POLICY.STUB) {
                        // stub: identity property only, flagged so importer MERGEs without SET
                        writer.writeNode(serializeNode(
                            { labels: node.labels, properties: { [ident.property]: ident.value } },
                            { stub: true }
                        ));
                    } else {
                        // CLOSURE: pull the full external node in as a normal node
                        writer.writeNode(serializeNode(node));
                    }
                    counts.stubNodes++;
                }
            }
        }
        await writer.finalizeNodes();

        // Write edges (internal always; boundary unless EXCLUDE and endpoint resolved)
        onProgress(60, 'relationships', 'Writing relationships');
        const writeEdge = (edge) => {
            const from = identityByIid.get(edge.aid);
            const to = identityByIid.get(edge.bid);
            if (!from || !to) return false; // endpoint dropped (no identity / excluded)
            writer.writeRelationship(serializeRelationship({
                type: edge.type,
                startNodeIdentity: from,
                endNodeIdentity: to,
                properties: edge.props,
            }));
            counts.relationships++;
            return true;
        };
        for (const e of internalEdges) writeEdge(e);
        if (boundaryPolicy !== BOUNDARY_POLICY.EXCLUDE) for (const e of boundaryEdges) writeEdge(e);
        await writer.finalizeRelationships();

        // ── Phase 3: vectors (70-95%) ─────────────────────────────────────────
        onProgress(70, 'vectors', 'Exporting vectors');
        if (vectorPolicy !== VECTOR_POLICY.NONE) {
            const collectionsToExport = await this._resolveSelectedCollections(request, selectedCollections);
            const vectorFilters = request.vectorFilters || {};
            for (let ci = 0; ci < collectionsToExport.length; ci++) {
                const name = collectionsToExport[ci];
                const qdrantFilter = buildQdrantFilter(vectorFilters[name]); // throws on bad operator → job fails clearly
                const n = await this._exportCollection(writer, name, identityValues, vectorPolicy, qdrantFilter);
                if (n > 0) counts.vectorPoints[name] = n;
                onProgress(70 + Math.round((25 * (ci + 1)) / Math.max(1, collectionsToExport.length)), 'vectors',
                    `Collection ${name}: ${n}`);
            }
        }
        await writer.finalizeVectors();

        // ── Phase 4: finalize (95-100%) ───────────────────────────────────────
        onProgress(95, 'finalize', 'Finalizing package');
        const manifest = buildManifest({
            sourceInstanceId: process.env.INSTANCE_ID || 'unpa-dev',
            selectionMode: request.selectionMode,
            namespacePrefixes: request.namespacePrefixes,
            labels: request.labels,
            cypher: request.cypher,
            graphIds: request.graphIds,
            boundaryPolicy,
            vectorPolicy,
            selectedCollections,
            counts: {
                nodes: counts.nodes,
                relationships: counts.relationships,
                stubNodes: counts.stubNodes,
                vectorPoints: counts.vectorPoints,
            },
            embedding: DEFAULT_EMBEDDING,
            containsExecutableGraphs,
        });
        await writer.writeManifest(manifest);
        await writer.close();

        const fileSize = fs.statSync(filePath).size;

        // ── Phase 5: ExportRecord ─────────────────────────────────────────────
        const exportRecordId = await this._writeExportRecord({
            exportId, request, counts, filePath, fileSize, boundaryPolicy, vectorPolicy, truncated,
        });
        onProgress(100, 'completed', 'Done');

        return { filePath, fileSize, exportRecordId, counts, truncated };
    }

    /** Which collections to actually export (selected linked + explicitly-selected unlinked). */
    async _resolveSelectedCollections(request, selected) {
        let live;
        try { live = await qd().client.getCollections(); } catch { return []; }
        const result = [];
        for (const c of live.collections || []) {
            const name = c.name;
            const linkage = getCollectionLinkage(name);
            const defaultSelected = linkage.linked === true;
            const isSelected = Object.prototype.hasOwnProperty.call(selected, name) ? !!selected[name] : defaultSelected;
            if (isSelected) result.push(name);
        }
        return result;
    }

    /** Scroll one collection and write matching points. Returns count written. */
    async _exportCollection(writer, collection, identityValues, vectorPolicy, qdrantFilter = null) {
        const linkage = getCollectionLinkage(collection);
        const embed = vectorPolicy === VECTOR_POLICY.EMBED_POINTS;
        let offset = null;
        let written = 0;
        for (let i = 0; i < 100000; i++) {
            let resp;
            try {
                resp = await qd().client.scroll(collection, {
                    limit: VECTOR_SCROLL, offset, with_payload: true, with_vector: embed,
                    ...(qdrantFilter ? { filter: qdrantFilter } : {}),
                });
            } catch { break; }
            for (const p of resp.points || []) {
                if (linkage.linked) {
                    const v = resolveLinkageValue(collection, p.payload);
                    if (v === null || !identityValues.has(String(v))) continue;
                }
                // unlinked selected collection → include all points
                writer.writeVectorPoint(collection, serializeVectorPoint(this._normalizePoint(p, embed)));
                written++;
            }
            if (!resp.next_page_offset) break;
            offset = resp.next_page_offset;
        }
        return written;
    }

    /** Normalize a Qdrant scroll point into the serializer's expected shape. */
    _normalizePoint(p, embed) {
        if (!embed) return { id: p.id, payload: p.payload || {} };
        const raw = p.vector;
        if (Array.isArray(raw)) return { id: p.id, vector: raw, payload: p.payload || {} };
        if (raw && typeof raw === 'object') return { id: p.id, vectors: raw, payload: p.payload || {} };
        return { id: p.id, payload: p.payload || {} };
    }

    /**
     * Build the re-runnable snapshot of a request (everything needed to replay it).
     * Kept in sync with validateRequest / executeExport inputs.
     */
    static buildExportRequestSnapshot(request, boundaryPolicy, vectorPolicy) {
        return {
            selectionMode: request.selectionMode,
            namespacePrefixes: request.namespacePrefixes || null,
            labels: request.labels || null,
            cypher: request.cypher || null,
            graphIds: request.graphIds || null,
            boundaryPolicy: boundaryPolicy || request.boundaryPolicy || null,
            vectorPolicy: vectorPolicy || request.vectorPolicy || null,
            selectedCollections: request.selectedCollections || {},
            vectorFilters: request.vectorFilters || null, // Phase 2 forward-compat
        };
    }

    /**
     * Discover a collection's payload schema by sampling points: field names,
     * inferred types, distinct values (low-cardinality only), min/max (numerics),
     * coverage, and the subset suitable for filtering. Powers the vector-filter UI.
     * @param {string} collectionName
     * @returns {Promise<object>}
     * @throws 'COLLECTION_NOT_FOUND'
     */
    async getCollectionPayloadSchema(collectionName) {
        let info;
        try { info = await qd().client.getCollection(collectionName); }
        catch { throw new Error('COLLECTION_NOT_FOUND'); }

        const totalPoints = info.points_count || 0;
        const sampleSize = Math.min(PAYLOAD_SAMPLE_SIZE, totalPoints);

        // Sample points (scroll from start — fast; biased but adequate for schema discovery).
        const sampled = [];
        let offset = null;
        while (sampled.length < sampleSize) {
            let resp;
            try {
                resp = await qd().client.scroll(collectionName, {
                    limit: Math.min(VECTOR_SCROLL, sampleSize - sampled.length),
                    offset, with_payload: true, with_vector: false,
                });
            } catch { break; }
            for (const p of resp.points || []) sampled.push(p);
            if (!resp.next_page_offset || (resp.points || []).length === 0) break;
            offset = resp.next_page_offset;
        }

        const seen = Math.max(1, sampled.length);
        const stats = new Map(); // field -> { type, values:Set, count, min, max, truncated }
        for (const p of sampled) {
            const payload = p.payload || {};
            for (const [key, value] of Object.entries(payload)) {
                if (!stats.has(key)) stats.set(key, { type: inferPayloadType(value), values: new Set(), count: 0, min: null, max: null, truncated: false });
                const s = stats.get(key);
                s.count++;
                const addScalar = (v) => {
                    if (typeof v === 'string' || typeof v === 'boolean') {
                        if (s.values.size < MAX_DISTINCT_VALUES) s.values.add(v);
                        else s.truncated = true;
                    }
                };
                if (Array.isArray(value)) { s.type = 'array'; value.forEach(addScalar); }
                else if (typeof value === 'number') {
                    s.min = s.min === null ? value : Math.min(s.min, value);
                    s.max = s.max === null ? value : Math.max(s.max, value);
                } else addScalar(value);
            }
        }

        const fields = [];
        const filterableFields = [];
        for (const [name, s] of stats) {
            const coverage = Math.round((s.count / seen) * 100) / 100;
            const cardinality = s.values.size;
            const field = { name, type: s.type, coverage, cardinality: cardinality || null, distinctValues: null };
            // Enumerate distinct values for low-cardinality string/bool/array fields only.
            if (!s.truncated && cardinality > 0 && cardinality <= MAX_DISTINCT_VALUES && s.type !== 'integer' && s.type !== 'float') {
                field.distinctValues = [...s.values].sort();
                filterableFields.push(name);
            }
            if (s.type === 'integer' || s.type === 'float') { field.min = s.min; field.max = s.max; }
            fields.push(field);
        }
        // Filterable first, then by descending coverage.
        fields.sort((a, b) => {
            const af = filterableFields.includes(a.name) ? 0 : 1;
            const bf = filterableFields.includes(b.name) ? 0 : 1;
            return af !== bf ? af - bf : b.coverage - a.coverage;
        });

        return { collection: collectionName, totalPoints, sampleSize: sampled.length, fields, filterableFields };
    }

    /** List Qdrant collections enriched with graph-linkage info (for the filter UI). */
    async listCollectionsMeta() {
        let live;
        try { live = await qd().client.getCollections(); } catch (e) { return { collections: [], error: e.message }; }
        const out = [];
        for (const c of live.collections || []) {
            const linkage = getCollectionLinkage(c.name);
            let totalPoints = 0;
            try { totalPoints = (await qd().client.getCollection(c.name)).points_count || 0; } catch { /* ignore */ }
            out.push({ name: c.name, linked: !!linkage.linked, unknown: !!linkage.unknown, namedVectors: linkage.namedVectors || null, totalPoints });
        }
        return { collections: out };
    }

    async _writeExportRecord({ exportId, request, counts, filePath, fileSize, boundaryPolicy, vectorPolicy, truncated }) {
        const summaryMap = {
            NAMESPACE: `NAMESPACE: ${(request.namespacePrefixes || []).join(', ')}`,
            LABELS: `LABELS: ${(request.labels || []).join(', ')}`,
            CYPHER: `CYPHER: ${String(request.cypher || '').slice(0, 80)}`,
            CATALOG_GRAPHS: `CATALOG_GRAPHS: ${(request.graphIds || []).join(', ')}`,
        };
        const exportRequest = ExportService.buildExportRequestSnapshot(request, boundaryPolicy, vectorPolicy);
        try {
            await mg().runQuery(
                `CREATE (e:ExportRecord:CORE {
                    id: $exportId, exportId: $exportId, namespace: 'CORE',
                    createdAt: $createdAt, status: 'completed',
                    selectionMode: $selectionMode, selectionSummary: $summary,
                    boundaryPolicy: $boundaryPolicy, vectorPolicy: $vectorPolicy,
                    counts_nodes: $nodes, counts_relationships: $rels, counts_stubNodes: $stubs,
                    counts_skippedNoIdentity: $skipped, counts_vectorPoints: $vectorPointsJson,
                    truncated: $truncated, filePath: $filePath, fileSize: $fileSize,
                    exportRequest: $exportRequestJson, name: $name, notes: $notes,
                    rerunFromExportId: $rerunFromExportId
                }) RETURN e.id AS id`,
                {
                    exportId,
                    createdAt: new Date().toISOString(),
                    selectionMode: request.selectionMode,
                    summary: summaryMap[request.selectionMode] || request.selectionMode,
                    boundaryPolicy, vectorPolicy,
                    nodes: counts.nodes, rels: counts.relationships, stubs: counts.stubNodes,
                    skipped: counts.skippedNoIdentity,
                    vectorPointsJson: JSON.stringify(counts.vectorPoints || {}),
                    truncated: !!truncated, filePath, fileSize,
                    exportRequestJson: JSON.stringify(exportRequest),
                    name: request.name || null,
                    notes: request.notes || null,
                    rerunFromExportId: request.rerunFromExportId || null,
                }
            );
        } catch (e) {
            console.warn(`[ExportService] Could not write ExportRecord: ${e.message}`);
        }
        return exportId;
    }

    /** Normalize an ExportRecord node's raw properties into an API-friendly shape. */
    static hydrateRecord(props) {
        if (!props) return null;
        let exportRequest = null;
        if (props.exportRequest) {
            try { exportRequest = JSON.parse(props.exportRequest); } catch { exportRequest = null; }
        }
        let vectorPoints = {};
        if (props.counts_vectorPoints) {
            try { vectorPoints = JSON.parse(props.counts_vectorPoints); } catch { vectorPoints = {}; }
        }
        return {
            exportId: props.exportId || props.id,
            createdAt: props.createdAt,
            status: props.status,
            selectionMode: props.selectionMode,
            selectionSummary: props.selectionSummary,
            boundaryPolicy: props.boundaryPolicy,
            vectorPolicy: props.vectorPolicy,
            counts: {
                nodes: props.counts_nodes ?? 0,
                relationships: props.counts_relationships ?? 0,
                stubNodes: props.counts_stubNodes ?? 0,
                vectorPoints,
            },
            filePath: props.filePath,
            fileSize: props.fileSize,
            truncated: props.truncated,
            name: props.name ?? null,
            notes: props.notes ?? null,
            rerunFromExportId: props.rerunFromExportId ?? null,
            exportRequest,
            canRerun: exportRequest != null && !!exportRequest.selectionMode,
        };
    }

    async getExportHistory(limit = 50) {
        try {
            const rows = await mg().runQuery(
                `MATCH (e:ExportRecord) RETURN e ORDER BY e.createdAt DESC LIMIT $limit`,
                { limit: require('neo4j-driver').int(limit) }
            );
            return rows.map((r) => ExportService.hydrateRecord(r.e.properties));
        } catch (e) {
            console.warn(`[ExportService] getExportHistory failed: ${e.message}`);
            return [];
        }
    }

    async getExportRecord(exportId) {
        const rows = await mg().runQuery('MATCH (e:ExportRecord {id: $id}) RETURN e LIMIT 1', { id: exportId });
        return rows.length ? ExportService.hydrateRecord(rows[0].e.properties) : null;
    }

    /**
     * Update an ExportRecord's editable metadata (name / notes). Only provided
     * fields change (COALESCE keeps the rest). @throws 'EXPORT_NOT_FOUND'
     */
    async updateExportRecord(exportId, updates = {}) {
        const rows = await mg().runQuery(
            `MATCH (e:ExportRecord {id: $id})
             SET e.name = COALESCE($name, e.name),
                 e.notes = COALESCE($notes, e.notes),
                 e.updatedAt = $updatedAt
             RETURN e`,
            {
                id: exportId,
                name: updates.name !== undefined ? updates.name : null,
                notes: updates.notes !== undefined ? updates.notes : null,
                updatedAt: new Date().toISOString(),
            }
        );
        if (!rows.length) throw new Error('EXPORT_NOT_FOUND');
        return ExportService.hydrateRecord(rows[0].e.properties);
    }

    /**
     * Delete an ExportRecord, optionally unlinking its package file.
     * @throws 'EXPORT_NOT_FOUND'
     * @returns {{ exportId, fileDeleted }}
     */
    async deleteExportRecord(exportId, deleteFile = false) {
        const rows = await mg().runQuery(
            'MATCH (e:ExportRecord {id: $id}) RETURN e.filePath AS filePath',
            { id: exportId }
        );
        if (!rows.length) throw new Error('EXPORT_NOT_FOUND');
        const filePath = rows[0].filePath;

        await mg().runQuery('MATCH (e:ExportRecord {id: $id}) DETACH DELETE e', { id: exportId });

        let fileDeleted = false;
        if (deleteFile && filePath) {
            try { fs.unlinkSync(filePath); fileDeleted = true; }
            catch (err) { console.warn(`[ExportService] Could not delete file ${filePath}: ${err.message}`); }
        }
        return { exportId, fileDeleted };
    }

    /**
     * Build a re-runnable request from a saved export, applying optional overrides.
     * Returns the merged ExportRequest (with rerunFromExportId provenance + a
     * default name). Caller enqueues it as a fresh job → new ExportRecord/file.
     * @throws {Error} 'EXPORT_NOT_FOUND' | 'CANNOT_RERUN'
     */
    async buildRerunRequest(originalExportId, overrides = {}) {
        const original = await this.getExportRecord(originalExportId);
        if (!original) throw new Error('EXPORT_NOT_FOUND');
        if (!original.canRerun || !original.exportRequest) throw new Error('CANNOT_RERUN');

        const base = original.exportRequest;
        const merged = {
            ...base,
            ...overrides,
            selectedCollections: {
                ...(base.selectedCollections || {}),
                ...(overrides.selectedCollections || {}),
            },
            rerunFromExportId: originalExportId,
        };

        if (!merged.name) {
            const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
            const label = original.name || String(originalExportId).slice(0, 8);
            merged.name = `Re-run of ${label} @ ${ts}`;
        }
        // Carry notes forward only if the override didn't set them and the original had them.
        if (merged.notes === undefined && original.notes) merged.notes = original.notes;

        // Validate the merged request before the caller enqueues it.
        const { errors } = this.validateRequest(merged);
        if (errors.length) throw new Error(`Merged request invalid: ${errors.join('; ')}`);

        return merged;
    }
}

let _instance = null;
function getExportService() {
    if (!_instance) _instance = new ExportService();
    return _instance;
}

module.exports = { ExportService, getExportService, EXPORTS_DIR };
