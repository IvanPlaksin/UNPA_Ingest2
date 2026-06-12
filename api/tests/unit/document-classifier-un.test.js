#!/usr/bin/env node
/**
 * Unit Tests: DocumentClassifier — UN Document Types
 *
 * Tests classification of UN documents against seeded rules.
 * Requires Memgraph to be running with seeded UN document types.
 *
 * Run: node api/tests/unit/document-classifier-un.test.js
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// ─── Test runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name, fn) {
  process.stdout.write(`  ▶ ${name} ... `);
  try {
    await fn();
    console.log('✅ PASS');
    passed++;
  } catch (err) {
    console.log(`❌ FAIL\n     ${err.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

// ─── Load classifier ─────────────────────────────────────────────────────────

const classifier = require('../../src/services/knowledge/document-classifier');

// ─── Document samples ────────────────────────────────────────────────────────

const SAMPLES = {
  ST_SGB: {
    text: `ST/SGB/2018/1\nSecretary-General's Bulletin\nPURPOSE\nThe present bulletin sets out the policy on...\nAPPLICABILITY\nThis bulletin applies to all staff members.\nENTRY INTO FORCE\nThis bulletin shall enter into force on 1 January 2019.`,
    metadata: { document_title: "Secretary-General's Bulletin on Leave" }
  },
  ST_AI: {
    text: `ST/AI/2020/5\nAdministrative Instruction\nPURPOSE\nThe present instruction establishes...\nAPPLICABILITY\nThis instruction applies to all secretariat staff.\nDEFINITIONS\nFor the purposes of this instruction...`,
    metadata: { document_title: 'Administrative Instruction on Travel' }
  },
  GA_RES: {
    text: `A/RES/77/252\nGeneral Assembly Resolution\nTHE GENERAL ASSEMBLY\nRECALLING its previous resolutions,\nREAFFIRMING the purposes and principles of the UN Charter,\nDECIDES to authorize the Secretary-General to proceed with the implementation of the budget for 2023.\nThe General Assembly resolves to...`,
    metadata: { document_title: 'General Assembly Resolution 77/252' }
  },
  OIOS_REP: {
    text: `Office of Internal Oversight Services\nInternal Audit Division\nAUDIT OF PROCUREMENT PRACTICES\n\nOIOS Audit Report\n\nAUDIT OBSERVATIONS\nThe OIOS conducted an audit of...\nFINDINGS\nThe internal audit identified the following issues:\nRECOMMENDATIONS\nOIOS recommends that...\nMANAGEMENT RESPONSE\nManagement accepts the recommendation and will...`,
    metadata: { document_title: 'OIOS Internal Audit Report: Procurement' }
  },
  JIU_REP: {
    text: `JIU/REP/2023/4\nJoint Inspection Unit\nReport on Human Resources Management\nINSPECTORS: John Smith, Jane Doe\n\nMAIN FINDINGS\nThe Joint Inspection Unit conducted a system-wide evaluation of...\nCONCLUSIONS\nRECOMMENDATIONS\nThe inspectors recommend that...`,
    metadata: { document_title: 'JIU Report on HR Management' }
  },
  SOP: {
    text: `Standard Operating Procedure\nSOP: Travel Request Processing\nOBJECTIVE: To ensure consistent processing of travel requests.\nSCOPE: This procedure applies to all Secretariat staff.\nPROCEDURE:\n1. Staff member submits travel request\n2. Supervisor reviews and approves\n3. Travel unit processes request\n4. Ticket is issued\nRESPONSIBILITIES: Administrative Officer`,
    metadata: { document_title: 'SOP: Travel Request Processing' }
  },
  MANUAL: {
    text: `Operations Manual\nHuman Resources Management Reference Guide\nOVERVIEW\nThis operational manual provides detailed guidance...\nSCOPE\nThis user manual covers all aspects of...\n1. Introduction\n1.1 Purpose\n1.2 Scope\n2. Core Procedures\n2.1 Recruitment\n2.2 Performance Management\n3. Reference Tables`,
    metadata: { document_title: 'HR Operations Manual' }
  },
  SG_REP: {
    text: `Report of the Secretary-General\nSubmitted to the General Assembly\nA/78/456\n\nSUMMARY\nThe Secretary-General submits this report to the General Assembly...\nINTRODUCTION\nBACKGROUND\nCONCLUSIONS\nRECOMMENDATIONS\nThe Secretary-General recommends that the General Assembly...`,
    metadata: { document_title: 'Report of the Secretary-General on Peacekeeping' }
  },
  ICT_STRAT: {
    text: `ICT Strategy 2022-2025\nDigital Transformation Strategy\nVISION: A digitally empowered United Nations\nSTRATEGIC OBJECTIVES\n1. Modernize core enterprise systems\n2. Enable data-driven decision making\n3. Strengthen cybersecurity\nROADMAP\nKEY INITIATIVES\nDigital transformation is central to this technology strategy...`,
    metadata: { document_title: 'UN ICT Digital Strategy 2022-2025' }
  },
  UNKNOWN: {
    text: `Meeting notes from the Tuesday informal consultation. Attendees: Ambassador X, Representative Y. Discussed budget amendments for next quarter. No formal decisions were taken.`,
    metadata: { document_title: 'Meeting Notes - Informal Consultation' }
  }
};

// ─── Tests ───────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n🔬 DocumentClassifier UN Document Types Tests\n');

  // Suite 1: Rules are loaded
  console.log('Suite 1: Rules seeded and loaded');

  await test('loadClassifierRules returns 12 UN document types', async () => {
    const rules = await classifier.loadClassifierRules();
    assert(rules.length >= 12, `Expected >= 12 rules, got ${rules.length}`);
    const ids = rules.map(r => r.document_type_id);
    assert(ids.includes('ST_SGB'), 'Expected ST_SGB rule');
    assert(ids.includes('OIOS_REP'), 'Expected OIOS_REP rule');
    assert(ids.includes('GA_RES'), 'Expected GA_RES rule');
  });

  await test('listDocumentTypes includes epistemicLayer and normativeWeight', async () => {
    const types = await classifier.listDocumentTypes();
    assert(types.length >= 12, `Expected >= 12 types, got ${types.length}`);
    const st_sgb = types.find(t => t.id === 'ST_SGB');
    assert(st_sgb, 'ST_SGB not found in listDocumentTypes');
    assert(st_sgb.epistemicLayer === 'L1', `Expected L1, got ${st_sgb.epistemicLayer}`);
    assert(st_sgb.normativeWeight === 0.85, `Expected 0.85, got ${st_sgb.normativeWeight}`);
  });

  await test('listDocumentTypesByLayer(L4) returns only empirical types', async () => {
    const l4 = await classifier.listDocumentTypesByLayer('L4');
    assert(l4.length >= 3, `Expected >= 3 L4 types, got ${l4.length}`);
    const ids = l4.map(t => t.id);
    assert(ids.includes('OIOS_REP'), 'Expected OIOS_REP');
    assert(ids.includes('JIU_REP'), 'Expected JIU_REP');
    assert(ids.includes('BOA_REP'), 'Expected BOA_REP');
    for (const t of l4) {
      assert(t.normativeWeight === 0, `L4 types should have normativeWeight=0, got ${t.normativeWeight} for ${t.id}`);
    }
  });

  // Suite 2: Classification accuracy
  console.log('\nSuite 2: Classification accuracy');

  await test("ST/SGB document classified as ST_SGB [L1]", async () => {
    const r = await classifier.classify(SAMPLES.ST_SGB.text, SAMPLES.ST_SGB.metadata);
    assert(r.document_type_id === 'ST_SGB', `Expected ST_SGB, got ${r.document_type_id} (confidence ${r.confidence})`);
    assert(r.confidence >= 0.6, `Expected confidence >= 0.6, got ${r.confidence}`);
  });

  await test('ST/AI document classified as ST_AI [L2]', async () => {
    const r = await classifier.classify(SAMPLES.ST_AI.text, SAMPLES.ST_AI.metadata);
    assert(r.document_type_id === 'ST_AI', `Expected ST_AI, got ${r.document_type_id} (confidence ${r.confidence})`);
  });

  await test('General Assembly Resolution classified as GA_RES [L0]', async () => {
    const r = await classifier.classify(SAMPLES.GA_RES.text, SAMPLES.GA_RES.metadata);
    assert(r.document_type_id === 'GA_RES', `Expected GA_RES, got ${r.document_type_id} (confidence ${r.confidence})`);
  });

  await test('OIOS audit report classified as OIOS_REP [L4]', async () => {
    const r = await classifier.classify(SAMPLES.OIOS_REP.text, SAMPLES.OIOS_REP.metadata);
    assert(r.document_type_id === 'OIOS_REP', `Expected OIOS_REP, got ${r.document_type_id} (confidence ${r.confidence})`);
  });

  await test('JIU report classified as JIU_REP [L4]', async () => {
    const r = await classifier.classify(SAMPLES.JIU_REP.text, SAMPLES.JIU_REP.metadata);
    assert(r.document_type_id === 'JIU_REP', `Expected JIU_REP, got ${r.document_type_id} (confidence ${r.confidence})`);
  });

  await test('SOP document classified as SOP [L3]', async () => {
    const r = await classifier.classify(SAMPLES.SOP.text, SAMPLES.SOP.metadata);
    assert(r.document_type_id === 'SOP', `Expected SOP, got ${r.document_type_id} (confidence ${r.confidence})`);
  });

  await test('Operational manual classified as MANUAL [L3]', async () => {
    const r = await classifier.classify(SAMPLES.MANUAL.text, SAMPLES.MANUAL.metadata);
    assert(r.document_type_id === 'MANUAL', `Expected MANUAL, got ${r.document_type_id} (confidence ${r.confidence})`);
  });

  await test('Secretary-General report classified as SG_REP [L5]', async () => {
    const r = await classifier.classify(SAMPLES.SG_REP.text, SAMPLES.SG_REP.metadata);
    assert(r.document_type_id === 'SG_REP', `Expected SG_REP, got ${r.document_type_id} (confidence ${r.confidence})`);
  });

  await test('ICT strategy classified as ICT_STRAT [L5]', async () => {
    const r = await classifier.classify(SAMPLES.ICT_STRAT.text, SAMPLES.ICT_STRAT.metadata);
    assert(r.document_type_id === 'ICT_STRAT', `Expected ICT_STRAT, got ${r.document_type_id} (confidence ${r.confidence})`);
  });

  // Suite 3: Confidence levels + fallback
  console.log('\nSuite 3: Confidence levels + fallback');

  await test('Unknown document returns requires_llm_classification=true', async () => {
    const r = await classifier.classify(SAMPLES.UNKNOWN.text, SAMPLES.UNKNOWN.metadata);
    assert(r.requires_llm_classification === true, `Expected requires_llm_classification=true, got ${r.requires_llm_classification}`);
    assert(r.document_type_id === 'unknown', `Expected document_type_id=unknown, got ${r.document_type_id}`);
  });

  await test('classify() returns alternatives array', async () => {
    const r = await classifier.classify(SAMPLES.ST_SGB.text, SAMPLES.ST_SGB.metadata);
    assert(Array.isArray(r.alternatives), 'Expected alternatives array');
    assert(r.alternatives.length <= 3, 'Expected at most 3 alternatives');
  });

  await test('classify() returns confidence_level string', async () => {
    const r = await classifier.classify(SAMPLES.OIOS_REP.text, SAMPLES.OIOS_REP.metadata);
    assert(['HIGH', 'MEDIUM', 'LOW'].includes(r.confidence_level), `Unexpected confidence_level: ${r.confidence_level}`);
  });

  // Suite 4: Layer properties
  console.log('\nSuite 4: Epistemic layer correctness');

  await test('L4 types have normativeWeight = 0 (empirical)', async () => {
    const types = await classifier.listDocumentTypes();
    const empirical = types.filter(t => t.epistemicLayer === 'L4');
    assert(empirical.length >= 3, 'Expected at least 3 L4 types');
    for (const t of empirical) {
      assert(t.normativeWeight === 0, `${t.id} should have normativeWeight=0 (got ${t.normativeWeight})`);
    }
  });

  await test('L0 types have normativeWeight >= 0.95', async () => {
    const types = await classifier.listDocumentTypes();
    const constitutional = types.filter(t => t.epistemicLayer === 'L0');
    assert(constitutional.length >= 2, 'Expected at least 2 L0 types');
    for (const t of constitutional) {
      assert(t.normativeWeight >= 0.95, `${t.id} should have normativeWeight>=0.95 (got ${t.normativeWeight})`);
    }
  });

  await test('L1 type (ST_SGB) has normativeWeight 0.85', async () => {
    const types = await classifier.listDocumentTypes();
    const sgb = types.find(t => t.id === 'ST_SGB');
    assert(sgb, 'ST_SGB not found');
    assert(sgb.normativeWeight === 0.85, `Expected 0.85, got ${sgb.normativeWeight}`);
  });

  // Summary
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
