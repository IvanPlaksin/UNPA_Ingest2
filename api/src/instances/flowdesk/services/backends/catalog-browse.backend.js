'use strict';

/**
 * Catalog-browse backend — hierarchical drill-down over Altiora's service catalog
 * for the chat agent's "what services do you offer" intent. Distinct from the
 * SERVICE retrieval backend (semantic intent matching): this walks the TREE, root
 * → children, so the user can explore categories.
 *
 *   browse(null)  → GET /api/servicecatalog/root       (top-level categories)
 *   browse(guid)  → GET /api/servicecatalog/{guid}/children
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

function makeCatalogBrowseBackend(deps = {}) {
  const clientOf = () => deps.client || require('../altiora-client').getAltioraClient();

  /**
   * @param {string|null} parentId  a ServiceCatalog GUID, or null/undefined for root.
   * @returns {Promise<Array>} child nodes (categories and/or requestable leaves).
   */
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

module.exports = { makeCatalogBrowseBackend, mapNode };
