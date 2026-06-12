'use strict';
const { v4: uuidv4 } = require('uuid');

let _mg;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

const now = () => new Date().toISOString();

class EntityStoreService {

  // ── Import ──────────────────────────────────────────────────────────────

  async importFromDocument(docId, { entityIds = null, namespace = 'DEFAULT' } = {}) {
    const params = { docId };
    const idFilter = entityIds && entityIds.length > 0
      ? 'AND em.id IN $entityIds'
      : '';
    if (entityIds && entityIds.length > 0) params.entityIds = entityIds;

    // Fetch document metadata for provenance
    const docRows = await mg().runQuery(
      `MATCH (d:Document {id: $docId})
       RETURN d.documentTitle AS title, d.unSymbol AS symbol, d.originalname AS filename`,
      { docId }
    );
    const docInfo = docRows[0] || {};
    const provDocTitle  = docInfo.title  || docInfo.filename || docId;
    const provDocSymbol = docInfo.symbol || null;

    const mentions = await mg().runQuery(
      `MATCH (d:Document {id: $docId})-[:MENTIONS]->(em:EntityMention)
       ${idFilter ? `WHERE em.id IN $entityIds` : ''}
       RETURN em.id AS id, em.name AS name, em.type AS type,
              em.category AS category, em.epistemicLayer AS epistemicLayer,
              em.match AS match, em.relevance AS relevance,
              em.esEntityId AS esEntityId`,
      params
    );

    const ts = now();
    const result = { created: 0, linked: 0, skipped: 0 };

    for (const m of mentions) {
      if (m.esEntityId) { result.skipped++; continue; }

      const existing = await mg().runQuery(
        `MATCH (e:ESEntity {name: $name, type: $type, namespace: $namespace})
         RETURN e.id AS id LIMIT 1`,
        { name: m.name, type: m.type || 'CONCEPT', namespace }
      );

      let esId;
      if (existing.length > 0) {
        esId = existing[0].id;
        result.linked++;
      } else {
        esId = uuidv4();
        await mg().runQuery(
          `CREATE (e:ESEntity {
             id: $id, name: $name, type: $type, category: $category,
             namespace: $namespace, description: $description,
             epistemicLayer: $epistemicLayer, createdAt: $ts, updatedAt: $ts,
             provenanceType: 'DOCUMENT_IMPORT',
             provenanceDocId: $provDocId,
             provenanceDocTitle: $provDocTitle,
             provenanceDocSymbol: $provDocSymbol,
             provenanceEntityMentionId: $provEmId,
             provenanceImportedAt: $ts
           })`,
          {
            id: esId,
            name:           m.name,
            type:           m.type || 'CONCEPT',
            category:       m.category || '',
            namespace,
            description:    m.match || '',
            epistemicLayer: m.epistemicLayer || '',
            ts,
            provDocId:    docId,
            provDocTitle,
            provDocSymbol,
            provEmId:     m.id,
          }
        );
        result.created++;
      }

      await mg().runQuery(
        `MATCH (em:EntityMention {id: $emId}), (es:ESEntity {id: $esId})
         MERGE (em)-[:LINKED_TO_ES]->(es)
         SET em.esEntityId = $esId`,
        { emId: m.id, esId }
      );
    }

    // Import entity-entity relationships — transfer RELATED_TO edges from EntityMention
    // pairs into ES_RELATED_TO edges between ESEntity nodes, preserving full metadata.
    try {
      const linked = await mg().runQuery(
        `MATCH (d:Document {id: $docId})-[:MENTIONS]->(em:EntityMention)
         WHERE em.esEntityId IS NOT NULL
         RETURN em.id AS emId, em.esEntityId AS esId`,
        { docId }
      );
      if (linked.length >= 2) {
        const emIds = linked.map(r => r.emId);
        const esMap = Object.fromEntries(linked.map(r => [r.emId, r.esId]));
        const rels  = await mg().runQuery(
          `MATCH (a:EntityMention)-[r:RELATED_TO]->(b:EntityMention)
           WHERE a.id IN $ids AND b.id IN $ids AND a.id <> b.id
           RETURN a.id AS aId, b.id AS bId,
                  r.type AS relType, r.context AS context,
                  r.confidence AS confidence, r.documentId AS documentId
           LIMIT 200`,
          { ids: emIds }
        );
        const ts = now();
        let relCount = 0;
        for (const rel of rels) {
          const srcId = esMap[rel.aId], tgtId = esMap[rel.bId];
          if (srcId && tgtId && srcId !== tgtId) {
            await mg().runQuery(
              `MATCH (s:ESEntity {id: $s}), (t:ESEntity {id: $t})
               MERGE (s)-[r:ES_RELATED_TO {relType: $rt}]->(t)
               SET r.context     = $ctx,
                   r.confidence  = $conf,
                   r.documentId  = $docId,
                   r.extractedAt = $ts`,
              {
                s: srcId, t: tgtId, rt: rel.relType || 'RELATED_TO',
                ctx:  rel.context    || null,
                conf: typeof rel.confidence === 'number' ? rel.confidence : (rel.confidence?.low ?? 0.8),
                docId, ts,
              }
            ).catch(() => {});
            relCount++;
          }
        }
        console.log(`[EntityStore] Imported ${relCount} relationships for doc=${docId}`);
      }
    } catch (err) {
      console.warn('[EntityStore] Relationship import error:', err.message);
    }

    return { ...result, total: mentions.length };
  }

