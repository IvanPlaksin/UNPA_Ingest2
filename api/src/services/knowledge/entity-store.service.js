'use strict';
const { v4: uuidv4 } = require('uuid');

let _mg;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

function _normalizeType(type) {
  if (!type) return 'CONCEPT';
  const { normalizeType } = require('../entity-store/entity-dedup.service');
  return normalizeType(type);
}

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
    const importedEsIds = [];

    for (const m of mentions) {
      if (m.esEntityId) { result.skipped++; importedEsIds.push(m.esEntityId); continue; }

      const canonType = _normalizeType(m.type);
      const existing = await mg().runQuery(
        `MATCH (e:ESEntity {name: $name, type: $type, namespace: $namespace})
         RETURN e.id AS id LIMIT 1`,
        { name: m.name, type: canonType, namespace }
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
            type:           canonType,
            category:       m.category || '',
            namespace,
            description:    m.description || m.match || '',
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
      importedEsIds.push(esId);
    }

    // Create DOCUMENT ESEntity + ES_RELATED_TO {relType:'MENTIONS'} edges to all extracted entities.
    // Without this, entities that have no co-mention RELATED_TO edges appear isolated in the graph.
    try {
      const docName = provDocSymbol || provDocTitle;
      if (docName && importedEsIds.length > 0) {
        const existingDoc = await mg().runQuery(
          `MATCH (e:ESEntity {name: $name, type: 'DOCUMENT', namespace: $namespace}) RETURN e.id AS id LIMIT 1`,
          { name: docName, namespace }
        );
        let docEsId;
        if (existingDoc.length > 0) {
          docEsId = existingDoc[0].id;
        } else {
          docEsId = uuidv4();
          await mg().runQuery(
            `CREATE (e:ESEntity {
               id: $id, name: $name, type: 'DOCUMENT', namespace: $namespace,
               description: $desc, createdAt: $ts, updatedAt: $ts,
               provenanceType: 'DOCUMENT_SELF', provenanceDocId: $docId
             })`,
            { id: docEsId, name: docName, namespace, desc: `Document: ${docName}`, ts, docId }
          );
        }
        let mentionsLinked = 0;
        for (const esId of importedEsIds) {
          if (esId === docEsId) continue;
          await mg().runQuery(
            `MATCH (doc:ESEntity {id: $docEsId}), (e:ESEntity {id: $esId})
             MERGE (doc)-[r:ES_RELATED_TO {relType: 'MENTIONS'}]->(e)
             SET r.documentId = $docId, r.extractedAt = $ts`,
            { docEsId, esId, docId, ts }
          ).catch(() => {});
          mentionsLinked++;
        }
        result.docEntityId = docEsId;
        result.mentionsLinked = mentionsLinked;
        console.log(`[EntityStore] Created ${mentionsLinked} MENTIONS edges for doc=${docId}`);
      }
    } catch (err) {
      console.warn('[EntityStore] MENTIONS edge creation error:', err.message);
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
            // Track each relationship evidence node for multi-source provenance
            await this.addRelationshipEvidence(srcId, tgtId, rel.relType || 'RELATED_TO', {
              documentId:  docId,
              context:     rel.context    || null,
              confidence:  typeof rel.confidence === 'number' ? rel.confidence : (rel.confidence?.low ?? 0.8),
              extractedAt: ts,
            }).catch(() => {});
          }
        }
        console.log(`[EntityStore] Imported ${relCount} relationships for doc=${docId}`);
      }
    } catch (err) {
      console.warn('[EntityStore] Relationship import error:', err.message);
    }

    // Link DOCUMENTREF ESEntities to this document's own ESEntity (reverse: who references this doc?)
    try {
      const linkResult = await this._linkDocumentRefs(docId, namespace, {
        symbol: provDocSymbol,
        title:  docInfo.title || null,
      });
      console.log(`[EntityStore] Doc linking: ${linkResult.refsLinked} DOCUMENTREF(s) → "${linkResult.docName}"`);
      result.docEntityId = linkResult.docEntityId;
      result.refsLinked  = linkResult.refsLinked;
    } catch (linkErr) {
      console.warn('[EntityStore] Doc linking error:', linkErr.message);
    }

    // Forward-link: DOCUMENTREFs created by this doc → already-existing DOCUMENT ESEntities
    try {
      const fwdLinked = await this._linkDocRefForward(docId, ts);
      if (fwdLinked > 0) console.log(`[EntityStore] Forward-linked ${fwdLinked} DOCUMENTREF(s) to existing DOCUMENTs`);
    } catch (fwdErr) {
      console.warn('[EntityStore] DocRef forward-link error:', fwdErr.message);
    }

    // Mark document as synced to ES
    await mg().runQuery(
      `MATCH (d:Document {id: $docId})
       SET d.esSyncedAt = $ts, d.esSyncStatus = 'COMPLETED'`,
      { docId, ts }
    ).catch(err => console.warn('[EntityStore] esSyncStatus update failed:', err.message));

    return { ...result, total: mentions.length };
  }

  // Link DOCUMENTREF ESEntities to this document's existing DOCUMENT ESEntity (if present).
  // Never creates DOCUMENT ESEntities — only links when one already exists from a real extraction.
  async _linkDocumentRefs(docId, namespace, { symbol, title }) {
    if (!symbol && !title) return { docEntityId: null, docName: null, refsLinked: 0 };

    const docName = symbol || title;
    const ts = now();

    // Look for an existing DOCUMENT ESEntity — created only via real importFromDocument extraction
    const existing = await mg().runQuery(
      `MATCH (e:ESEntity {name: $name, type: $type})
       RETURN e.id AS id LIMIT 1`,
      { name: docName, type: 'DOCUMENT' }
    );
    if (!existing.length) return { docEntityId: null, docName, refsLinked: 0 };

    const docEntityId = existing[0].id;

    // Find DOCUMENTREF ESEntities whose name matches this document's symbol (exact) or title (fuzzy)
    const refs = [];
    const seen = new Set();

    if (symbol) {
      const bySymbol = await mg().runQuery(
        `MATCH (e:ESEntity {type: $type, name: $symbol})
         RETURN e.id AS id, e.name AS name`,
        { type: 'DOCUMENTREF', symbol }
      );
      for (const r of bySymbol) { if (!seen.has(r.id)) { refs.push(r); seen.add(r.id); } }
    }

    if (title && title.length > 3) {
      const byTitle = await mg().runQuery(
        `MATCH (e:ESEntity {type: $type})
         WHERE toLower(e.name) CONTAINS toLower($title)
         RETURN e.id AS id, e.name AS name`,
        { type: 'DOCUMENTREF', title }
      );
      for (const r of byTitle) { if (!seen.has(r.id)) { refs.push(r); seen.add(r.id); } }
    }

    let refsLinked = 0;
    for (const ref of refs) {
      if (ref.id === docEntityId) continue;
      await mg().runQuery(
        `MATCH (src:ESEntity {id: $srcId}), (tgt:ESEntity {id: $tgtId})
         MERGE (src)-[r:ES_RELATED_TO {relType: $rt}]->(tgt)
         SET r.documentId = $docId, r.extractedAt = $ts`,
        { srcId: ref.id, tgtId: docEntityId, rt: 'REFERENCES', docId, ts }
      ).catch(() => {});
      refsLinked++;
    }

    return { docEntityId, docName, refsLinked };
  }

  // Link newly-created DOCUMENTREF ESEntities (from docId) to already-existing DOCUMENT ESEntities.
  // This is the forward direction: "what does docId reference?"
  // _linkDocumentRefs handles the reverse: "who references docId?"
  async _linkDocRefForward(docId, ts) {
    const rows = await mg().runQuery(
      `MATCH (dr:ESEntity {type: 'DOCUMENTREF', provenanceDocId: $docId})
       WHERE NOT (dr)-[:ES_RELATED_TO {relType: 'REFERENCES'}]->(:ESEntity {type: 'DOCUMENT'})
       WITH dr
       MATCH (doc:ESEntity {type: 'DOCUMENT'})
       WHERE doc.name = dr.name OR toLower(doc.name) = toLower(dr.name)
       MERGE (dr)-[r:ES_RELATED_TO {relType: 'REFERENCES'}]->(doc)
       SET r.documentId = $docId, r.extractedAt = $ts
       RETURN count(r) AS cnt`,
      { docId, ts }
    ).catch(() => []);
    const v = rows[0]?.cnt;
    return typeof v === 'object' ? (v?.low ?? 0) : (v ?? 0);
  }

  // Bulk-reconcile ALL unlinked DOCUMENTREF ESEntities → matching DOCUMENT ESEntities.
  // Run this once to fix existing orphaned DOCUMENTREFs created before forward-linking was added.
  async reconcileDocumentRefs() {
    const ts = now();
    const rows = await mg().runQuery(
      `MATCH (dr:ESEntity {type: 'DOCUMENTREF'})
       WHERE NOT (dr)-[:ES_RELATED_TO {relType: 'REFERENCES'}]->(:ESEntity {type: 'DOCUMENT'})
       WITH dr
       MATCH (doc:ESEntity {type: 'DOCUMENT'})
       WHERE doc.name = dr.name OR toLower(doc.name) = toLower(dr.name)
       MERGE (dr)-[r:ES_RELATED_TO {relType: 'REFERENCES'}]->(doc)
       SET r.extractedAt = $ts
       RETURN count(r) AS linked`,
      { ts }
    ).catch(() => []);
    const v = rows[0]?.linked;
    const linked = typeof v === 'object' ? (v?.low ?? 0) : (v ?? 0);
    return { linked };
  }

  // ── CRUD ────────────────────────────────────────────────────────────────

  async createEntity({ name, type, namespace = 'DEFAULT', description = '', epistemicLayer = '', category = '' }) {
    const id = uuidv4();
    const ts = now();
    const canonType = _normalizeType(type);
    await mg().runQuery(
      `CREATE (e:ESEntity {
         id: $id, name: $name, type: $type, category: $category,
         namespace: $namespace, description: $description,
         epistemicLayer: $epistemicLayer, createdAt: $ts, updatedAt: $ts
       })`,
      { id, name, type: canonType, category, namespace, description, epistemicLayer, ts }
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
       OPTIONAL MATCH (newer:ESEntity)-[:SUPERSEDES]->(e)
       WITH e, mentionCount, count(newer) = 0 AS isInForce
       RETURN e.id AS id, e.name AS name, e.type AS type,
              e.namespace AS namespace, e.category AS category,
              e.description AS description, e.epistemicLayer AS epistemicLayer,
              e.createdAt AS createdAt, e.updatedAt AS updatedAt, mentionCount, isInForce,
              e.provenanceType AS provenanceType,
              e.provenanceDocId AS provenanceDocId,
              e.provenanceDocTitle AS provenanceDocTitle,
              e.provenanceDocSymbol AS provenanceDocSymbol,
              e.provenanceImportedAt AS provenanceImportedAt
       ORDER BY e.namespace, e.type, e.name`,
      p
    );
    return rows.map(r => ({
      ...r,
      mentionCount: typeof r.mentionCount === 'object' ? (r.mentionCount?.low ?? 0) : (r.mentionCount || 0),
      isInForce: r.isInForce !== false,
    }));
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
                e.epistemicLayer AS epistemicLayer, mc AS mentionCount,
                COALESCE(e.createdAt, e.updatedAt) AS createdAt`,
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
        createdAt:      r.createdAt || null,
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

  // ── Document Refs ──────────────────────────────────────────────────────────

  async getDocumentRefs({ namespace = null } = {}) {
    const conds = ['e.type = \'DOCUMENTREF\''];
    const p = {};
    if (namespace) { conds.push('e.namespace = $namespace'); p.namespace = namespace; }
    const where = `WHERE ${conds.join(' AND ')}`;

    const rows = await mg().runQuery(
      `MATCH (e:ESEntity) ${where}
       OPTIONAL MATCH (e)-[:ES_RELATED_TO]->(doc:ESEntity {type: 'DOCUMENT'})
       OPTIONAL MATCH (extracted:ESEntity)
         WHERE extracted.type <> 'DOCUMENT' AND extracted.provenanceDocSymbol = e.name
       WITH e, doc, count(DISTINCT extracted) AS extractedCount
       RETURN e.id AS id, e.name AS name, e.namespace AS namespace,
              doc.id AS linkedDocId, doc.name AS linkedDocName,
              extractedCount
       ORDER BY e.name`,
      p
    );

    return rows.map(r => ({
      id:                   r.id,
      name:                 r.name,
      namespace:            r.namespace,
      linkedDocId:          r.linkedDocId   || null,
      linkedDocName:        r.linkedDocName || null,
      extractedEntityCount: typeof r.extractedCount === 'object'
        ? (r.extractedCount?.low ?? 0)
        : (r.extractedCount || 0),
    }));
  }

  // ── K-Shortest Paths ──────────────────────────────────────────────────────

  async findKShortestPaths(fromId, toId, k = 5) {
    const kMax = Math.min(Math.max(1, parseInt(k) || 5), 10);

    // Load weighted undirected relationships (with materialized cost)
    const allRels = await mg().runQuery(
      `MATCH (a:ESEntity)-[r:ES_RELATED_TO]->(b:ESEntity)
       RETURN a.id AS src, b.id AS tgt, COALESCE(r.cost, 1.0) AS cost`,
      {},
      null,
      { timeout: 20000 }
    );

    // Build weighted adjacency: nodeId → [{neighbor, cost}]
    const adj = new Map();
    const addEdge = (a, b, cost) => {
      if (!adj.has(a)) adj.set(a, []);
      adj.get(a).push({ neighbor: b, cost });
    };
    for (const r of allRels) {
      const cost = typeof r.cost === 'object' ? (r.cost?.low ?? 1.0) : (r.cost ?? 1.0);
      addEdge(r.src, r.tgt, cost);
      addEdge(r.tgt, r.src, cost);
    }

    const paths = yenKSP(adj, fromId, toId, kMax);
    if (!paths.length) return { paths: [], entities: [], relationships: [] };

    const allIds = [...new Set(paths.flatMap(p => p.nodeIds))];

    // Load weight table for strength lookup in segments
    let weightMap;
    try {
      const ews = require('./edge-weight.service');
      weightMap = await ews.loadWeightTable();
    } catch { weightMap = null; }

    const [entityRows, relRows] = await Promise.all([
      mg().runQuery(
        `MATCH (e:ESEntity) WHERE e.id IN $ids
         OPTIONAL MATCH (em:EntityMention)-[:LINKED_TO_ES]->(e)
         WITH e, count(em) AS mentionCount
         RETURN e.id AS id, e.name AS name, e.type AS type,
                e.namespace AS namespace, e.description AS description,
                e.epistemicLayer AS epistemicLayer, mentionCount,
                COALESCE(e.createdAt, e.updatedAt) AS createdAt`,
        { ids: allIds }
      ),
      mg().runQuery(
        `MATCH (a:ESEntity)-[r:ES_RELATED_TO]->(b:ESEntity)
         WHERE a.id IN $ids AND b.id IN $ids
         RETURN a.id AS sourceId, b.id AS targetId, r.relType AS relType,
                r.context AS context, r.confidence AS confidence,
                r.documentId AS documentId, COALESCE(r.cost, 1.0) AS cost`,
        { ids: allIds }
      ),
    ]);

    const entityMap = new Map(entityRows.map(e => [e.id, e]));

    // ── Phase 3: Structural Analysis ──────────────────────────────────────────
    const normalizedRels = relRows.map(r => ({
      sourceId:   r.sourceId,
      targetId:   r.targetId,
      relType:    r.relType,
      cost:       typeof r.cost === 'object' ? (r.cost?.low ?? null) : (r.cost ?? null),
      confidence: typeof r.confidence === 'object' ? (r.confidence?.low ?? null) : (r.confidence ?? null),
    }));

    const disjoint   = findEdgeDisjointPaths(adj, fromId, toId, 10);
    const subgraph   = extractConnectingSubgraph(paths, normalizedRels);
    const artPoints  = findArticulationPoints(subgraph.nodes, subgraph.edges, fromId, toId);
    const sortedPaths = [...paths].sort((a, b) => b.pathStrength - a.pathStrength);
    const strongest  = sortedPaths[0];

    const structuralAnalysis = {
      independentPathCount:  disjoint.count,
      independentPaths:      disjoint.paths,
      connectionRobustness:  disjoint.count >= 3 ? 'HIGH' : disjoint.count === 2 ? 'MODERATE' : 'FRAGILE',
      subgraphNodeCount:     subgraph.nodes.size,
      subgraphEdgeCount:     subgraph.edges.length,
      subgraphDensity:       subgraph.density,
      articulationPoints:    artPoints,
      hasCriticalBottleneck: artPoints.length > 0,
      avgPathStrength:       paths.reduce((s, p) => s + p.pathStrength, 0) / paths.length,
      strongestPath:         { nodeIds: strongest.nodeIds, pathStrength: strongest.pathStrength, hopCount: strongest.hopCount },
    };

    structuralAnalysis.summary = generateStructuralSummary(structuralAnalysis, entityMap);

    return {
      paths: paths.map(p => ({
        nodeIds:      p.nodeIds,
        hopCount:     p.hopCount,
        totalCost:    p.totalCost,
        pathStrength: p.pathStrength,
        segments: p.nodeIds.map((id, i) => {
          const e = entityMap.get(id);
          const seg = { id, name: e?.name || id, type: e?.type || 'UNKNOWN' };
          if (i < p.nodeIds.length - 1) {
            const nextId = p.nodeIds[i + 1];
            const rel = relRows.find(r =>
              (r.sourceId === id && r.targetId === nextId) ||
              (r.sourceId === nextId && r.targetId === id)
            );
            if (rel) {
              const relCost     = typeof rel.cost === 'object' ? (rel.cost?.low ?? 1.0) : (rel.cost ?? 1.0);
              const relStrength = weightMap?.get(rel.relType)?.strength ?? 0.2;
              seg.edge = {
                relType:   rel.relType,
                direction: rel.sourceId === id ? 'forward' : 'backward',
                cost:      relCost,
                strength:  relStrength,
              };
            } else {
              seg.edge = null;
            }
          }
          return seg;
        }),
      })),
      entities: entityRows.map(e => ({
        id: e.id, name: e.name, type: e.type, namespace: e.namespace,
        description: e.description, epistemicLayer: e.epistemicLayer,
        mentionCount: typeof e.mentionCount === 'object' ? (e.mentionCount?.low ?? 0) : (e.mentionCount || 0),
        createdAt: e.createdAt,
      })),
      relationships: normalizedRels,
      structuralAnalysis,
    };
  }

  // ── Entity Subgraph ────────────────────────────────────────────────────────

  async getEntitySubgraph(entityId, depth = 2) {
    const maxDepth = Math.min(Math.max(parseInt(depth) || 2, 1), 5);

    // BFS: collect all entity IDs reachable within maxDepth hops
    const visited = new Set([entityId]);
    let frontier = [entityId];

    for (let hop = 0; hop < maxDepth; hop++) {
      if (!frontier.length) break;
      const neighbours = await mg().runQuery(
        `MATCH (a:ESEntity)-[:ES_RELATED_TO]-(b:ESEntity)
         WHERE a.id IN $ids
         RETURN DISTINCT b.id AS id`,
        { ids: frontier }
      );
      const next = [];
      for (const row of neighbours) {
        if (!visited.has(row.id)) {
          visited.add(row.id);
          next.push(row.id);
        }
      }
      frontier = next;
    }

    const allIds = Array.from(visited);

    // Batch-fetch all entities with mention count
    const entityRows = await mg().runQuery(
      `MATCH (e:ESEntity) WHERE e.id IN $ids
       OPTIONAL MATCH (em:EntityMention)-[:LINKED_TO_ES]->(e)
       WITH e, count(em) AS mentionCount
       RETURN e.id AS id, e.name AS name, e.type AS type,
              e.namespace AS namespace, e.description AS description,
              e.epistemicLayer AS epistemicLayer, mentionCount,
              COALESCE(e.createdAt, e.updatedAt) AS createdAt`,
      { ids: allIds }
    );

    // Batch-fetch all ES_RELATED_TO edges between the collected IDs
    const relRows = await mg().runQuery(
      `MATCH (a:ESEntity)-[r:ES_RELATED_TO]->(b:ESEntity)
       WHERE a.id IN $ids AND b.id IN $ids
       RETURN a.id AS sourceId, b.id AS targetId, r.relType AS relType,
              r.context AS context, r.confidence AS confidence,
              r.documentId AS documentId`,
      { ids: allIds }
    );

    return {
      centerId: entityId,
      depth:    maxDepth,
      entities: entityRows.map(r => ({
        id:             r.id,
        name:           r.name,
        type:           r.type,
        namespace:      r.namespace,
        description:    r.description    || null,
        epistemicLayer: r.epistemicLayer || null,
        mentionCount:   typeof r.mentionCount === 'object' ? (r.mentionCount?.low ?? 0) : (r.mentionCount || 0),
        createdAt:      r.createdAt || null,
      })),
      relationships: relRows.map(r => ({
        sourceId:   r.sourceId,
        targetId:   r.targetId,
        relType:    r.relType    || 'RELATED_TO',
        context:    r.context    || null,
        confidence: typeof r.confidence === 'number' ? r.confidence : (r.confidence?.low ?? null),
        documentId: r.documentId || null,
      })),
    };
  }

  /**
   * Backfill MENTIONS edges for documents already imported into Entity Store.
   * For every Document that has ESEntity nodes linked via LINKED_TO_ES, creates
   * a DOCUMENT-type ESEntity and ES_RELATED_TO {relType:'MENTIONS'} edges to
   * every entity extracted from that document.
   */
  async backfillMentionsEdges(namespace = null) {
    const ts = now();

    // Collect distinct (docId, namespace) pairs that have ES-imported entities
    const rows = await mg().runQuery(
      namespace
        ? `MATCH (d:Document)-[:MENTIONS]->(em:EntityMention)-[:LINKED_TO_ES]->(e:ESEntity {namespace: $namespace})
           RETURN DISTINCT d.id AS docId, d.unSymbol AS symbol,
                  d.documentTitle AS title, d.originalname AS filename`
        : `MATCH (d:Document)-[:MENTIONS]->(em:EntityMention)-[:LINKED_TO_ES]->(e:ESEntity)
           RETURN DISTINCT d.id AS docId, d.unSymbol AS symbol,
                  d.documentTitle AS title, d.originalname AS filename, e.namespace AS namespace`,
      namespace ? { namespace } : {}
    );

    // De-duplicate (docId, namespace) pairs
    const pairs = [];
    const seen  = new Set();
    for (const r of rows) {
      const ns  = namespace || r.namespace || 'DEFAULT';
      const key = `${r.docId}::${ns}`;
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push({ docId: r.docId, symbol: r.symbol, title: r.title, filename: r.filename, namespace: ns });
      }
    }

    let docsProcessed = 0, docEntitiesCreated = 0, docEntitiesFound = 0, mentionsCreated = 0;

    for (const pair of pairs) {
      const docName = pair.symbol || pair.title || pair.filename;
      if (!docName) continue;

      const existingDoc = await mg().runQuery(
        `MATCH (e:ESEntity {name: $name, type: 'DOCUMENT', namespace: $namespace}) RETURN e.id AS id LIMIT 1`,
        { name: docName, namespace: pair.namespace }
      );

      let docEsId;
      if (existingDoc.length > 0) {
        docEsId = existingDoc[0].id;
        docEntitiesFound++;
      } else {
        docEsId = uuidv4();
        await mg().runQuery(
          `CREATE (e:ESEntity {
             id: $id, name: $name, type: 'DOCUMENT', namespace: $namespace,
             description: $desc, createdAt: $ts, updatedAt: $ts,
             provenanceType: 'BACKFILL', provenanceDocId: $docId
           })`,
          { id: docEsId, name: docName, namespace: pair.namespace,
            desc: `Document: ${docName}`, ts, docId: pair.docId }
        );
        docEntitiesCreated++;
      }

      const entities = await mg().runQuery(
        `MATCH (d:Document {id: $docId})-[:MENTIONS]->(em:EntityMention)-[:LINKED_TO_ES]->(e:ESEntity {namespace: $namespace})
         WHERE e.id <> $docEsId AND e.type <> 'DOCUMENT'
         RETURN DISTINCT e.id AS esId`,
        { docId: pair.docId, namespace: pair.namespace, docEsId }
      );

      for (const row of entities) {
        await mg().runQuery(
          `MATCH (doc:ESEntity {id: $docEsId}), (e:ESEntity {id: $esId})
           MERGE (doc)-[r:ES_RELATED_TO {relType: 'MENTIONS'}]->(e)
           SET r.documentId = $docId, r.extractedAt = $ts`,
          { docEsId, esId: row.esId, docId: pair.docId, ts }
        ).catch(() => {});
        mentionsCreated++;
      }
      docsProcessed++;
    }

    console.log(`[EntityStore] Backfill done: ${docsProcessed} docs, ${docEntitiesCreated} DOCUMENT nodes created, ${mentionsCreated} MENTIONS edges`);
    return { docsProcessed, docEntitiesCreated, docEntitiesFound, mentionsCreated };
  }

  /**
   * Return ALL ES_RELATED_TO edges between two entities (both directions, single hop).
   * Unlike findKShortestPaths which merges paths, this returns every relType edge
   * that connects the pair — used for Bundle enrichment in CONNECT primitive.
   */
  // ── RelationshipEvidence ─────────────────────────────────────────────────────

  async addRelationshipEvidence(sourceId, targetId, relType, evidence = {}) {
    const { documentId, context, confidence, extractedAt } = evidence;
    const id = `${sourceId}|${targetId}|${relType}|${documentId || 'unknown'}`;
    const ts = extractedAt || now();
    await mg().runQuery(
      `MERGE (ev:RelationshipEvidence {id: $id})
       SET ev.sourceEntityId = $sourceId,
           ev.targetEntityId = $targetId,
           ev.relType        = $relType,
           ev.documentId     = $documentId,
           ev.context        = $context,
           ev.confidence     = $confidence,
           ev.extractedAt    = $ts`,
      {
        id, sourceId, targetId, relType,
        documentId:  documentId  || null,
        context:     context     || null,
        confidence:  confidence  != null ? confidence : null,
        ts,
      }
    );
    return id;
  }

  async getRelationshipEvidence(sourceId, targetId, relType = null) {
    const rows = await mg().runQuery(
      `MATCH (ev:RelationshipEvidence {sourceEntityId: $sourceId, targetEntityId: $targetId})
       ${relType ? 'WHERE ev.relType = $relType' : ''}
       RETURN ev.id AS id, ev.relType AS relType, ev.documentId AS documentId,
              ev.context AS context, ev.confidence AS confidence, ev.extractedAt AS extractedAt
       ORDER BY ev.extractedAt DESC`,
      { sourceId, targetId, relType }
    );
    return rows.map(r => ({
      id:         r.id,
      relType:    r.relType,
      documentId: r.documentId,
      context:    r.context,
      confidence: typeof r.confidence === 'number' ? r.confidence : (r.confidence?.low ?? null),
      extractedAt: r.extractedAt,
    }));
  }

  async getAllEdgesBetween(nodeAId, nodeBId) {
    const rows = await mg().runQuery(
      `MATCH (a:ESEntity {id: $fromId})-[r:ES_RELATED_TO]->(b:ESEntity {id: $toId})
       RETURN r.relType AS relType, 'forward' AS direction,
              r.context AS context, r.confidence AS confidence,
              r.documentId AS documentId, COALESCE(r.cost, 1.0) AS cost
       UNION
       MATCH (b:ESEntity {id: $toId})-[r:ES_RELATED_TO]->(a:ESEntity {id: $fromId})
       RETURN r.relType AS relType, 'backward' AS direction,
              r.context AS context, r.confidence AS confidence,
              r.documentId AS documentId, COALESCE(r.cost, 1.0) AS cost`,
      { fromId: nodeAId, toId: nodeBId }
    );
    return rows.map(r => ({
      relType:    r.relType    || 'RELATED_TO',
      direction:  r.direction  || 'forward',
      context:    r.context    || null,
      confidence: typeof r.confidence === 'number' ? r.confidence : (r.confidence?.low ?? null),
      documentId: r.documentId || null,
      cost:       typeof r.cost === 'object' ? (r.cost?.low ?? 1.0) : (r.cost ?? 1.0),
    }));
  }
}

