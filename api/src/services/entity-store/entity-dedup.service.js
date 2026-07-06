'use strict';

const { v4: uuidv4 } = require('uuid');

let _mg;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }
function _n(v) { return typeof v === 'object' ? (v?.low ?? 0) : (v || 0); }

// ── Type system ────────────────────────────────────────────────────────────────

const TYPE_PRIORITY = {
  ORGANIZATION: 100, PERSON: 95, POLICY: 90, SYSTEM: 85,
  DOCUMENT: 80, DOCUMENTREF: 80, PROCESS: 75, TECHNOLOGY: 70,
  EVENT: 65, CONCEPT: 60, LOCATION: 55, ACTOR: 50, WORK_ITEM: 45,
};

const TYPE_ALIASES = {
  DOCUMENTREF: 'DOCUMENTREF', DOCUMENT_REF: 'DOCUMENTREF', DOC_REF: 'DOCUMENTREF',
  TECHNICAL: 'TECHNOLOGY', TECH: 'TECHNOLOGY',
  ORG: 'ORGANIZATION', ORGANISATION: 'ORGANIZATION',
  WORKITEM: 'WORK_ITEM', 'WORK-ITEM': 'WORK_ITEM',
};

function normalizeType(type) {
  if (!type) return 'CONCEPT';
  const upper = String(type).toUpperCase().trim();
  return TYPE_ALIASES[upper] || upper;
}

function determineCanonicalType(types) {
  const normalized = [...new Set(types.map(normalizeType))];
  if (normalized.length === 1) return normalized[0];
  return normalized.sort((a, b) => (TYPE_PRIORITY[b] || 0) - (TYPE_PRIORITY[a] || 0))[0];
}

