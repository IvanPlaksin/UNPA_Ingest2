'use strict';
/**
 * Test SC_RES classification with corrected metadata and updated rules.
 * Bypasses the API process cache issue — runs against live Memgraph directly.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const path      = require('path');
const fs        = require('fs');
const pdfParse  = require('pdf-parse');
const classifier = require('../src/services/knowledge/document-classifier');

const DOC_ID      = '449f8a5c-6e2e-4354-9850-978ae22c3295';
const STORAGE     = 'D:\\UN\\Repos\\UNPA\\UNPA_Ingest\\api\\Artefacts\\Documents\\UN\\449f8a5c-6e2e-4354-9850-978ae22c3295_S_RES_2235_2015_.pdf';
const DOC_TITLE   = 'S/RES/2235(2015)';

async function run() {
  console.log('Loading PDF text...');
  const buf = fs.readFileSync(STORAGE);
  const pdf = await pdfParse(buf, { max: 3 }); // first 3 pages sufficient for classification
  const text = pdf.text;
  console.log(`PDF text length: ${text.length} chars`);
  console.log('First 500 chars:');
  console.log(text.slice(0, 500));
  console.log('\n---');

  console.log('\nLoading classifier rules from Memgraph...');
  const rules = await classifier.loadClassifierRules();
  const scRule = rules.find(r => r.document_type_id === 'SC_RES');
  const gaRule = rules.find(r => r.document_type_id === 'GA_RES');
  console.log('SC_RES rule threshold:', scRule?.threshold);
  console.log('GA_RES rule threshold:', gaRule?.threshold);

  console.log('\nRunning classification with documentTitle=' + DOC_TITLE + '...');
  const result = await classifier.classify(text, {
    document_title: DOC_TITLE,
    un_symbol:      DOC_TITLE,
    filename:       'S_RES_2235_2015_.pdf',
  });

  console.log('\n=== CLASSIFICATION RESULT ===');
  console.log('document_type_id:  ', result.document_type_id);
  console.log('document_type_name:', result.document_type_name);
  console.log('confidence:        ', result.confidence);
  console.log('confidence_level:  ', result.confidence_level);
  console.log('epistemicLayer:    ', result.epistemicLayer);
  console.log('normativeWeight:   ', result.normativeWeight);
  console.log('signals:           ', JSON.stringify(result.signals, null, 2));
  console.log('alternatives:      ', JSON.stringify(result.alternatives));
  console.log('requires_llm:      ', result.requires_llm_classification);

  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
