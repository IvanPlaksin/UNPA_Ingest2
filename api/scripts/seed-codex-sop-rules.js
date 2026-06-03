'use strict';
/**
 * Seed Codex Rules — UN SOP Document Schema
 *
 * SOP-001: UN SOP Documents Must Be Extracted Into UN_REGULATORY_DOCUMENT Structure
 *
 * Run: node api/scripts/seed-codex-sop-rules.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() { if (!_mg) _mg = require('../src/services/memgraph.service'); return _mg; }

const RULES = [
  {
    codexId: 'CODEX-RULE-SOP-001',
    title: 'UN SOP Documents Must Be Extracted Into UN_REGULATORY_DOCUMENT Structure',
    summary: 'All UN regulatory documents (ST/SGB, ST/AI, agency-specific policies, directives, standards) MUST be extracted and stored using the UN_REGULATORY_DOCUMENT structural schema with mandatory fields: documentSymbol, issuingBody, documentType, effectiveDate. Sections are extracted as linked UN_DOCUMENT_SECTION nodes. Role assignments are extracted as UN_ROLE_ASSIGNMENT nodes. Cross-document references are captured as UN_CROSS_REFERENCE nodes. Use the schemas in api/src/schemas/un-sop-document.schema.js for field definitions and allowed enum values.',
    modality: 'MUST',
    scope: ['km', 'extraction', 'ingestion', 'agents', 'bootstrap', 'un-sop'],
    derivesFrom: 'CODEX-PRINCIPLE-001',
    rationale: 'Consistent structural extraction is the prerequisite for Knowledge Triangle analysis (KM-010–KM-020). Without a normalised UN_REGULATORY_DOCUMENT node, the document cannot be assigned an epistemicLayer, normativeWeight, or KQS score. Structural uniformity also enables cross-agency document comparison and gap detection across UN entities (SECRETARIAT vs UNHCR vs ILO). Using schema-defined enums prevents free-text issuingBody values that break Cypher queries.',
    examples: [
      'CORRECT: ST/SGB/2007/6 → UN_REGULATORY_DOCUMENT {documentSymbol:"ST/SGB/2007/6", issuingBody:"SECRETARIAT", documentType:"SGB_BULLETIN", effectiveDate:"2007-09-17"} → sections as UN_DOCUMENT_SECTION nodes',
      'CORRECT: UNHCR/AI/2024/003 → UN_REGULATORY_DOCUMENT {issuingBody:"UNHCR", documentType:"ADMINISTRATIVE_INSTRUCTION"} → obligations extracted from each section',
      'CORRECT: ILO IGDS 333 → UN_REGULATORY_DOCUMENT {issuingBody:"ILO", documentType:"STANDARD"} → UN_ROLE_ASSIGNMENT for CIO/CISO responsibilities',
      'WRONG: extracting an ST/SGB bulletin as a generic KnowledgeNode without documentSymbol — loses all cross-reference capabilities',
      'WRONG: using issuingBody:"Secretariat" (lowercase/variant) instead of enum value "SECRETARIAT" — breaks Cypher MATCH queries',
      'WRONG: omitting effectiveDate — required for temporal currency calculation in KQS scoring'
    ],
    antiPatterns: [
      'Storing the full document as a single KnowledgeNode blob without section decomposition — prevents obligation-level gap analysis',
      'Using free-text documentType instead of UN_DOCUMENT_TYPE enum values',
      'Skipping UN_CROSS_REFERENCE extraction for replacesDocument — breaks supersession chain queries',
      'Creating UN_ROLE_ASSIGNMENT nodes without linking them to their source UN_DOCUMENT_SECTION via DEFINED_IN edge',
      'Extracting obligations without recording their deontModal (SHALL/MUST/IS_RESPONSIBLE_FOR) — prevents obligation-strength ranking'
    ]
  }
];

async function seed() {
  console.log('Seeding UN SOP Document Schema Codex rules...\n');
  let created = 0;

  for (const rule of RULES) {
    const id = uuidv4();
    const now = new Date().toISOString();
    try {
      const existing = await mg().runQuery(
        'MATCH (r:CodexRule {codexId: $c}) RETURN r', { c: rule.codexId }
      );
      if (existing.length > 0) {
        console.log('  SKIP (exists):', rule.codexId);
        continue;
      }

      await mg().runQuery(
        `CREATE (r:CodexRule $props)
         WITH r
         MATCH (p:CodexPrinciple {codexId: $d})
         CREATE (r)-[:DERIVES_FROM]->(p)
         RETURN r.codexId`,
        {
          props: {
            id, codexId: rule.codexId,
            namespace: 'Codex', nodeType: 'CodexRule',
            title: rule.title, summary: rule.summary,
            modality: rule.modality,
            scope: JSON.stringify(rule.scope),
            tier: 'M2', status: 'ACTIVE',
            rationale: rule.rationale,
            examples: JSON.stringify(rule.examples),
            antiPatterns: JSON.stringify(rule.antiPatterns),
            createdAt: now, updatedAt: now
          },
          d: rule.derivesFrom
        }
      );
      console.log('  OK:', rule.codexId, '—', rule.title.slice(0, 65));
      created++;
    } catch (e) {
      console.error('  ERR', rule.codexId, ':', e.message);
    }
  }

  console.log(`\nDone. Created: ${created} / ${RULES.length}`);
  await mg().close?.();
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