const entityStoreService = new EntityStoreService();
module.exports = { entityStoreService, EntityStoreService };

/* ── Weighted Dijkstra + Yen's K-Shortest Paths ──────────────────────────── */

/**
 * Dijkstra's shortest path on a weighted adjacency map.
 * adj: Map<nodeId, Array<{neighbor: string, cost: number}>>
 * Returns {path: string[], totalCost: number} or null.
 */
function dijkstraPath(adj, blockedEdges, blockedNodes, src, tgt) {
  const dist   = new Map([[src, 0]]);
  const parent = new Map([[src, null]]);
  // Min-priority queue: [{id, cost}], sorted ascending by cost
  const queue  = [{ id: src, cost: 0 }];

  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const { id, cost } = queue.shift();

    if (id === tgt) {
      // Reconstruct path
      const path = [];
      let cur = tgt;
      while (cur !== null) { path.unshift(cur); cur = parent.get(cur); }
      return { path, totalCost: cost };
    }

    if (cost > (dist.get(id) ?? Infinity)) continue;

    for (const { neighbor, cost: edgeCost } of (adj.get(id) || [])) {
      if (blockedNodes.has(neighbor)) continue;
      if (blockedEdges.has(`${id}|${neighbor}`)) continue;
      const newCost = cost + edgeCost;
      if (newCost < (dist.get(neighbor) ?? Infinity)) {
        dist.set(neighbor, newCost);
        parent.set(neighbor, id);
        queue.push({ id: neighbor, cost: newCost });
      }
    }
  }
  return null;
}