  // ── CRUD ────────────────────────────────────────────────────────────────

  async createEntity({ name, type, namespace = 'DEFAULT', description = '', epistemicLayer = '', category = '' }) {
    const id = uuidv4();
    const ts = now();
    await mg().runQuery(
      `CREATE (e:ESEntity {
         id: $id, name: $name, type: $type, category: $category,
         namespace: $namespace, description: $description,
         epistemicLayer: $epistemicLayer, createdAt: $ts, updatedAt: $ts
       })`,
      { id, name, type, category, namespace, description, epistemicLayer, ts }
    );
    return this.getEntity(id);
  }

  async listEntities({ namespace = null, type = null, search = null } = {}) {
    const conds = [];
    const p = {};
    if (namespace) { conds.push('e.namespace = $namespace'); p.namespace = namespace; }
    if (type)      { conds.push('e.type = $type');           p.type = type; }
    if (search)    { conds.push('toLower(e.name) CONTAINS toLower($search)'); p.search = search; }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const rows = await mg().runQuery(
      `MATCH (e:ESEntity) ${where}
       OPTIONAL MATCH (em:EntityMention)-[:LINKED_TO_ES]->(e)
       WITH e, count(em) AS mentionCount
       RETURN e.id AS id, e.name AS name, e.type AS type,
              e.namespace AS namespace, e.category AS category,
              e.description AS description, e.epistemicLayer AS epistemicLayer,
              e.createdAt AS createdAt, e.updatedAt AS updatedAt, mentionCount,
              e.provenanceType AS provenanceType,
              e.provenanceDocId AS provenanceDocId,
              e.provenanceDocTitle AS provenanceDocTitle,
              e.provenanceDocSymbol AS provenanceDocSymbol,
              e.provenanceImportedAt AS provenanceImportedAt
       ORDER BY e.namespace, e.type, e.name`,
      p
    );
    return rows.map(r => ({ ...r, mentionCount: typeof r.mentionCount === 'object' ? (r.mentionCount?.low ?? 0) : (r.mentionCount || 0) }));
  }