function _computeRecommendation(entities) {
  if (entities.length < 2) return null;

  // Deduplicate by internalId first — don't count same node twice
  const seen = new Set();
  const unique = entities.filter(e => {
    const key = e.internalId !== undefined ? String(e.internalId) : e.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length < 2) return null;

  const sorted = [...unique].sort((a, b) => {
    const md = _n(b.mentionCount) - _n(a.mentionCount);
    if (md !== 0) return md;
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  });

  const primary = sorted[0];
  const toMerge = sorted.slice(1);
  const canonicalType = determineCanonicalType(unique.map(e => e.type));
  const types = new Set(unique.map(e => normalizeType(e.type)));
  const confidence = types.size === 1 ? 1.0 : types.size === 2 ? 0.8 : 0.6;

  return {
    primaryInternalId: primary.internalId,
    primaryId: primary.id,
    primaryName: primary.name,
    canonicalType,
    toMerge: toMerge.map(e => ({ internalId: e.internalId, id: e.id })),
    toMergeIds: toMerge.map(e => e.id),
    confidence,
    reason: types.size === 1
      ? 'Exact match (same name, same normalized type)'
      : `Type normalization needed: ${[...types].join(', ')}`,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _nodeClause(ref, alias) {
  if (ref && typeof ref === 'object' && ref.internalId !== undefined) {
    return `(${alias}:ESEntity) WHERE id(${alias}) = ${Number(ref.internalId)}`;
  }
  // String property id — use MATCH with property filter
  return `(${alias}:ESEntity {id: '${ref}'})`;
}

// ── Duplicate detection ────────────────────────────────────────────────────────

async function findDuplicateCandidates({ namespace = null, limit = 100 } = {}) {
  const nsFilter = namespace ? `AND e.namespace = '${namespace}'` : '';
  const rows = await mg().runQuery(
    `MATCH (e:ESEntity)
     WHERE e.name IS NOT NULL ${nsFilter}
     WITH toLower(trim(e.name)) AS normalizedName, collect(e) AS entities
     WITH normalizedName, entities,
          [ent IN entities | id(ent)] AS internalIds
     WHERE size(internalIds) > 1
     RETURN normalizedName,
            [ent IN entities | {
              internalId: id(ent),
              id: ent.id, name: ent.name, type: ent.type,
              namespace: ent.namespace, description: ent.description,
              epistemicLayer: ent.epistemicLayer,
              mentionCount: COALESCE(ent.mentionCount, 0), createdAt: ent.createdAt
            }] AS entities,
            size(entities) AS cnt
     ORDER BY cnt DESC
     LIMIT ${parseInt(limit)}`
  );

  return rows.map(r => ({
    normalizedName: r.normalizedName,
    count: _n(r.cnt),
    entities: r.entities || [],
    recommendation: _computeRecommendation(r.entities || []),
  }));
}

// ── Merge operation ────────────────────────────────────────────────────────────

/**
 * Merge source entity into target entity.
 * Accepts either internalId (Memgraph internal integer node ID) or id (string property).
 *
 * @param {number|string} sourceRef  - { internalId } or string id property
 * @param {number|string} targetRef  - { internalId } or string id property
 */
async function mergeEntities(sourceRef, targetRef, { reason = 'Manual merge', canonicalType = null } = {}) {
  // Resolve to internal IDs where possible
  const srcClause = _nodeClause(sourceRef, 's');
  const tgtClause = _nodeClause(targetRef, 't');

  if (typeof sourceRef === typeof targetRef && sourceRef === targetRef) {
    throw new Error('Cannot merge entity into itself');
  }

  // Build WHERE conditions without trailing standalone WHERE
  const srcWhere = (sourceRef && typeof sourceRef === 'object' && sourceRef.internalId !== undefined)
    ? `id(s) = ${Number(sourceRef.internalId)}`
    : `s.id = '${sourceRef}'`;
  const tgtWhere = (targetRef && typeof targetRef === 'object' && targetRef.internalId !== undefined)
    ? `id(t) = ${Number(targetRef.internalId)}`
    : `t.id = '${targetRef}'`;

  // Validate both exist
  const check = await mg().runQuery(
    `MATCH (s:ESEntity) WHERE ${srcWhere}
     WITH s
     MATCH (t:ESEntity) WHERE ${tgtWhere} AND id(t) <> id(s)
     RETURN s.id AS sid, s.name AS sname, s.type AS stype, s.description AS sdesc,
            COALESCE(s.mentionCount, 0) AS sMentions, id(s) AS sIntId,
            t.id AS tid, t.name AS tname, t.type AS ttype,
            COALESCE(t.mentionCount, 0) AS tMentions, id(t) AS tIntId`
  );
  if (!check.length) throw new Error(`Source or target not found, or they are the same node`);

  const sIntId = _n(check[0].sIntId); // Memgraph internal integer node ID
  const tIntId = _n(check[0].tIntId);

  const row = check[0];
  const stats = { linkedMentionsTransferred: 0, relationsTransferred: 0, relationsSkipped: 0 };

  // 1. Transfer LINKED_TO_ES from source → target (by internal node ID)
  const linkRes = await mg().runQuery(
    `MATCH (s:ESEntity) WHERE id(s) = ${sIntId}
     MATCH (t:ESEntity) WHERE id(t) = ${tIntId}
     WITH s, t
     MATCH (s)<-[r:LINKED_TO_ES]-(em:EntityMention)
     DELETE r
     MERGE (em)-[:LINKED_TO_ES]->(t)
     RETURN count(em) AS cnt`
  );
  stats.linkedMentionsTransferred = _n(linkRes[0]?.cnt);

  // 2. Transfer outgoing ES_RELATED_TO
  const outRes = await mg().runQuery(
    `MATCH (s:ESEntity) WHERE id(s) = ${sIntId}
     MATCH (t:ESEntity) WHERE id(t) = ${tIntId}
     WITH s, t
     MATCH (s)-[r:ES_RELATED_TO]->(other:ESEntity)
     WHERE id(other) <> ${tIntId}
     OPTIONAL MATCH (t)-[ex:ES_RELATED_TO {relType: r.relType}]->(other)
     WITH r, other, t, ex
     WHERE ex IS NULL
     CREATE (t)-[:ES_RELATED_TO {
       relType: r.relType, confidence: r.confidence,
       context: r.context, cost: r.cost,
       createdAt: r.createdAt, mergedFrom: $srcPropId
     }]->(other)
     DELETE r
     RETURN count(*) AS cnt`,
    { srcPropId: row.sid || '' }
  );
  stats.relationsTransferred += _n(outRes[0]?.cnt);

  // 3. Transfer incoming ES_RELATED_TO
  const inRes = await mg().runQuery(
    `MATCH (s:ESEntity) WHERE id(s) = ${sIntId}
     MATCH (t:ESEntity) WHERE id(t) = ${tIntId}
     WITH s, t
     MATCH (other:ESEntity)-[r:ES_RELATED_TO]->(s)
     WHERE id(other) <> ${tIntId}
     OPTIONAL MATCH (other)-[ex:ES_RELATED_TO {relType: r.relType}]->(t)
     WITH r, other, t, ex
     WHERE ex IS NULL
     CREATE (other)-[:ES_RELATED_TO {
       relType: r.relType, confidence: r.confidence,
       context: r.context, cost: r.cost,
       createdAt: r.createdAt, mergedFrom: $srcPropId
     }]->(t)
     DELETE r
     RETURN count(*) AS cnt`,
    { srcPropId: row.sid || '' }
  );
  stats.relationsTransferred += _n(inRes[0]?.cnt);

  // 4. Delete remaining edges from source
  const cleanRes = await mg().runQuery(
    `MATCH (s:ESEntity) WHERE id(s) = ${sIntId}
     MATCH (s)-[r:ES_RELATED_TO]-()
     DELETE r RETURN count(r) AS cnt`
  );
  stats.relationsSkipped = _n(cleanRes[0]?.cnt);

  // 5. Update target properties
  const finalType = canonicalType || determineCanonicalType([row.stype, row.ttype]);
  const combinedMentions = _n(row.sMentions) + _n(row.tMentions);
  const now = new Date().toISOString();

  await mg().runQuery(
    `MATCH (t:ESEntity) WHERE id(t) = ${tIntId}
     SET t.type = $type,
         t.mentionCount = $mc,
         t.description = CASE WHEN t.description IS NULL OR t.description = '' THEN $sdesc ELSE t.description END,
         t.mergedIds = COALESCE(t.mergedIds, []) + [$srcPropId],
         t.updatedAt = $now`,
    { type: finalType, mc: combinedMentions, sdesc: row.sdesc || '', srcPropId: row.sid || '', now }
  );

  // 6. Audit log
  const logId = uuidv4();
  await mg().runQuery(
    `CREATE (log:EntityMergeLog {
       id: $id, sourceId: $sid, sourceName: $sname, sourceType: $stype,
       targetId: $tid, targetName: $tname, targetType: $ttype,
       finalType: $finalType, reason: $reason,
       linkedTransferred: $lt, relsTransferred: $rt, relsSkipped: $rs,
       mergedAt: $now
     })`,
    {
      id: logId,
      sid: row.sid || '', sname: row.sname || '', stype: row.stype || '',
      tid: row.tid || '', tname: row.tname || '', ttype: row.ttype || '',
      finalType, reason,
      lt: stats.linkedMentionsTransferred, rt: stats.relationsTransferred, rs: stats.relationsSkipped,
      now,
    }
  );

  // 7. Delete source entity by internal ID (detach to remove any remaining edges)
  await mg().runQuery(`MATCH (s:ESEntity) WHERE id(s) = ${sIntId} DETACH DELETE s`);

  return { success: true, sourceId: row.sid, targetId: row.tid, finalType, stats, reason };
}

// ── Batch operations ───────────────────────────────────────────────────────────

async function batchAutoMerge({ confidenceThreshold = 1.0, maxMerges = 50, dryRun = false } = {}) {
  const candidates = await findDuplicateCandidates({ limit: 200 });
  const eligible = candidates
    .filter(g => g.recommendation && g.recommendation.confidence >= confidenceThreshold)
    .slice(0, maxMerges);

  if (dryRun) {
    return {
      dryRun: true,
      wouldMerge: eligible.reduce((s, g) => s + g.recommendation.toMergeIds.length, 0),
      groups: eligible.map(g => ({
        name: g.normalizedName,
        primaryId: g.recommendation.primaryId,
        toMergeIds: g.recommendation.toMergeIds,
        confidence: g.recommendation.confidence,
        reason: g.recommendation.reason,
        canonicalType: g.recommendation.canonicalType,
      })),
    };
  }

  const results = { merged: 0, failed: 0, errors: [] };
  for (const group of eligible) {
    const { primaryInternalId, primaryId, toMerge, canonicalType, reason } = group.recommendation;
    const targetRef = { internalId: primaryInternalId };
    for (const srcRef of toMerge) {
      try {
        await mergeEntities({ internalId: srcRef.internalId }, targetRef, { reason, canonicalType });
        results.merged++;
      } catch (err) {
        results.failed++;
        results.errors.push({ sourceInternalId: srcRef.internalId, targetId: primaryId, error: err.message });
      }
    }
  }

  return results;
}

// ── Statistics ─────────────────────────────────────────────────────────────────

async function getDedupStats() {
  const [totalRows, logRows, candidates] = await Promise.all([
    mg().runQuery(`MATCH (e:ESEntity) RETURN count(e) AS cnt`),
    mg().runQuery(`MATCH (log:EntityMergeLog) RETURN count(log) AS cnt`),
    findDuplicateCandidates({ limit: 500 }),
  ]);

  const hi = candidates.filter(g => (g.recommendation?.confidence || 0) >= 0.9).length;
  const med = candidates.filter(g => { const c = g.recommendation?.confidence || 0; return c >= 0.7 && c < 0.9; }).length;
  const lo = candidates.filter(g => (g.recommendation?.confidence || 0) < 0.7).length;

  return {
    totalEntities: _n(totalRows[0]?.cnt),
    duplicateGroups: candidates.length,
    nodesToMerge: candidates.reduce((s, g) => s + (g.recommendation?.toMergeIds?.length || 0), 0),
    groupsByConfidence: { high: hi, medium: med, low: lo },
    totalMergesPerformed: _n(logRows[0]?.cnt),
  };
}

async function getMergeHistory({ limit = 50 } = {}) {
  return mg().runQuery(
    `MATCH (log:EntityMergeLog)
     RETURN log.id AS id, log.sourceId AS sourceId, log.sourceName AS sourceName,
            log.sourceType AS sourceType, log.targetId AS targetId, log.targetName AS targetName,
            log.finalType AS finalType, log.reason AS reason,
            log.linkedTransferred AS lt, log.relsTransferred AS rt, log.mergedAt AS mergedAt
     ORDER BY log.mergedAt DESC
     LIMIT ${parseInt(limit)}`
  );
}

module.exports = {
  findDuplicateCandidates,
  mergeEntities,
  batchAutoMerge,
  getDedupStats,
  getMergeHistory,
  normalizeType,
  determineCanonicalType,
  TYPE_PRIORITY,
};
