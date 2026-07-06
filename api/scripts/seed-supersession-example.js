'use strict';
/**
 * seed-supersession-example.js
 *
 * Seeds three generations of an ST/AI document chain with SUPERSEDES links.
 * Demonstrates the full supersession chain API.
 *
 * Usage:
 *   node api/scripts/seed-supersession-example.js
 */

const mg = require('../src/services/memgraph.service');
const { supersessionService } = require('../src/services/knowledge/supersession.service');
const { v4: uuidv4 } = require('uuid');

const now = () => new Date().toISOString();
const NAMESPACE = 'UN_POLICY';

const DOCUMENTS = [
  {
    name: 'ST/AI/2013/4',
    description: 'Information sensitivity, classification and handling',
    documentSymbol: 'ST/AI/2013/4',
    documentCategory: 'Administrative Instruction',
    effectiveDate: '2013-11-01',
    expirationDate: '2017-02-01',
    issuingAuthority: 'Secretary-General',
    isInForce: false,
  },
  {
    name: 'ST/AI/2017/1',
    description: 'Information and communications technology (ICT) security',
    documentSymbol: 'ST/AI/2017/1',
    documentCategory: 'Administrative Instruction',
    effectiveDate: '2017-02-01',
    expirationDate: '2023-10-01',
    issuingAuthority: 'Secretary-General',
    isInForce: false,
  },
  {
    name: 'ST/AI/2023/4',
    description: 'Information security',
    documentSymbol: 'ST/AI/2023/4',
    documentCategory: 'Administrative Instruction',
    effectiveDate: '2023-10-01',
    expirationDate: null,
    issuingAuthority: 'Secretary-General',
    isInForce: true,
  },
];

const SUPERSESSIONS = [
  { newerSymbol: 'ST/AI/2017/1', olderSymbol: 'ST/AI/2013/4', reason: 'Full replacement — expanded scope to ICT security' },
  { newerSymbol: 'ST/AI/2023/4', olderSymbol: 'ST/AI/2017/1', reason: 'Full replacement — modernised information security framework' },
];

async function main() {
  console.log('[Seed] Supersession example — ST/AI information security chain');
  const ts = now();

  // 1. Create or update ESEntity nodes
  const entityIds = {};
  for (const doc of DOCUMENTS) {
    const existing = await mg.runQuery(
      `MATCH (e:ESEntity {name: $name, type: 'DOCUMENT', namespace: $ns}) RETURN e.id AS id LIMIT 1`,
      { name: doc.name, ns: NAMESPACE }
    );

    let esId;
    if (existing.length) {
      esId = existing[0].id;
      console.log(`  [exists] ${doc.name} → ${esId}`);
    } else {
      esId = uuidv4();
      await mg.runQuery(
        `CREATE (e:ESEntity {
           id: $id, name: $name, type: 'DOCUMENT', namespace: $ns,
           description: $desc, epistemicLayer: 'L1',
           documentSymbol: $symbol, documentCategory: $cat,
           effectiveDate: $effectiveDate, expirationDate: $expirationDate,
           issuingAuthority: $authority, isInForce: $isInForce,
           createdAt: $ts
         })`,
        {
          id: esId, name: doc.name, ns: NAMESPACE, desc: doc.description,
          symbol: doc.documentSymbol, cat: doc.documentCategory,
          effectiveDate: doc.effectiveDate, expirationDate: doc.expirationDate || null,
          authority: doc.issuingAuthority, isInForce: doc.isInForce, ts,
        }
      );
      console.log(`  [created] ${doc.name} → ${esId}`);
    }

    // Always update document-specific attributes
    await supersessionService.updateDocumentAttributes(esId, {
      documentSymbol:   doc.documentSymbol,
      effectiveDate:    doc.effectiveDate,
      expirationDate:   doc.expirationDate || null,
      issuingAuthority: doc.issuingAuthority,
      documentCategory: doc.documentCategory,
      isInForce:        doc.isInForce,
    });

    entityIds[doc.documentSymbol] = esId;
  }

  // 2. Create SUPERSEDES relationships
  for (const s of SUPERSESSIONS) {
    const newerId = entityIds[s.newerSymbol];
    const olderId = entityIds[s.olderSymbol];
    if (!newerId || !olderId) {
      console.warn(`  [skip] ${s.newerSymbol} → ${s.olderSymbol}: missing entity IDs`);
      continue;
    }
    await supersessionService.createSupersession(newerId, olderId, { reason: s.reason });
    console.log(`  [supersedes] ${s.newerSymbol} → ${s.olderSymbol}`);
  }

  // 3. Verify — print chain for the middle document
  const midId = entityIds['ST/AI/2017/1'];
  if (midId) {
    const chain = await supersessionService.getSupersessionChain(midId);
    console.log('\n[Verify] ST/AI/2017/1 supersession chain:');
    console.log(`  supersedes:    ${chain.supersedes.map(d => d.name).join(', ') || '(none)'}`);
    console.log(`  supersededBy:  ${chain.supersededBy.map(d => d.name).join(', ') || '(none)'}`);
    console.log(`  isInForce:     ${chain.isInForce}`);
  }

  console.log('\n[Seed] Done.');
  process.exit(0);
}

main().catch(err => {
  console.error('[Seed] Fatal:', err.message);
  process.exit(1);
});