  async getEntity(id) {
    const rows = await mg().runQuery(
      `MATCH (e:ESEntity {id: $id})
       OPTIONAL MATCH (em:EntityMention)-[:LINKED_TO_ES]->(e)
       OPTIONAL MATCH (d:Document)-[:MENTIONS]->(em)
       WITH e, collect(DISTINCT {mentionId: em.id, docId: d.id, docTitle: d.documentTitle}) AS sources
       RETURN e.id AS id, e.name AS name, e.type AS type, e.namespace AS namespace,
              e.category AS category, e.description AS description,
              e.epistemicLayer AS epistemicLayer, e.createdAt AS createdAt,
              e.updatedAt AS updatedAt, sources,
              e.provenanceType AS provenanceType,
              e.provenanceDocId AS provenanceDocId,
              e.provenanceDocTitle AS provenanceDocTitle,
              e.provenanceDocSymbol AS provenanceDocSymbol,
              e.provenanceEntityMentionId AS provenanceEntityMentionId,
              e.provenanceImportedAt AS provenanceImportedAt`,
      { id }
    );
    if (!rows.length) return null;
    return rows[0];
  }

  async updateEntity(id, { name, type, namespace, description, epistemicLayer, category } = {}) {
    const sets = ['e.updatedAt = $ts'];
    const p = { id, ts: now() };
    if (name          !== undefined) { sets.push('e.name = $name');                   p.name = name; }
    if (type          !== undefined) { sets.push('e.type = $type');                   p.type = type; }
    if (namespace     !== undefined) { sets.push('e.namespace = $namespace');          p.namespace = namespace; }
    if (description   !== undefined) { sets.push('e.description = $description');     p.description = description; }
    if (epistemicLayer!== undefined) { sets.push('e.epistemicLayer = $epistemicLayer'); p.epistemicLayer = epistemicLayer; }
    if (category      !== undefined) { sets.push('e.category = $category');            p.category = category; }
    await mg().runQuery(`MATCH (e:ESEntity {id: $id}) SET ${sets.join(', ')}`, p);
    return this.getEntity(id);
  }

  async deleteEntity(id) {
    await mg().runQuery(
      `MATCH (em:EntityMention)-[r:LINKED_TO_ES]->(e:ESEntity {id: $id})
       REMOVE em.esEntityId DELETE r`,
      { id }
    );
    await mg().runQuery(`MATCH (e:ESEntity {id: $id}) DETACH DELETE e`, { id });
    return { id, deleted: true };
  }

  async deleteNamespace(namespace) {
    await mg().runQuery(
      `MATCH (em:EntityMention)-[r:LINKED_TO_ES]->(e:ESEntity {namespace: $namespace})
       REMOVE em.esEntityId DELETE r`,
      { namespace }
    );
    await mg().runQuery(`MATCH (e:ESEntity {namespace: $namespace}) DETACH DELETE e`, { namespace });
    return { namespace, deleted: true };
  }

  // ── Graph / Namespaces / Stats ──────────────────────────────────────────

  async getEntityGraph({ namespace = null } = {}) {
    const p = {};
    const nWhere = namespace ? 'WHERE e.namespace = $namespace' : '';
    if (namespace) p.namespace = namespace;

    const [entities, rels] = await Promise.all([
      mg().runQuery(
        `MATCH (e:ESEntity) ${nWhere}
         OPTIONAL MATCH (em:EntityMention)-[:LINKED_TO_ES]->(e)
         WITH e, count(em) AS mc
         RETURN e.id AS id, e.name AS name, e.type AS type,
                e.namespace AS namespace, e.description AS description,
                e.epistemicLayer AS epistemicLayer, mc AS mentionCount`,
        p
      ),
      mg().runQuery(
        namespace
          ? `MATCH (a:ESEntity {namespace: $namespace})-[r:ES_RELATED_TO]->(b:ESEntity {namespace: $namespace})
             RETURN a.id AS sourceId, b.id AS targetId, r.relType AS relType,
                    r.context AS context, r.confidence AS confidence, r.documentId AS documentId`
          : `MATCH (a:ESEntity)-[r:ES_RELATED_TO]->(b:ESEntity)
             RETURN a.id AS sourceId, b.id AS targetId, r.relType AS relType,
                    r.context AS context, r.confidence AS confidence, r.documentId AS documentId`,
        p
      ),
    ]);

    return {
      entities: entities.map(r => ({
        id:             r.id,
        name:           r.name,
        type:           r.type,
        namespace:      r.namespace,
        description:    r.description || null,
        epistemicLayer: r.epistemicLayer || null,
        mentionCount:   typeof r.mentionCount === 'object' ? (r.mentionCount?.low ?? 0) : (r.mentionCount || 0),
      })),
      relationships: rels.map(r => ({
        sourceId:   r.sourceId,
        targetId:   r.targetId,
        relType:    r.relType    || 'RELATED_TO',
        context:    r.context    || null,
        confidence: typeof r.confidence === 'number' ? r.confidence : (r.confidence?.low ?? null),
        documentId: r.documentId || null,
      })),
    };
  }

