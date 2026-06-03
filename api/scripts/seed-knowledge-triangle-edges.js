'use strict';
/**
 * Seed Knowledge Triangle Edge Type Metadata
 *
 * Creates KnowledgeTriangleEdgeType config nodes in Memgraph.
 * These store constraint metadata for the three triangle edge types:
 *   GOVERNS         — L0-L2 normative → Process/Entity
 *   OPERATIONALIZES — L3 operational → Process/Entity (← implements normative)
 *   REVEALS_GAP_IN  — L4 empirical → Gap node (← identifies compliance gap)
 *
 * Note: Edge types are Memgraph relationship labels, not separate nodes.
 * These config nodes store constraint/semantic metadata only.
 *
 * Run: node api/scripts/seed-knowledge-triangle-edges.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

let _mg = null;
function mg() { if (!_mg) _mg = require('../src/services/memgraph.service'); return _mg; }

const EDGE_TYPES = [
  {
    name: 'GOVERNS',
    description: 'Normative document (L0-L2) establishes binding rules for a Process, Entity, or Activity',
    knowledgeTriangleRole: 'NORMATIVE_LINK',
    sourceLayerConstraint: JSON.stringify(['L0', 'L1', 'L2']),
    targetNodeTypes: JSON.stringify(['KnowledgeNode', 'Process', 'Entity', 'Activity']),
    properties: JSON.stringify({
      effectiveFrom: 'date',
      effectiveTo: 'date|null',
      mandatoryLevel: 'MUST|SHOULD|MAY'
    }),
    inverseEdge: 'GOVERNED_BY',
    createsGapNode: false
  },
  {
    name: 'OPERATIONALIZES',
    description: 'Operational document (L3) implements a normative requirement from L0-L2',
    knowledgeTriangleRole: 'IMPLEMENTATION_LINK',
    sourceLayerConstraint: JSON.stringify(['L3']),
    targetNodeTypes: JSON.stringify(['KnowledgeNode', 'Process', 'Entity', 'Activity']),
    properties: JSON.stringify({
      implementationStatus: 'FULL|PARTIAL|PLANNED',
      deviations: 'string|null',
      linkedNormative: 'reference to GOVERNS source'
    }),
    inverseEdge: 'OPERATIONALIZED_BY',
    createsGapNode: false
  },
  {
    name: 'REVEALS_GAP_IN',
    description: 'Empirical finding (L4) identifies a compliance gap in a normative requirement or process',
    knowledgeTriangleRole: 'GAP_LINK',
    sourceLayerConstraint: JSON.stringify(['L4']),
    targetNodeTypes: JSON.stringify(['KnowledgeNode', 'Gap', 'Process', 'Entity']),
    properties: JSON.stringify({
      gapType: 'COMPLIANCE|IMPLEMENTATION|DOCUMENTATION|RESOURCE',
      severity: 'HIGH|MEDIUM|LOW',
      recommendation: 'string',
      auditReference: 'string'
    }),
    inverseEdge: 'HAS_GAP_REVEALED_BY',
    createsGapNode: true
  }
];

async function seedEdgeTypes() {
  console.log('Seeding Knowledge Triangle edge type metadata...\n');
  let created = 0;

  for (const et of EDGE_TYPES) {
    try {
      const existing = await mg().runQuery(
        'MATCH (e:KnowledgeTriangleEdgeType {name: $name}) RETURN e',
        { name: et.name }
      );
      if (existing.length > 0) {
        console.log('  SKIP (exists):', et.name);
        continue;
      }
      await mg().runQuery(
        `CREATE (e:KnowledgeTriangleEdgeType $props) RETURN e.name`,
        { props: et }
      );
      console.log('  OK:', et.name, '—', et.description.slice(0, 70));
      created++;
    } catch (e) {
      console.error('  ERR', et.name, ':', e.message);
    }
  }

  console.log(`\nEdge types: created ${created} / ${EDGE_TYPES.length}`);
}

async function seedGapNodeSchema() {
  console.log('\nSeeding Gap node schema example...');

  try {
    const existing = await mg().runQuery(
      'MATCH (s:NodeSchema {nodeType: $t}) RETURN s',
      { t: 'Gap' }
    );
    if (existing.length > 0) {
      console.log('  SKIP: Gap NodeSchema already exists');
      return;
    }

    await mg().runQuery(
      `CREATE (s:NodeSchema {
        nodeType: 'Gap',
        namespace: 'KM',
        description: 'Compliance or implementation gap identified by empirical evidence (L4)',
        properties: $props,
        lifecycle: $lifecycle,
        relationships: $rels,
        createdAt: $now
      }) RETURN s.nodeType`,
      {
        props: JSON.stringify({
          id: 'uuid',
          gapType: 'COMPLIANCE|IMPLEMENTATION|DOCUMENTATION|RESOURCE',
          severity: 'HIGH|MEDIUM|LOW',
          status: 'OPEN|ACKNOWLEDGED|ADDRESSED|CLOSED',
          title: 'string',
          description: 'string',
          identifiedBy: 'L4 document id',
          identifiedAt: 'ISO date',
          affectedProcess: 'Process/KnowledgeNode id',
          affectedNormative: 'L0-L2 KnowledgeNode id',
          recommendation: 'string',
          resolution: 'string|null',
          resolvedAt: 'ISO date|null',
          createdAt: 'ISO date',
          updatedAt: 'ISO date'
        }),
        lifecycle: JSON.stringify(['OPEN', 'ACKNOWLEDGED', 'ADDRESSED', 'CLOSED']),
        rels: JSON.stringify([
          '(L4:KnowledgeNode)-[:REVEALS_GAP_IN]->(gap:Gap)',
          '(gap:Gap)-[:AFFECTS]->(process:KnowledgeNode)',
          '(gap:Gap)-[:CONCERNS_COMPLIANCE_WITH]->(normative:KnowledgeNode)',
          '(gap:Gap)-[:RESOLVED_BY]->(action:KnowledgeNode)'
        ]),
        now: new Date().toISOString()
      }
    );
    console.log('  OK: Gap NodeSchema created');
  } catch (e) {
    console.error('  ERR Gap schema:', e.message);
  }
}

async function seed() {
  await seedEdgeTypes();
  await seedGapNodeSchema();
  console.log('\nDone.');
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
