'use strict';

/**
 * Catalog Tree Service — paginated navigation of the GXE graph catalog for the
 * Graph Transfer UI. Actual AS-IS schema (verified live, TASK-GT-007):
 *
 *   (:CatalogRoot)-[:CONTAINS]->(:CatalogEntry {entryId,name,description})
 *     -[:DEFINES]->(:GraphDefinition {graphId,name,description,namespace})
 *       -[:HAS_VERSION]->(:GraphVersion {versionId,version,status,createdAt})
 *   (CatalogEntry may also -[:DECOMPOSES]-> sub-CatalogEntry; GraphVersion -[:SUPERSEDES]-> prior)
 *
 * NOTE on graph↔vector dependency: catalog graphs do NOT link to Qdrant directly
 * (a graph's nodes are JSON on GraphDefinition; no vector payload references a
 * graphId/versionId/entryId). The meaningful signal is whether a graph's EXPORT
 * SLICE (its related data nodes) includes vector-linked labels. vectorInfo is
 * computed that way (Cypher-only, cheap). Exact point counts are deferred to GT-008.
 */

const neo4j = require('neo4j-driver');

let _mg = null;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

// Data labels that carry Qdrant vectors → their collection (from COLLECTION_LINKAGE).
const VECTOR_LINKED_LABELS = {
    EntityMention: 'documents_entities',
    ESEntity: 'knowledge_entities',
    DialogueSegment: 'dialogue_embeddings',
    KnowledgeQuantum: 'embeddings_unified',
    DraftEntity: 'workspace_*',
};

const int = (n) => neo4j.int(Math.max(0, Math.floor(Number(n) || 0)));

class CatalogTreeService {
    /**
     * One paginated level of the catalog tree.
     * @param {object} params - { parentId, parentType, page, pageSize, search, includeVectorInfo }
     */
    async getTreeLevel(params = {}) {
        const parentId = params.parentId || null;
        const parentType = params.parentType || 'root';
        const page = Math.max(1, parseInt(params.page, 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(params.pageSize, 10) || 20));
        const search = params.search || null;
        const includeVectorInfo = params.includeVectorInfo !== false;
        const skip = (page - 1) * pageSize;

        let items = [];
        let totalItems = 0;
        let breadcrumb = [];

        if (!parentId || parentType === 'root') {
            ({ items, totalItems } = await this._getCatalogEntries(skip, pageSize, search));
        } else if (parentType === 'entry') {
            ({ items, totalItems } = await this._getEntryChildren(parentId, skip, pageSize, search));
            breadcrumb = await this._buildBreadcrumb(parentId, 'entry');
        } else if (parentType === 'definition') {
            ({ items, totalItems } = await this._getGraphVersions(parentId, skip, pageSize));
            breadcrumb = await this._buildBreadcrumb(parentId, 'definition');
        }

        if (includeVectorInfo) await this._enrichWithVectorInfo(items);

        return {
            items,
            pagination: {
                page, pageSize, totalItems,
                totalPages: Math.ceil(totalItems / pageSize),
                hasMore: skip + items.length < totalItems,
            },
            breadcrumb,
        };
    }

    async _getCatalogEntries(skip, limit, search) {
        const where = search ? 'WHERE toLower(e.name) CONTAINS toLower($search) OR toLower(coalesce(e.description,\'\')) CONTAINS toLower($search)' : '';
        const totalRows = await mg().runQuery(
            `MATCH (r:CatalogRoot)-[:CONTAINS]->(e:CatalogEntry) ${where} RETURN count(e) AS total`, { search }
        );
        const totalItems = Number(totalRows[0]?.total || 0);
        const rows = await mg().runQuery(
            `MATCH (r:CatalogRoot)-[:CONTAINS]->(e:CatalogEntry) ${where}
             OPTIONAL MATCH (e)-[:DEFINES]->(g:GraphDefinition)
             OPTIONAL MATCH (e)-[:DECOMPOSES]->(sub:CatalogEntry)
             WITH e, count(DISTINCT g) AS defs, count(DISTINCT sub) AS subs
             RETURN e.entryId AS id, e.name AS name, e.description AS description, (defs + subs) AS childrenCount
             ORDER BY e.name SKIP $skip LIMIT $limit`,
            { search, skip: int(skip), limit: int(limit) }
        );
        const items = rows.map((r) => ({
            id: r.id, type: 'entry', name: r.name, description: r.description,
            childrenCount: Number(r.childrenCount || 0), hasChildren: Number(r.childrenCount || 0) > 0,
        }));
        return { items, totalItems };
    }

