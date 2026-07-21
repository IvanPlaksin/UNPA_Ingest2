'use strict';

/**
 * Catalog-browse backend — hierarchical drill-down over the service catalog for the
 * chat agent's "what services do you offer" intent. Distinct from the SERVICE
 * retrieval backend (semantic intent matching): this walks the TREE, root →
 * children, so the user can explore categories.
 *
 * Two providers (FLOWDESK_CATALOG_PROVIDER):
 *   - 'altiora' (default): live Altiora REST catalog
 *       browse(null)  → GET /api/servicecatalog/root
 *       browse(guid)  → GET /api/servicecatalog/{guid}/children
 *   - 'graph': the knowledge base synced from Altiora (Memgraph ServiceCatalogItem
 *       tree via :PARENT_OF). Lets the chat run without live Altiora connectivity.
 *
 * Each node carries hasChildren/childCount (offer a drill-down) and isRequestable
 * (a leaf service the user can actually request).
 *
 * @module instances/flowdesk/services/backends/catalog-browse.backend
 */

const pick = (o, keys) => { for (const k of keys) if (o && o[k] != null) return o[k]; return undefined; };

function mapNode(n) {
  return {
    serviceId: String(pick(n, ['serviceId', 'ServiceId']) || ''),
    serviceCode: pick(n, ['serviceCode', 'ServiceCode']),
    displayName: pick(n, ['displayName', 'DisplayName']),
    briefDescription: pick(n, ['briefDescription', 'BriefDescription']) || undefined,
    hasChildren: !!pick(n, ['hasChildren', 'HasChildren']),
    childCount: pick(n, ['childCount', 'ChildCount']) ?? 0,
    isRequestable: !!pick(n, ['isRequestable', 'IsRequestable']),
  };
}

// ── Live Altiora REST provider ──────────────────────────────────────────────
function makeAltioraBrowse(deps = {}) {
  const clientOf = () => deps.client || require('../altiora-client').getAltioraClient();
  async function browse(parentId) {
    const path = parentId
      ? `/api/servicecatalog/${encodeURIComponent(parentId)}/children`
      : '/api/servicecatalog/root';
    const res = await clientOf().get(path);
    const arr = Array.isArray(res) ? res : (pick(res, ['items', 'Items']) || []);
    return arr.map(mapNode).filter((n) => n.serviceId);
  }
  return { browse };
}

// ── Knowledge-base (Memgraph) provider — synced from Altiora ─────────────────
// Reads the ServiceCatalogItem tree (:PARENT_OF) from the graph, so catalog
// browsing works from the synced KB with no live Altiora call.
function makeGraphBrowse(deps = {}) {
  const read = deps.read || require('../../schema-graph/driver').read;
  async function browse(parentId) {
    const cypher = parentId
      ? `MATCH (:ServiceCatalogItem {id: $pid})-[:PARENT_OF]->(s:ServiceCatalogItem)
         OPTIONAL MATCH (s)-[:PARENT_OF]->(c:ServiceCatalogItem)
         RETURN s AS s, count(c) AS childCount
         ORDER BY coalesce(s.level, 0), s.name`
      : `MATCH (s:ServiceCatalogItem) WHERE NOT (:ServiceCatalogItem)-[:PARENT_OF]->(s)
         OPTIONAL MATCH (s)-[:PARENT_OF]->(c:ServiceCatalogItem)
         RETURN s AS s, count(c) AS childCount
         ORDER BY coalesce(s.level, 0), s.name`;
    const rows = await read(cypher, { pid: parentId });
    return rows
      .map((r) => {
        const raw = r.get('s');
        const s = (raw && raw.properties) ? raw.properties : raw;
        const cc = Number(r.get('childCount')) || 0;
        return mapNode({
          serviceId: s.id,
          serviceCode: s.code,
          displayName: s.name,
          briefDescription: s.description,
          hasChildren: cc > 0,
          childCount: cc,
          isRequestable: s.is_requestable,
        });
      })
      .filter((n) => n.serviceId);
  }
  return { browse };
}

function makeCatalogBrowseBackend(deps = {}) {
  const provider = deps.provider || process.env.FLOWDESK_CATALOG_PROVIDER || 'altiora';
  return provider === 'graph' ? makeGraphBrowse(deps) : makeAltioraBrowse(deps);
}

module.exports = { makeCatalogBrowseBackend, makeAltioraBrowse, makeGraphBrowse, mapNode };
