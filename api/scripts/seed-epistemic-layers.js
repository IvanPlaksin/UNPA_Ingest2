'use strict';
/**
 * Seed Epistemic Layer Model (L0–L5)
 *
 * Creates 6 EpistemicLayer nodes as first-class entities, then:
 *   - Links each DocumentType to its layer via [:BELONGS_TO_LAYER]
 *
 * Knowledge Triangle roles:
 *   L0-L2  → NORMATIVE_SOURCE  (produce GOVERNS edges)
 *   L3     → OPERATIONAL_BRIDGE (produce OPERATIONALIZES edges)
 *   L4     → EMPIRICAL_EVIDENCE (produce REVEALS_GAP_IN edges)
 *   L5     → STRATEGIC_GUIDANCE (produce INFORMS edges)
 *
 * Run: node api/scripts/seed-epistemic-layers.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() { if (!_mg) _mg = require('../src/services/memgraph.service'); return _mg; }

const LAYERS = [
  {
    id: 'L0',
    name: 'Constitutional',
    description: 'Foundational documents establishing UN mandate, authority, and member state obligations. No higher normative source exists within the UN system.',
    normativeWeightRange: [0.95, 1.0],
    knowledgeTriangleRole: 'NORMATIVE_SOURCE',
    edgeTypesProduced: ['GOVERNS', 'ESTABLISHES', 'MANDATES'],
    edgeTypesConsumed: [],
    precedenceOrder: 0
  },
  {
    id: 'L1',
    name: 'Regulatory',
    description: "Secretary-General's Bulletins (ST/SGB) — official policy with regulatory force across the Secretariat. Derives authority from L0.",
    normativeWeightRange: [0.80, 0.90],
    knowledgeTriangleRole: 'NORMATIVE_SOURCE',
    edgeTypesProduced: ['GOVERNS', 'MANDATES'],
    edgeTypesConsumed: ['GOVERNS'],
    precedenceOrder: 1
  },
  {
    id: 'L2',
    name: 'Administrative',
    description: 'Administrative Instructions (ST/AI) and Information Circulars (ST/IC) — implementation-level policy. Interprets and operationalizes L1.',
    normativeWeightRange: [0.50, 0.75],
    knowledgeTriangleRole: 'NORMATIVE_SOURCE',
    edgeTypesProduced: ['GOVERNS', 'IMPLEMENTS'],
    edgeTypesConsumed: ['GOVERNS'],
    precedenceOrder: 2
  },
  {
    id: 'L3',
    name: 'Operational',
    description: 'Manuals, SOPs, and operational guides — describe how L1/L2 policy is carried out in practice. Bridge between policy and empirical reality.',
    normativeWeightRange: [0.35, 0.45],
    knowledgeTriangleRole: 'OPERATIONAL_BRIDGE',
    edgeTypesProduced: ['OPERATIONALIZES', 'DESCRIBES_PROCESS'],
    edgeTypesConsumed: ['GOVERNS'],
    precedenceOrder: 3
  },
  {
    id: 'L4',
    name: 'Empirical',
    description: 'Audit reports (OIOS, JIU, BoA) — empirical observations of what actually happens. Zero normative weight: they RECORD reality, do not prescribe it. Primary source of REVEALS_GAP_IN edges.',
    normativeWeightRange: [0.0, 0.0],
    knowledgeTriangleRole: 'EMPIRICAL_EVIDENCE',
    edgeTypesProduced: ['REVEALS_GAP_IN', 'CONTRADICTS', 'CONFIRMS'],
    edgeTypesConsumed: [],
    precedenceOrder: 4
  },
  {
    id: 'L5',
    name: 'Strategic',
    description: "Secretary-General reports to GA/SC and ICT strategies — analysis and proposals that inform but do not mandate. Lower normative weight than L1-L2 policy.",
    normativeWeightRange: [0.20, 0.30],
    knowledgeTriangleRole: 'STRATEGIC_GUIDANCE',
    edgeTypesProduced: ['INFORMS', 'PROPOSES'],
    edgeTypesConsumed: ['GOVERNS'],
    precedenceOrder: 5
  }
];

async function seed() {
  console.log('Seeding Epistemic Layer Model (L0–L5)...\n');
  const now = new Date().toISOString();
  let created = 0;

  // Step 1: Create EpistemicLayer nodes
  console.log('Step 1: EpistemicLayer nodes');
  for (const layer of LAYERS) {
    const existing = await mg().runQuery('MATCH (l:EpistemicLayer {id: $id}) RETURN l', { id: layer.id });
    if (existing.length > 0) {
      console.log(`  SKIP: ${layer.id} (exists)`);
      continue;
    }
    await mg().runQuery(
      `CREATE (l:EpistemicLayer {
         id: $id, uuid: $uuid, name: $name, description: $description,
         normativeWeightMin: $wMin, normativeWeightMax: $wMax,
         knowledgeTriangleRole: $role,
         edgeTypesProduced: $produced,
         edgeTypesConsumed: $consumed,
         precedenceOrder: $order,
         createdAt: $now
       }) RETURN l`,
      {
        id: layer.id, uuid: uuidv4(), name: layer.name, description: layer.description,
        wMin: layer.normativeWeightRange[0], wMax: layer.normativeWeightRange[1],
        role: layer.knowledgeTriangleRole,
        produced: JSON.stringify(layer.edgeTypesProduced),
        consumed: JSON.stringify(layer.edgeTypesConsumed),
        order: layer.precedenceOrder, now
      }
    );
    console.log(`  OK: ${layer.id} — ${layer.name} [${layer.knowledgeTriangleRole}]`);
    created++;
  }

  // Step 2: Link DocumentTypes to EpistemicLayers via BELONGS_TO_LAYER
  console.log('\nStep 2: DocumentType → EpistemicLayer relationships');
  const docTypes = await mg().runQuery(
    'MATCH (dt:DocumentType) WHERE dt.epistemicLayer IS NOT NULL RETURN dt.id as id, dt.epistemicLayer as layer',
    {}
  );
  let linked = 0;
  for (const dt of docTypes) {
    const existing = await mg().runQuery(
      'MATCH (dt:DocumentType {id: $dtId})-[:BELONGS_TO_LAYER]->(:EpistemicLayer) RETURN 1 LIMIT 1',
      { dtId: dt.id }
    );
    if (existing.length > 0) {
      console.log(`  SKIP: ${dt.id} → ${dt.layer} (already linked)`);
      continue;
    }
    await mg().runQuery(
      `MATCH (dt:DocumentType {id: $dtId})
       MATCH (l:EpistemicLayer {id: $layerId})
       CREATE (dt)-[:BELONGS_TO_LAYER {createdAt: $now}]->(l)
       RETURN dt.id`,
      { dtId: dt.id, layerId: dt.layer, now }
    );
    console.log(`  OK: ${dt.id} → ${dt.layer}`);
    linked++;
  }

  console.log(`\nDone.`);
  console.log(`  EpistemicLayer nodes created: ${created} / ${LAYERS.length}`);
  console.log(`  DocumentType links created: ${linked} / ${docTypes.length}`);
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