    /** Entry children = its GraphDefinitions (DEFINES) + nested CatalogEntries (DECOMPOSES). */
    async _getEntryChildren(entryId, skip, limit, search) {
        const where = search ? 'AND (toLower(child.name) CONTAINS toLower($search))' : '';
        const totalRows = await mg().runQuery(
            `MATCH (e:CatalogEntry {entryId: $entryId})-[:DEFINES|DECOMPOSES]->(child)
             WHERE (child:GraphDefinition OR child:CatalogEntry) ${where}
             RETURN count(child) AS total`, { entryId, search }
        );
        const totalItems = Number(totalRows[0]?.total || 0);
        const rows = await mg().runQuery(
            `MATCH (e:CatalogEntry {entryId: $entryId})-[:DEFINES|DECOMPOSES]->(child)
             WHERE (child:GraphDefinition OR child:CatalogEntry) ${where}
             OPTIONAL MATCH (child)-[:HAS_VERSION]->(v:GraphVersion)
             OPTIONAL MATCH (child)-[:DEFINES|DECOMPOSES]->(sub)
             WITH child, count(DISTINCT v) AS vers, count(DISTINCT sub) AS subs
             RETURN child.graphId AS graphId, child.entryId AS entryId, child.name AS name,
                    child.description AS description, child.namespace AS namespace,
                    labels(child) AS labels, (vers + subs) AS childrenCount
             ORDER BY name SKIP $skip LIMIT $limit`,
            { entryId, search, skip: int(skip), limit: int(limit) }
        );
        const items = rows.map((r) => {
            const isDef = (r.labels || []).includes('GraphDefinition');
            return {
                id: isDef ? r.graphId : r.entryId,
                type: isDef ? 'definition' : 'entry',
                name: r.name,
                description: r.description,
                namespace: isDef ? r.namespace : undefined,
                childrenCount: Number(r.childrenCount || 0),
                hasChildren: Number(r.childrenCount || 0) > 0,
            };
        });
        return { items, totalItems };
    }

    async _getGraphVersions(graphId, skip, limit) {
        const totalRows = await mg().runQuery(
            `MATCH (g:GraphDefinition {graphId: $graphId})-[:HAS_VERSION]->(v:GraphVersion) RETURN count(v) AS total`, { graphId }
        );
        const totalItems = Number(totalRows[0]?.total || 0);
        const rows = await mg().runQuery(
            `MATCH (g:GraphDefinition {graphId: $graphId})-[:HAS_VERSION]->(v:GraphVersion)
             RETURN v.versionId AS id, v.version AS version, v.versionNumber AS versionNumber,
                    v.status AS status, v.createdAt AS createdAt
             ORDER BY v.createdAt DESC SKIP $skip LIMIT $limit`,
            { graphId, skip: int(skip), limit: int(limit) }
        );
        const items = rows.map((r) => ({
            id: r.id, type: 'version',
            name: `v${r.version ?? r.versionNumber ?? ''}`.trim(),
            version: r.version ?? r.versionNumber, status: r.status, createdAt: r.createdAt,
            childrenCount: 0, hasChildren: false,
        }));
        return { items, totalItems };
    }

    async _buildBreadcrumb(id, type) {
        if (type === 'entry') {
            const r = await mg().runQuery('MATCH (e:CatalogEntry {entryId: $id}) RETURN e.entryId AS id, e.name AS name', { id });
            return r[0] ? [{ id: r[0].id, type: 'entry', name: r[0].name }] : [];
        }
        if (type === 'definition') {
            const r = await mg().runQuery(
                `MATCH (e:CatalogEntry)-[:DEFINES]->(g:GraphDefinition {graphId: $id})
                 RETURN e.entryId AS eid, e.name AS ename, g.graphId AS gid, g.name AS gname LIMIT 1`, { id }
            );
            if (!r[0]) return [];
            return [
                { id: r[0].eid, type: 'entry', name: r[0].ename },
                { id: r[0].gid, type: 'definition', name: r[0].gname },
            ];
        }
        return [];
    }

    async _enrichWithVectorInfo(items) {
        for (const item of items) {
            item.vectorInfo = await this._sliceVectorInfo(item);
        }
    }

    /**
     * vectorInfo = does this item's export slice include vector-linked data labels?
     * Cypher-only (no Qdrant): expand related nodes (bounded) and map their labels
     * to collections. `linkedNodeCount` is a proxy for point volume (exact counts → GT-008).
     */
    async _sliceVectorInfo(item) {
        const empty = { hasVectors: false, collections: [], linkedNodeCount: 0 };
        let startMatch;
        if (item.type === 'definition') startMatch = 'MATCH (start:GraphDefinition {graphId: $id})';
        else if (item.type === 'entry') startMatch = 'MATCH (start:CatalogEntry {entryId: $id})';
        else if (item.type === 'version') startMatch = 'MATCH (start:GraphVersion {versionId: $id})';
        else return empty;

        try {
            const rows = await mg().runQuery(
                `${startMatch}
                 OPTIONAL MATCH p = (start)-[*1..3]-(n)
                 WITH [x IN collect(DISTINCT n) WHERE x IS NOT NULL] AS ns
                 UNWIND (CASE WHEN size(ns) = 0 THEN [null] ELSE ns END) AS n
                 WITH n WHERE n IS NOT NULL
                 UNWIND labels(n) AS lbl
                 WITH lbl, count(*) AS cnt WHERE lbl IN $linkedLabels
                 RETURN lbl AS label, cnt`,
                { id: item.id, linkedLabels: Object.keys(VECTOR_LINKED_LABELS) }
            );
            if (!rows.length) return empty;
            const collections = new Set();
            let linkedNodeCount = 0;
            for (const r of rows) {
                collections.add(VECTOR_LINKED_LABELS[r.label]);
                linkedNodeCount += Number(r.cnt || 0);
            }
            return { hasVectors: collections.size > 0, collections: [...collections], linkedNodeCount };
        } catch {
            return empty;
        }
    }
}

let _instance = null;
function getCatalogTreeService() { if (!_instance) _instance = new CatalogTreeService(); return _instance; }

module.exports = { CatalogTreeService, getCatalogTreeService };