function _computeRootCost(adj, rootPath) {
  let cost = 0;
  for (let i = 0; i < rootPath.length - 1; i++) {
    const entry = (adj.get(rootPath[i]) || []).find(e => e.neighbor === rootPath[i + 1]);
    cost += entry ? entry.cost : 1.0;
  }
  return cost;
}

/**
 * Yen's K-Shortest Paths using weighted Dijkstra.
 * Returns [{nodeIds, totalCost, pathStrength, hopCount}] sorted by totalCost.
 */
function yenKSP(adj, source, target, K) {
  const first = dijkstraPath(adj, new Set(), new Set(), source, target);
  if (!first) return [];

  const A = [{ nodeIds: first.path, totalCost: first.totalCost }];
  const B = []; // candidates

  for (let k = 1; k < K; k++) {
    const prev     = A[k - 1].nodeIds;
    const prevCost = A[k - 1].totalCost;

    for (let i = 0; i < prev.length - 1; i++) {
      const spurNode = prev[i];
      const rootPath = prev.slice(0, i + 1);
      const rootKey  = rootPath.join(',');
      const rootCost = _computeRootCost(adj, rootPath);

      const blockedEdges = new Set();
      const blockedNodes = new Set(rootPath.slice(0, -1));

      for (const p of A) {
        if (p.nodeIds.length > i && p.nodeIds.slice(0, i + 1).join(',') === rootKey) {
          blockedEdges.add(`${p.nodeIds[i]}|${p.nodeIds[i + 1]}`);
          blockedEdges.add(`${p.nodeIds[i + 1]}|${p.nodeIds[i]}`);
        }
      }

      const spur = dijkstraPath(adj, blockedEdges, blockedNodes, spurNode, target);
      if (spur) {
        const totalPath = [...rootPath.slice(0, -1), ...spur.path];
        const totalCost = rootCost + spur.totalCost;
        const key       = totalPath.join(',');
        if (!A.some(p => p.nodeIds.join(',') === key) && !B.some(p => p.nodeIds.join(',') === key)) {
          B.push({ nodeIds: totalPath, totalCost });
        }
      }
    }

    if (!B.length) break;
    B.sort((a, b) => a.totalCost - b.totalCost);
    A.push(B.shift());
  }

  return A.map(p => ({
    nodeIds:      p.nodeIds,
    totalCost:    p.totalCost,
    pathStrength: Math.exp(-p.totalCost),
    hopCount:     p.nodeIds.length - 1,
  }));
}