  async listNamespaces() {
    const rows = await mg().runQuery(
      `MATCH (e:ESEntity)
       RETURN DISTINCT e.namespace AS namespace, count(e) AS cnt
       ORDER BY namespace`
    );
    return rows.map(r => ({
      namespace: r.namespace,
      count: typeof r.cnt === 'object' ? (r.cnt?.low ?? 0) : (r.cnt || 0),
    }));
  }

  // ── Layout persistence ─────────────────────────────────────────────────

  async saveLayout(namespace, { algorithm, positions, config, label = '' }) {
    const id   = require('uuid').v4();
    const ts   = now();
    await mg().runQuery(
      `MERGE (ls:ESLayoutSnapshot {namespace: $namespace})
       SET ls.id = $id, ls.algorithm = $algorithm,
           ls.positions = $positions, ls.config = $config,
           ls.savedAt = $savedAt, ls.label = $label
       RETURN ls.id`,
      {
        namespace,
        id,
        algorithm: algorithm || 'dagre',
        positions: JSON.stringify(positions || {}),
        config:    JSON.stringify(config    || {}),
        savedAt:   ts,
        label:     label || '',
      }
    );
    return { namespace, id, savedAt: ts };
  }

  async getLayout(namespace) {
    const rows = await mg().runQuery(
      `MATCH (ls:ESLayoutSnapshot {namespace: $namespace})
       RETURN ls.algorithm AS algorithm, ls.positions AS positions,
              ls.config AS config, ls.savedAt AS savedAt, ls.label AS label
       LIMIT 1`,
      { namespace }
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      algorithm: r.algorithm,
      positions: typeof r.positions === 'string' ? JSON.parse(r.positions) : (r.positions || {}),
      config:    typeof r.config    === 'string' ? JSON.parse(r.config)    : (r.config    || {}),
      savedAt:   r.savedAt,
      label:     r.label || '',
    };
  }

  async getStats() {
    const rows = await mg().runQuery(
      `MATCH (e:ESEntity)
       RETURN count(e) AS total,
              count(DISTINCT e.namespace) AS namespaceCount,
              count(DISTINCT e.type) AS typeCount`
    );
    const r = rows[0] || {};
    const linked = await mg().runQuery(
      `MATCH (em:EntityMention)-[:LINKED_TO_ES]->(:ESEntity)
       RETURN count(em) AS linkedMentions`
    );
    return {
      total:           typeof r.total === 'object'          ? (r.total?.low ?? 0)          : (r.total || 0),
      namespaceCount:  typeof r.namespaceCount === 'object' ? (r.namespaceCount?.low ?? 0) : (r.namespaceCount || 0),
      typeCount:       typeof r.typeCount === 'object'      ? (r.typeCount?.low ?? 0)      : (r.typeCount || 0),
      linkedMentions:  typeof linked[0]?.linkedMentions === 'object'
        ? (linked[0]?.linkedMentions?.low ?? 0)
        : (linked[0]?.linkedMentions || 0),
    };
  }
}

const entityStoreService = new EntityStoreService();
module.exports = { entityStoreService, EntityStoreService };
