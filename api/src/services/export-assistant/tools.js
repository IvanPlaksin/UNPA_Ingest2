'use strict';

/**
 * Export Assistant tools — the actions an AI agent can take to explore the
 * knowledge base and build/run a Graph Transfer export. Anthropic tool_use shape
 * ({name, description, input_schema}); handlers wrap the existing graph-transfer
 * services (domain map, preview, queue) so the agent shares one code path with UI.
 */

const { getDomainService } = require('../graph-transfer/domain.service');
const { getExportService } = require('../graph-transfer/export.service');
const { enqueueExport } = require('../graph-transfer/export.queue');
const { getVectorStatsService } = require('../knowledge-dashboard/vector-stats.service');

let _mg = null;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }
const neo4j = require('neo4j-driver');

const TOOLS = [
    {
        name: 'list_domains',
        description: 'List all knowledge domains in the database with node counts, descriptions and linked vector collections. Call this first to understand what data is available before building an export.',
        input_schema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'get_domain_details',
        description: 'Get details for one domain: exact node count, per-label breakdown, namespace distribution and vector info. Use when the user asks about a specific area or you need to refine a selection.',
        input_schema: { type: 'object', properties: { domain_id: { type: 'string', description: 'Domain id, e.g. "dialogues", "extracted-knowledge", "un-documents", "gxe-graphs".' } }, required: ['domain_id'] },
    },
    {
        name: 'search_labels',
        description: 'Search graph labels by name substring (case-insensitive). Use when the user names a specific data type that may not map cleanly to a domain.',
        input_schema: { type: 'object', properties: { pattern: { type: 'string' }, limit: { type: 'integer', default: 20 } }, required: ['pattern'] },
    },
    {
        name: 'get_vector_collections',
        description: 'List Qdrant vector collections with point counts and which graph labels they link to. Use when the user asks about embeddings / vectors.',
        input_schema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'preview_selection',
        description: 'Preview what an export would contain WITHOUT writing anything. Returns node/relationship/stub/vector counts + warnings. ALWAYS preview before starting an export.',
        input_schema: {
            type: 'object',
            properties: {
                selection_type: { type: 'string', enum: ['DOMAINS', 'LABELS', 'NAMESPACE', 'CYPHER'] },
                domain_ids: { type: 'array', items: { type: 'string' } },
                labels: { type: 'array', items: { type: 'string' } },
                namespace: { type: 'string' },
                cypher: { type: 'string', description: 'Read-only Cypher returning a node bound as n (must contain a LIMIT).' },
                boundary_policy: { type: 'string', enum: ['STUB', 'EXCLUDE', 'CLOSURE'], default: 'STUB' },
                vector_policy: { type: 'string', enum: ['EMBED_POINTS', 'MANIFEST_ONLY', 'NONE'], default: 'EMBED_POINTS' },
                vector_filters: { type: 'object', description: 'Optional per-collection payload filters, e.g. {"documents_entities":{"conditions":[{"field":"namespace","operator":"eq","value":"FLOWDESK"}],"logic":"AND"}}' },
            },
            required: ['selection_type'],
        },
    },
    {
        name: 'start_export',
        description: 'Start an export job. Only call after previewing and confirming with the user. Returns a jobId for progress tracking.',
        input_schema: {
            type: 'object',
            properties: {
                selection_type: { type: 'string', enum: ['DOMAINS', 'LABELS', 'NAMESPACE', 'CYPHER'] },
                domain_ids: { type: 'array', items: { type: 'string' } },
                labels: { type: 'array', items: { type: 'string' } },
                namespace: { type: 'string' },
                cypher: { type: 'string' },
                boundary_policy: { type: 'string', default: 'STUB' },
                vector_policy: { type: 'string', default: 'EMBED_POINTS' },
                vector_filters: { type: 'object' },
                name: { type: 'string' },
                notes: { type: 'string' },
            },
            required: ['selection_type'],
        },
    },
];

