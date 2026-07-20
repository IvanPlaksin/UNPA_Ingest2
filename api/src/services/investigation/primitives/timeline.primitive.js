'use strict';
const {
  ALL_EDGE_TYPES, createEnvelope, buildNode, buildEdge, PROJECTION_KIND,
} = require('../../../constants/canonical-graph.constants');
const _E = ALL_EDGE_TYPES.join('|');

/**
 * TIMELINE primitive — temporal projection of entities and their relationships.
 *
 * Extracts date-like properties from ESEntity nodes and orders them chronologically.
 * Also surfaces ES_RELATED_TO relationships with temporal context where available.
 *
 * Input params:
 *   entityIds    {string[]} optional — specific entities to project; if empty: all in namespace
 *   namespace    {string}   optional — restrict to a namespace
 *   dateProperty {string}   optional — entity property to use as date; defaults to auto-detect
 *   limit        {number}   default 50 — max events returned
 *
 * Output (artifact content):
 *   events:   [{entityId, name, type, date, eventType, property, description}]
 *   span:     { earliest, latest, durationDays }
 *   entityCount: number
 *   summary:  { eventCount, sourcesWithDates, sourcesWithoutDates }
 */

const PRIMITIVE_TYPE = 'TIMELINE';

const inputSchema = {
  entityIds:    { type: 'array' },
  namespace:    { type: 'string' },
  dateProperty: { type: 'string' },
  limit:        { type: 'number', default: 50 },
};

// Properties that likely contain dates, in priority order
const DATE_PROPERTIES = [
  'effectiveDate', 'adoptionDate', 'publicationDate', 'issuedAt',
  'sessionDate', 'meetingDate', 'reportDate', 'dateOfIssuance',
  'createdAt', 'updatedAt',
];

let _mg;
function mg() {
  if (!_mg) _mg = require('../../memgraph.service');
  return _mg;
}

function _isValidDate(str) {
  if (!str || typeof str !== 'string') return false;
  // ISO date or common date-like strings
  return /^\d{4}/.test(str);
}

function _parseDateSafe(str) {
  if (!str) return null;
  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) return null;
    return d;
  } catch { return null; }
}