/* ── Phase 3: Structural Analysis ────────────────────────────────────────── */

/** BFS on residual graph for Edmonds-Karp */
function _bfsResidual(residual, source, target) {
  const parent  = new Map([[source, null]]);
  const visited = new Set([source]);
  const queue   = [source];
  while (queue.length) {
    const u = queue.shift();
    if (u === target) {
      const path = [];
      let cur = target;
      while (cur !== null) { path.unshift(cur); cur = parent.get(cur); }
      return path;
    }
    for (const v of (residual.get(u) || [])) {
      if (!visited.has(v)) { visited.add(v); parent.set(v, u); queue.push(v); }
    }
  }
  return null;
}

/**
 * Find edge-disjoint paths (unit capacity Edmonds-Karp).
 * adj: weighted adjacency Map<nodeId, [{neighbor, cost}]>
 */
function findEdgeDisjointPaths(adj, source, target, maxPaths = 10) {
  // Build residual: each undirected edge available in both directions
  const residual = new Map();
  for (const [node, neighbors] of adj) {
    if (!residual.has(node)) residual.set(node, new Set());
    for (const { neighbor } of neighbors) {
      residual.get(node).add(neighbor);
      if (!residual.has(neighbor)) residual.set(neighbor, new Set());
      residual.get(neighbor).add(node);
    }
  }

  const paths = [];
  while (paths.length < maxPaths) {
    const path = _bfsResidual(residual, source, target);
    if (!path) break;
    paths.push(path);
    // Remove used edges (both directions — undirected unit capacity)
    for (let i = 0; i < path.length - 1; i++) {
      residual.get(path[i])?.delete(path[i + 1]);
      residual.get(path[i + 1])?.delete(path[i]);
    }
  }

  return {
    count: paths.length,
    paths,
    isFullyConnected: paths.length >= maxPaths,
  };
}