/** Build an ExportRequest from tool params (shared by preview + start). */
function buildExportRequest(params) {
    const boundaryPolicy = params.boundary_policy || 'STUB';
    const vectorPolicy = params.vector_policy || 'EMBED_POINTS';
    const vectorFilters = params.vector_filters || {};
    switch (params.selection_type) {
        case 'DOMAINS':
            return getDomainService().buildExportRequest(params.domain_ids || [], { boundaryPolicy, vectorPolicy, vectorFilters });
        case 'LABELS':
            return { selectionMode: 'LABELS', labels: params.labels || [], boundaryPolicy, vectorPolicy, selectedCollections: {}, vectorFilters };
        case 'NAMESPACE':
            return { selectionMode: 'NAMESPACE', namespacePrefixes: params.namespace ? [params.namespace] : [], boundaryPolicy, vectorPolicy, selectedCollections: {}, vectorFilters };
        case 'CYPHER':
            return { selectionMode: 'CYPHER', cypher: params.cypher, boundaryPolicy, vectorPolicy, selectedCollections: {}, vectorFilters };
        default:
            throw new Error(`Unknown selection_type: ${params.selection_type}`);
    }
}

const sumVectorPoints = (vectors) => (vectors?.collections || []).reduce((s, c) => s + (c.pointsInSlice || 0), 0);

const HANDLERS = {
    async list_domains() {
        const r = await getDomainService().getDomains();
        return {
            domains: r.domains.map((d) => ({ id: d.id, name: d.name, icon: d.icon, description: d.description, nodeCount: d.nodeCount, percentage: d.percentage, vectorCollections: d.vectorCollections, useCatalogTree: d.useCatalogTree })),
            totalNodes: r.totalNodes, uncategorizedCount: r.uncategorizedCount,
        };
    },

    async get_domain_details({ domain_id }) {
        return getDomainService().getDomainDetails(domain_id);
    },

    async search_labels({ pattern, limit = 20 }) {
        const rows = await mg().runQuery(
            `MATCH (n) UNWIND labels(n) AS label WITH label, count(*) AS cnt
             WHERE toLower(label) CONTAINS toLower($pattern)
             RETURN label, cnt ORDER BY cnt DESC LIMIT $limit`,
            { pattern, limit: neo4j.int(limit) }
        );
        return { pattern, labels: rows.map((r) => ({ label: r.label, count: Number(r.cnt) })) };
    },

    async get_vector_collections() {
        const stats = await getVectorStatsService().getVectorStats();
        return {
            totalPoints: stats.summary?.totalPoints || 0,
            collections: (stats.collections || []).map((c) => ({ name: c.name, pointsCount: c.pointsCount, linked: !!c.linkage?.linked, linkedLabels: c.linkage?.linkedLabels || [], dimensions: c.vectorConfig?.size, namedVectors: c.vectorConfig?.namedVectors || null })),
        };
    },

    async preview_selection(params) {
        const request = buildExportRequest(params);
        const preview = await getExportService().preview(request);
        return {
            valid: preview.valid !== false && !(preview.errors && preview.errors.length),
            nodes: preview.counts?.nodes || 0,
            relationships: preview.counts?.relationships || 0,
            stubNodes: preview.counts?.stubNodes || 0,
            boundaryEdges: preview.counts?.boundaryEdges || 0,
            vectorPoints: sumVectorPoints(preview.vectors),
            vectorCollections: (preview.vectors?.collections || []).filter((c) => c.pointsInSlice > 0).map((c) => c.name),
            labels: Object.keys(preview.counts?.nodesByLabel || {}),
            containsExecutableGraphs: !!preview.containsExecutableGraphs,
            warnings: preview.warnings || [],
            errors: preview.errors || [],
        };
    },

    async start_export(params) {
        const request = buildExportRequest(params);
        request.name = params.name || `AI export ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
        if (params.notes) request.notes = params.notes;
        const { errors } = getExportService().validateRequest(request);
        if (errors.length) return { success: false, errors };
        const { jobId } = await enqueueExport(request);
        return { success: true, jobId, message: `Export job ${jobId} started.` };
    },
};

async function executeTool(name, input = {}) {
    const handler = HANDLERS[name];
    if (!handler) throw new Error(`Unknown tool: ${name}`);
    return handler(input);
}

module.exports = { TOOLS, HANDLERS, executeTool, buildExportRequest };
