'use strict';
/**
 * Seed UN Document Types + Classification Rules
 *
 * Creates DocumentType nodes (with epistemic layer + normative weight)
 * and ClassifierRule nodes in Memgraph for the UN document taxonomy.
 *
 * Epistemic layers:
 *   L0 Constitutional — GA Resolutions, UN Charter   (normativeWeight 0.95-1.0)
 *   L1 Regulatory     — ST/SGB Secretary-General's Bulletins (0.85)
 *   L2 Administrative — ST/AI, ST/IC                 (0.55-0.70)
 *   L3 Operational    — Manuals, SOPs                (0.40)
 *   L4 Empirical      — OIOS, JIU, BoA audit reports (0.00)
 *   L5 Strategic      — SG Reports, ICT Strategy     (0.25)
 *
 * Run: node api/scripts/seed-un-document-types.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() { if (!_mg) _mg = require('../src/services/memgraph.service'); return _mg; }

// ─── UN Document Type Definitions ────────────────────────────────────────────

const UN_DOC_TYPES = [
  // ── L0 Constitutional ──────────────────────────────────────────────────────
  {
    id: 'UN_CHARTER',
    name: 'UN Charter',
    description: 'Charter of the United Nations — foundational constitutional document',
    epistemicLayer: 'L0',
    normativeWeight: 1.0,
    classifierRules: {
      threshold: 0.65,
      rules: [
        { signal: 'keyword_match', keywords: ['charter of the united nations', 'we the peoples', 'united nations conference', 'san francisco'], weight: 0.50 },
        { signal: 'title_match', keywords: ['charter', 'united nations charter', 'un charter'], weight: 0.30 },
        { signal: 'section_match', sections: ['PREAMBLE', 'CHAPTER I', 'CHAPTER II', 'ARTICLE 1', 'ARTICLE 2'], weight: 0.20 }
      ]
    }
  },
  {
    id: 'GA_RES',
    name: 'General Assembly Resolution',
    description: 'General Assembly resolutions — authoritative decisions at constitutional level',
    epistemicLayer: 'L0',
    normativeWeight: 0.95,
    classifierRules: {
      threshold: 0.60,
      rules: [
        { signal: 'header_match', pattern: 'A/RES/\\d+/\\d+', weight: 0.40 },
        { signal: 'keyword_match', keywords: ['general assembly', 'the general assembly', 'resolves', 'decides', 'reaffirms', 'assembly resolution'], weight: 0.35 },
        { signal: 'section_match', sections: ['THE GENERAL ASSEMBLY', 'RECALLING', 'REAFFIRMING', 'DECIDES'], weight: 0.25 }
      ]
    }
  },

  // ── L1 Regulatory ─────────────────────────────────────────────────────────
  {
    id: 'ST_SGB',
    name: "Secretary-General's Bulletin",
    description: 'ST/SGB series — official policy issuances with regulatory force',
    epistemicLayer: 'L1',
    normativeWeight: 0.85,
    classifierRules: {
      threshold: 0.60,
      rules: [
        { signal: 'header_match', pattern: 'ST/SGB/\\d{4}/\\d+', weight: 0.45 },
        { signal: 'keyword_match', keywords: ["secretary-general's bulletin", 'ST/SGB/', 'secretary general bulletin', 'administrative issuance'], weight: 0.35 },
        { signal: 'section_match', sections: ['PURPOSE', 'APPLICABILITY', 'ENTRY INTO FORCE'], weight: 0.20 }
      ]
    }
  },

  // ── L2 Administrative ─────────────────────────────────────────────────────
  {
    id: 'ST_AI',
    name: 'Administrative Instruction',
    description: 'ST/AI series — administrative instructions implementing SGB policy',
    epistemicLayer: 'L2',
    normativeWeight: 0.70,
    classifierRules: {
      threshold: 0.60,
      rules: [
        { signal: 'header_match', pattern: 'ST/AI/\\d{4}/\\d+', weight: 0.45 },
        { signal: 'keyword_match', keywords: ['administrative instruction', 'ST/AI/', 'under-secretary-general for management'], weight: 0.35 },
        { signal: 'section_match', sections: ['PURPOSE', 'APPLICABILITY', 'DEFINITIONS', 'RESPONSIBILITIES'], weight: 0.20 }
      ]
    }
  },
  {
    id: 'ST_IC',
    name: 'Information Circular',
    description: 'ST/IC series — informational circulars without regulatory force',
    epistemicLayer: 'L2',
    normativeWeight: 0.55,
    classifierRules: {
      threshold: 0.60,
      rules: [
        { signal: 'header_match', pattern: 'ST/IC/\\d{4}/\\d+', weight: 0.45 },
        { signal: 'keyword_match', keywords: ['information circular', 'ST/IC/', 'for information', 'note for the record'], weight: 0.35 },
        { signal: 'title_match', keywords: ['information circular', 'circular', 'st/ic'], weight: 0.20 }
      ]
    }
  },

  // ── L3 Operational ────────────────────────────────────────────────────────
  {
    id: 'MANUAL',
    name: 'Operational Manual',
    description: 'Operational manuals — detailed procedural guidance for staff',
    epistemicLayer: 'L3',
    normativeWeight: 0.40,
    classifierRules: {
      threshold: 0.55,
      rules: [
        { signal: 'keyword_match', keywords: ['operational manual', 'user manual', 'operations manual', 'ipsas manual', 'reference manual', 'field manual'], weight: 0.35 },
        { signal: 'title_match', keywords: ['manual', 'guide', 'handbook', 'reference guide'], weight: 0.25 },
        { signal: 'structure_match', pattern: 'numbered_paragraphs', weight: 0.20 },
        { signal: 'section_match', sections: ['PURPOSE', 'SCOPE', 'PROCEDURE', 'DEFINITIONS', 'OVERVIEW'], weight: 0.20 }
      ]
    }
  },
  {
    id: 'SOP',
    name: 'Standard Operating Procedure',
    description: 'SOPs — step-by-step operational procedures',
    epistemicLayer: 'L3',
    normativeWeight: 0.40,
    classifierRules: {
      threshold: 0.55,
      rules: [
        { signal: 'keyword_match', keywords: ['standard operating procedure', 'step-by-step', 'process flow', 'workflow procedure'], weight: 0.35 },
        { signal: 'title_match', keywords: ['sop', 'standard operating procedure', 'procedure', 'process guide'], weight: 0.30 },
        { signal: 'structure_match', pattern: 'numbered_paragraphs', weight: 0.20 },
        { signal: 'section_match', sections: ['OBJECTIVE', 'SCOPE', 'PROCEDURE', 'STEPS', 'RESPONSIBILITIES'], weight: 0.15 }
      ]
    }
  },

  // ── L4 Empirical ──────────────────────────────────────────────────────────
  {
    id: 'OIOS_REP',
    name: 'OIOS Audit Report',
    description: 'Office of Internal Oversight Services reports — empirical audit findings',
    epistemicLayer: 'L4',
    normativeWeight: 0.0,
    classifierRules: {
      threshold: 0.55,
      rules: [
        { signal: 'keyword_match', keywords: ['office of internal oversight services', 'oios', 'internal audit', 'audit assignment', 'oversight'], weight: 0.40 },
        { signal: 'header_match', pattern: '\\bOIOS\\b|Internal Audit Division|Office of Internal Oversight', weight: 0.30 },
        { signal: 'section_match', sections: ['AUDIT OBSERVATIONS', 'FINDINGS', 'RECOMMENDATIONS', 'MANAGEMENT RESPONSE', 'OVERALL ASSESSMENT'], weight: 0.30 }
      ]
    }
  },
  {
    id: 'JIU_REP',
    name: 'JIU Report',
    description: 'Joint Inspection Unit reports — independent system-wide evaluation',
    epistemicLayer: 'L4',
    normativeWeight: 0.0,
    classifierRules: {
      threshold: 0.55,
      rules: [
        { signal: 'header_match', pattern: 'JIU/REP/\\d{4}/\\d+|JIU\\.REP', weight: 0.45 },
        { signal: 'keyword_match', keywords: ['joint inspection unit', 'JIU/REP/', 'inspector', 'inspectors', 'system-wide evaluation', 'jiu report'], weight: 0.35 },
        { signal: 'section_match', sections: ['RECOMMENDATIONS', 'MAIN FINDINGS', 'CONCLUSIONS', 'BACKGROUND'], weight: 0.20 }
      ]
    }
  },
  {
    id: 'BOA_REP',
    name: 'Board of Auditors Report',
    description: 'Board of Auditors reports — external audit of UN financial statements',
    epistemicLayer: 'L4',
    normativeWeight: 0.0,
    classifierRules: {
      threshold: 0.55,
      rules: [
        { signal: 'keyword_match', keywords: ['board of auditors', 'external auditor', 'financial statements', 'audit opinion', 'board of audit'], weight: 0.40 },
        { signal: 'header_match', pattern: '\\bA/\\d+/5\\b|Board of Auditors', weight: 0.30 },
        { signal: 'section_match', sections: ['AUDIT OPINION', 'FINANCIAL STATEMENTS', 'NOTES TO THE FINANCIAL STATEMENTS', 'SUMMARY OF FINDINGS'], weight: 0.30 }
      ]
    }
  },

  // ── L5 Strategic ──────────────────────────────────────────────────────────
  {
    id: 'SG_REP',
    name: 'Secretary-General Report',
    description: 'Secretary-General reports to GA/SC — strategic analysis and policy proposals',
    epistemicLayer: 'L5',
    normativeWeight: 0.25,
    classifierRules: {
      threshold: 0.55,
      rules: [
        { signal: 'keyword_match', keywords: ['report of the secretary-general', 'secretary-general', 'submitted to the general assembly', 'submitted to the security council'], weight: 0.40 },
        { signal: 'header_match', pattern: 'Report of the Secretary-General|A/\\d+/\\d+', weight: 0.35 },
        { signal: 'section_match', sections: ['INTRODUCTION', 'BACKGROUND', 'RECOMMENDATIONS', 'CONCLUSIONS', 'SUMMARY'], weight: 0.25 }
      ]
    }
  },
  {
    id: 'ICT_STRAT',
    name: 'ICT Strategy Document',
    description: 'Digital and ICT strategy documents — technology roadmaps and transformation plans',
    epistemicLayer: 'L5',
    normativeWeight: 0.25,
    classifierRules: {
      threshold: 0.55,
      rules: [
        { signal: 'keyword_match', keywords: ['ict strategy', 'digital strategy', 'technology strategy', 'digital transformation', 'information technology strategy', 'technology roadmap'], weight: 0.40 },
        { signal: 'title_match', keywords: ['strategy', 'digital', 'ict', 'technology', 'roadmap'], weight: 0.30 },
        { signal: 'section_match', sections: ['VISION', 'STRATEGIC OBJECTIVES', 'DIGITAL AMBITION', 'ROADMAP', 'KEY INITIATIVES'], weight: 0.30 }
      ]
    }
  }
];

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('Seeding UN Document Types + Classification Rules...\n');

  // Ensure DocumentTypeRegistry exists
  const regId = 'UN_DOCUMENT_REGISTRY';
  await mg().runQuery(
    `MERGE (r:DocumentTypeRegistry {id: $id})
     ON CREATE SET r.name = 'UN Document Registry', r.createdAt = $now
     RETURN r`,
    { id: regId, now: new Date().toISOString() }
  );
  console.log('  Registry: DocumentTypeRegistry ready');

  let created = 0;
  let skipped = 0;

  for (const docType of UN_DOC_TYPES) {
    const now = new Date().toISOString();

    try {
      // Check if DocumentType already exists
      const existing = await mg().runQuery(
        'MATCH (dt:DocumentType {id: $id}) RETURN dt',
        { id: docType.id }
      );

      if (existing.length > 0) {
        console.log(`  SKIP: ${docType.id} (already exists)`);
        skipped++;
        continue;
      }

      // Create DocumentType node
      const dtId = uuidv4();
      await mg().runQuery(
        `CREATE (dt:DocumentType {
           id: $id, uuid: $uuid,
           name: $name, description: $description,
           epistemicLayer: $layer, normativeWeight: $weight,
           createdAt: $now
         })
         WITH dt
         MATCH (r:DocumentTypeRegistry {id: $regId})
         CREATE (r)-[:HAS_TYPE]->(dt)
         RETURN dt`,
        {
          id: docType.id, uuid: dtId,
          name: docType.name, description: docType.description,
          layer: docType.epistemicLayer, weight: docType.normativeWeight,
          now, regId
        }
      );

      // Create ClassifierRule node linked to DocumentType
      const crId = uuidv4();
      await mg().runQuery(
        `MATCH (dt:DocumentType {id: $dtId})
         CREATE (cr:ClassifierRule {
           id: $crId, is_active: true,
           rules: $rules, threshold: $threshold,
           createdAt: $now
         })
         CREATE (dt)-[:HAS_CLASSIFIER]->(cr)
         RETURN cr`,
        {
          dtId: docType.id, crId,
          rules: JSON.stringify(docType.classifierRules.rules),
          threshold: docType.classifierRules.threshold,
          now
        }
      );

      console.log(`  OK: ${docType.id} [${docType.epistemicLayer}] — ${docType.name}`);
      created++;

    } catch (e) {
      console.error(`  ERR: ${docType.id} — ${e.message}`);
    }
  }

  console.log(`\nDone. Created: ${created} / ${UN_DOC_TYPES.length}, Skipped: ${skipped}`);
  console.log('\nUN Document Types by Layer:');
  const byLayer = {};
  for (const dt of UN_DOC_TYPES) {
    byLayer[dt.epistemicLayer] = (byLayer[dt.epistemicLayer] || []);
    byLayer[dt.epistemicLayer].push(dt.id);
  }
  for (const [layer, types] of Object.entries(byLayer).sort()) {
    console.log(`  ${layer}: ${types.join(', ')}`);
  }
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