/**
 * Extract the minimal subgraph containing all edges from K best paths.
 */
function extractConnectingSubgraph(paths, allRelationships) {
  const nodes    = new Set();
  const edgeKeys = new Set();

  for (const p of paths) {
    for (const id of p.nodeIds) nodes.add(id);
    for (let i = 0; i < p.nodeIds.length - 1; i++) {
      const a = p.nodeIds[i], b = p.nodeIds[i + 1];
      edgeKeys.add([a, b].sort().join('|'));
    }
  }

  const edges = [];
  for (const key of edgeKeys) {
    const [a, b] = key.split('|');
    const rel = allRelationships.find(r =>
      (r.sourceId === a && r.targetId === b) ||
      (r.sourceId === b && r.targetId === a)
    );
    if (rel) {
      edges.push({
        source: rel.sourceId, target: rel.targetId,
        relType: rel.relType,
        cost: typeof rel.cost === 'object' ? (rel.cost?.low ?? null) : (rel.cost ?? null),
        confidence: typeof rel.confidence === 'object' ? (rel.confidence?.low ?? null) : (rel.confidence ?? null),
      });
    }
  }

  const n = nodes.size;
  const density = n > 1 ? (2 * edges.length) / (n * (n - 1)) : 0;
  return { nodes, edges, density };
}