async function execute(params, _context, _services) {
  const { entityIds = [], namespace = null, dateProperty = null, limit = 50 } = params;

  // Fetch entity nodes
  let entityRows;
  if (entityIds.length > 0) {
    entityRows = await mg().runQuery(
      `MATCH (e:ESEntity) WHERE e.id IN $ids
       RETURN e.id AS id, e.name AS name, e.type AS type, e.namespace AS ns,
              e.description AS description,
              e.createdAt AS createdAt, e.updatedAt AS updatedAt,
              e.effectiveDate AS effectiveDate, e.adoptionDate AS adoptionDate,
              e.publicationDate AS publicationDate, e.issuedAt AS issuedAt,
              e.sessionDate AS sessionDate, e.meetingDate AS meetingDate,
              e.reportDate AS reportDate, e.dateOfIssuance AS dateOfIssuance`,
      { ids: entityIds }
    );
  } else if (namespace) {
    entityRows = await mg().runQuery(
      `MATCH (e:ESEntity {namespace: $ns})
       RETURN e.id AS id, e.name AS name, e.type AS type, e.namespace AS ns,
              e.description AS description,
              e.createdAt AS createdAt, e.updatedAt AS updatedAt,
              e.effectiveDate AS effectiveDate, e.adoptionDate AS adoptionDate,
              e.publicationDate AS publicationDate, e.issuedAt AS issuedAt,
              e.sessionDate AS sessionDate, e.meetingDate AS meetingDate,
              e.reportDate AS reportDate, e.dateOfIssuance AS dateOfIssuance
       LIMIT 200`,
      { ns: namespace }
    );
  } else {
    entityRows = await mg().runQuery(
      `MATCH (e:ESEntity)
       RETURN e.id AS id, e.name AS name, e.type AS type, e.namespace AS ns,
              e.description AS description,
              e.createdAt AS createdAt, e.updatedAt AS updatedAt,
              e.effectiveDate AS effectiveDate, e.adoptionDate AS adoptionDate,
              e.publicationDate AS publicationDate, e.issuedAt AS issuedAt,
              e.sessionDate AS sessionDate, e.meetingDate AS meetingDate,
              e.reportDate AS reportDate, e.dateOfIssuance AS dateOfIssuance
       LIMIT 200`
    );
  }

  const events = [];
  let sourcesWithDates = 0;
  let sourcesWithoutDates = 0;

  for (const row of entityRows) {
    // Determine which property to use for the event date
    const propsToCheck = dateProperty
      ? [dateProperty, ...DATE_PROPERTIES.filter(p => p !== dateProperty)]
      : DATE_PROPERTIES;

    let eventDate = null;
    let usedProperty = null;

    for (const prop of propsToCheck) {
      const val = row[prop];
      if (_isValidDate(val)) {
        eventDate = val;
        usedProperty = prop;
        break;
      }
    }

    if (eventDate) {
      sourcesWithDates++;
      events.push({
        entityId:    row.id,
        name:        row.name || row.id,
        type:        row.type,
        date:        eventDate,
        eventType:   _eventTypeFromProperty(usedProperty),
        property:    usedProperty,
        description: row.description || null,
      });
    } else {
      sourcesWithoutDates++;
    }
  }

  // Also surface relationship context that contains dates
  if (entityIds.length > 0 && entityIds.length <= 20) {
    const relRows = await mg().runQuery(
      `MATCH (a:ESEntity)-[r:${_E}]->(b:ESEntity)
       WHERE (a.id IN $ids OR b.id IN $ids) AND r.context IS NOT NULL
       RETURN a.id AS fromId, a.name AS fromName, b.id AS toId, b.name AS toName,
              type(r) AS relType, r.context AS context, r.documentId AS documentId`,
      { ids: entityIds }
    );

    for (const r of relRows) {
      // Look for year mentions in context (e.g. "in 2015", "adopted 2019")
      const yearMatch = (r.context || '').match(/\b(19|20)\d{2}\b/);
      if (yearMatch) {
        events.push({
          entityId:    r.fromId,
          name:        `${r.fromName} → ${r.toName}`,
          type:        'RELATIONSHIP',
          date:        `${yearMatch[0]}-01-01`,
          eventType:   'RELATIONSHIP',
          property:    'context',
          relType:     r.relType,
          description: r.context,
          toEntityId:  r.toId,
        });
      }
    }
  }

  // Sort by date
  events.sort((a, b) => {
    const da = _parseDateSafe(a.date);
    const db = _parseDateSafe(b.date);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da - db;
  });

  const sliced = events.slice(0, limit);

  // Compute span
  const dated = sliced.map(e => _parseDateSafe(e.date)).filter(Boolean);
  const earliest = dated.length ? dated[0].toISOString().slice(0, 10) : null;
  const latest   = dated.length ? dated[dated.length - 1].toISOString().slice(0, 10) : null;
  const durationDays = (earliest && latest)
    ? Math.round((_parseDateSafe(latest) - _parseDateSafe(earliest)) / 86400000)
    : null;

  const evidencedBy = entityRows.map(r => r.id).filter(Boolean);

  const envelope = createEnvelope({
    roots:      entityIds.length > 0 ? entityIds : [],
    kind:       PROJECTION_KIND.TIMELINE,
    hints: {
      events:      sliced,
      span:        { earliest, latest, durationDays },
      entityCount: entityRows.length,
    },
    producedBy: 'TOOL',
    toolId:     'investigation.timeline',
  });

  for (const row of entityRows) {
    envelope.nodes.push(buildNode({ id: row.id, type: row.type, name: row.name, namespace: row.ns }));
  }

  envelope.summary = {
    headline:           `${sliced.length} event${sliced.length !== 1 ? 's' : ''} across ${entityRows.length} entities`,
    eventCount:         sliced.length,
    sourcesWithDates,
    sourcesWithoutDates,
  };

  return { content: envelope, evidencedBy };
}

function _eventTypeFromProperty(prop) {
  const map = {
    effectiveDate:    'EFFECTIVE',
    adoptionDate:     'ADOPTION',
    publicationDate:  'PUBLICATION',
    issuedAt:         'ISSUANCE',
    sessionDate:      'SESSION',
    meetingDate:      'MEETING',
    reportDate:       'REPORT',
    dateOfIssuance:   'ISSUANCE',
    createdAt:        'CREATED',
    updatedAt:        'UPDATED',
  };
  return map[prop] || 'EVENT';
}

module.exports = { PRIMITIVE_TYPE, inputSchema, execute };
