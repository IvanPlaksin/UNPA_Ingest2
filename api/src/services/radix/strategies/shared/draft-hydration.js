/**
 * Shared draft hydration and content building.
 *
 * Both strategies need the same thing: turn a draft's graph properties into the
 * text the model will read. Keeping it here means the vector path and the graph
 * path describe the same draft the same way — otherwise the same node would
 * read differently depending on which strategy happened to find it.
 *
 * @module services/radix/strategies/shared/draft-hydration
 */

'use strict';

/**
 * Fields lifted out of a draft's JSON `content` into the prompt text.
 * Same list draft.service feeds into the embedding, so the model reads the
 * material the vector actually matched on.
 */
const CONTENT_FIELDS = Object.freeze([
  'condition', 'action', 'formula', 'definition', 'context', 'rationale'
]);

/**
 * Memgraph label → draft type key. Mirrors DRAFT_TYPE_LABELS in draft.service,
 * inverted. Note DraftAPIContract's capitalisation — it is not DraftApiContract.
 */
const LABEL_TO_DRAFT_TYPE = Object.freeze({
  DraftEntity: 'entity',
  DraftRelationship: 'relationship',
  DraftBusinessRule: 'business_rule',
  DraftSchema: 'schema',
  DraftWorkflow: 'workflow',
  DraftCalculation: 'calculation',
  DraftConcept: 'concept',
  DraftPolicy: 'policy',
  DraftDecision: 'decision',
  DraftRequirement: 'requirement',
  DraftAnomaly: 'anomaly',
  DraftAPIContract: 'api_contract'
});

/**
 * Resolves a draft type key from a node's labels.
 *
 * @param {string[]} labels
 * @returns {string|null}
 */
function draftTypeFromLabels(labels) {
  if (!Array.isArray(labels)) return null;
  for (const label of labels) {
    if (LABEL_TO_DRAFT_TYPE[label]) return LABEL_TO_DRAFT_TYPE[label];
  }
  return null;
}

/**
 * Builds the prompt-facing text for a draft from its graph properties.
 *
 * @param {Object} props - Draft node properties from Memgraph
 * @param {string} [fallbackName]
 * @returns {string}
 */
function buildContent(props, fallbackName = '') {
  const safeProps = props || {};
  const parts = [safeProps.name || fallbackName].filter(Boolean);

  if (safeProps.description) parts.push(safeProps.description);

  let content = safeProps.content;
  if (typeof content === 'string') {
    try {
      content = JSON.parse(content);
    } catch {
      content = null;
    }
  }

  if (content && typeof content === 'object' && !Array.isArray(content)) {
    for (const key of CONTENT_FIELDS) {
      const value = content[key];
      if (value === undefined || value === null || value === '') continue;
      parts.push(`${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
    }
  }

  return parts.join('. ');
}

/**
 * Loads full draft records for a set of ids in ONE query.
 *
 * Scoped through the workspace's own CONTAINS_DRAFT edge rather than by id
 * alone: a draft id that does not belong to this workspace cannot be hydrated,
 * so workspace isolation holds at the graph layer too, not just in Qdrant's
 * collection split.
 *
 * Never throws — a hydration failure degrades the candidate, it does not fail
 * the retrieval.
 *
 * @param {Object} memgraph - Service exposing runQuery(cypher, params)
 * @param {string} workspaceId
 * @param {string[]} draftIds
 * @param {Function} [onError] - Called with the error for logging
 * @returns {Promise<Map<string, {props: Object, labels: string[], sourceRefId: string|null,
 *   sourceRefType: string|null, sourceRefName: string|null}>>}
 */
async function hydrateDrafts(memgraph, workspaceId, draftIds, onError) {
  const result = new Map();

  if (!memgraph || typeof memgraph.runQuery !== 'function'
      || !Array.isArray(draftIds) || draftIds.length === 0) {
    return result;
  }

  try {
    const rows = await memgraph.runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(d)
       WHERE d.id IN $draftIds
       OPTIONAL MATCH (d)-[:EXTRACTED_FROM]->(s:SourceReference)
       RETURN d.id AS id, labels(d) AS labels, properties(d) AS props,
              s.id AS sourceRefId, s.sourceType AS sourceRefType,
              s.filename AS sourceRefName`,
      { wsId: workspaceId, draftIds }
    );

    for (const row of rows || []) {
      if (!row || !row.id) continue;
      result.set(String(row.id), {
        props: row.props || {},
        labels: row.labels || [],
        sourceRefId: row.sourceRefId || null,
        sourceRefType: row.sourceRefType || null,
        sourceRefName: row.sourceRefName || null
      });
    }
  } catch (error) {
    if (typeof onError === 'function') onError(error);
  }

  return result;
}

/**
 * Builds the provenance block for a draft.
 *
 * Points at the SourceReference when the graph knows one, and at the draft
 * otherwise — the draft is always traceable, the originating document is not.
 *
 * @param {string} draftId
 * @param {string|null} draftType
 * @param {{sourceRefId: string|null, sourceRefType: string|null}|null} record
 * @returns {import('../../contracts/context-bundle').ElementProvenance}
 */
function buildProvenance(draftId, draftType, record) {
  if (record && record.sourceRefId) {
    return {
      sourceId: String(record.sourceRefId),
      sourceType: record.sourceRefType || 'SOURCE_REFERENCE',
      draftId: String(draftId)
    };
  }
  return {
    sourceId: String(draftId),
    sourceType: draftType ? `DRAFT_${String(draftType).toUpperCase()}` : 'DRAFT'
  };
}

module.exports = {
  CONTENT_FIELDS,
  LABEL_TO_DRAFT_TYPE,
  draftTypeFromLabels,
  buildContent,
  hydrateDrafts,
  buildProvenance
};