/** BFS reachability excluding one node */
function _canReachWithout(subAdj, source, target, excluded) {
  if (source === excluded || target === excluded) return false;
  const visited = new Set([source, excluded]);
  const queue   = [source];
  while (queue.length) {
    const u = queue.shift();
    if (u === target) return true;
    for (const v of (subAdj.get(u) || [])) {
      if (!visited.has(v)) { visited.add(v); queue.push(v); }
    }
  }
  return false;
}

/**
 * Find articulation points (cut vertices) in connecting subgraph.
 * Removal of an articulation point disconnects source from target.
 */
function findArticulationPoints(subgraphNodes, subgraphEdges, source, target) {
  const subAdj = new Map();
  for (const n of subgraphNodes) subAdj.set(n, new Set());
  for (const e of subgraphEdges) {
    subAdj.get(e.source)?.add(e.target);
    subAdj.get(e.target)?.add(e.source);
  }

  const articulation = [];
  for (const node of subgraphNodes) {
    if (node === source || node === target) continue;
    if (!_canReachWithout(subAdj, source, target, node)) {
      articulation.push(node);
    }
  }
  return articulation;
}

/**
 * Generate human-readable structural analysis insights.
 */
function generateStructuralSummary(analysis, entityMap) {
  const insights = [];

  if (analysis.independentPathCount === 1) {
    insights.push('Connection is FRAGILE: only 1 independent path exists. Any edge disruption severs the link.');
  } else if (analysis.independentPathCount === 2) {
    insights.push('Connection has MODERATE robustness: 2 independent paths exist.');
  } else {
    insights.push(`Connection is ROBUST: ${analysis.independentPathCount} independent paths exist.`);
  }

  if (analysis.articulationPoints.length > 0) {
    const names = analysis.articulationPoints.map(id => entityMap.get(id)?.name || id).join(', ');
    insights.push(`CRITICAL BOTTLENECK: all paths pass through — ${names}.`);
  } else if (analysis.independentPathCount > 1) {
    insights.push('No single point of failure: connection survives removal of any intermediary.');
  }

  const pct = (analysis.subgraphDensity * 100).toFixed(0);
  if (analysis.subgraphDensity > 0.5) {
    insights.push(`Connecting subgraph is DENSE (${pct}%): entities are heavily cross-linked.`);
  } else {
    insights.push(`Connecting subgraph density: ${pct}% (${analysis.subgraphNodeCount} nodes, ${analysis.subgraphEdgeCount} edges).`);
  }

  insights.push(
    `Strongest path: strength ${(analysis.strongestPath.pathStrength * 100).toFixed(1)}% over ${analysis.strongestPath.hopCount} hops.`
  );

  return insights;
}
