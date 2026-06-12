#!/usr/bin/env node
'use strict';

/**
 * Seed default extraction methodologies into Memgraph.
 *
 * Usage:  node api/scripts/seed-methodologies.js [--reset]
 *
 * Creates 4 methodologies:
 *   METH-DEFAULT   — fallback for any document
 *   METH-RES-L0    — Resolutions (GA/SC), L0-L1
 *   METH-REPORT    — Reports (SG/committees), L3-L4
 *   METH-POLICY    — Policy docs (ST/SGB/ST/AI), L0-L2
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { methodologyService } = require('../src/services/extraction/methodology.service');
const mg = require('../src/services/memgraph.service');

const ENTITY_PROMPT_TEMPLATE = `You are a UN document entity extractor.
Extract named entities from the following {{documentType}} document.

Document: {{documentTitle}}
UN Symbol: {{unSymbol}}
Epistemic Layer: {{epistemicLayer}}

Text:
{{text}}

Return JSON with:
{
  "entities": [{"name": string, "type": string, "category": string, "epistemicLayer": string, "relevance": "HIGH|MEDIUM|LOW", "match": string}],
  "summary": string,
  "keyProvisions": string[],
  "topics": string[]
}`;

const RESOLUTION_ENTITY_PROMPT = `You are a UN resolution entity extractor.
Extract ALL operative clauses, preambular references, mandated bodies, and key obligations
from this {{documentType}} ({{unSymbol}}).

Epistemic Layer: {{epistemicLayer}}

Text:
{{text}}

Return JSON with:
{
  "entities": [{"name": string, "type": "ACTOR|PROCESS|CONCEPT|EVENT|DOCUMENT|NORM|PLACE", "category": string, "epistemicLayer": "L0|L1|L2|L3|L4", "relevance": "HIGH|MEDIUM|LOW", "match": string}],
  "summary": string,
  "keyProvisions": string[],
  "topics": string[]
}`;

const RELATION_PROMPT_TEMPLATE = `Given these entities from a UN document, identify significant relationships.

Entities: {{entityList}}

Document excerpt:
{{text}}

Return JSON with:
{
  "relationships": [{"sourceEntityName": string, "targetEntityName": string, "relationType": string, "context": string, "confidence": number}]
}`;

async function seed({ reset = false } = {}) {
  console.log('Seeding methodologies...');

  if (reset) {
    console.log('  Clearing existing methodologies...');
    await mg.runQuery(
      `MATCH (n) WHERE n:Methodology OR n:PromptTemplate OR n:PipelineConfig OR n:HookSet
       DETACH DELETE n`
    );
    console.log('  Done.');
  }

  const existing = await methodologyService.listMethodologies({ status: 'ACTIVE' });
  if (existing.length > 0 && !reset) {
    console.log(`  ${existing.length} methodologies already exist. Use --reset to re-seed.`);
    await mg.close();
    return;
  }

  // ── METH-DEFAULT ─────────────────────────────────────────────────────
  console.log('  Creating METH-DEFAULT...');
  await methodologyService.createMethodology({
    name: 'METH-DEFAULT',
    version: '1.0',
    description: 'Default fallback methodology for all UN document types',
    targetDocTypes: [],  // empty = matches everything
    targetLayers: [],
    extractionDepth: 'STANDARD',
    promptTemplates: [
      { phase: 'ENTITIES', template: ENTITY_PROMPT_TEMPLATE, variables: ['documentType', 'documentTitle', 'unSymbol', 'epistemicLayer', 'text'], version: '1.0' },
      { phase: 'RELATIONS', template: RELATION_PROMPT_TEMPLATE, variables: ['entityList', 'text'], version: '1.0' },
    ],
    pipelineConfig: { chunkSize: 4000, overlap: 200, maxTurns: 1, timeout: 180000, mcpContext: false },
    hookSet: { hooks: ['KQS', 'KnowledgeTriangle', 'GapDetection'] },
  });

  // ── METH-RES-L0 ───────────────────────────────────────────────────────
  console.log('  Creating METH-RES-L0...');
  await methodologyService.createMethodology({
    name: 'METH-RES-L0',
    version: '1.0',
    description: 'Deep extraction for GA/SC resolutions and decisions (L0-L1)',
    targetDocTypes: ['RESOLUTION', 'DECISION'],
    targetLayers: ['L0', 'L1'],
    extractionDepth: 'DEEP',
    promptTemplates: [
      { phase: 'ENTITIES', template: RESOLUTION_ENTITY_PROMPT, variables: ['documentType', 'unSymbol', 'epistemicLayer', 'text'], version: '1.0' },
      { phase: 'RELATIONS', template: RELATION_PROMPT_TEMPLATE, variables: ['entityList', 'text'], version: '1.0' },
    ],
    pipelineConfig: { chunkSize: 6000, overlap: 400, maxTurns: 1, timeout: 240000, mcpContext: false },
    hookSet: { hooks: ['KQS', 'KnowledgeTriangle', 'GapDetection'] },
  });

  // ── METH-REPORT ───────────────────────────────────────────────────────
  console.log('  Creating METH-REPORT...');
  await methodologyService.createMethodology({
    name: 'METH-REPORT',
    version: '1.0',
    description: 'Standard extraction for SG/committee reports (L3-L4)',
    targetDocTypes: ['REPORT', 'ANALYTICAL_STUDY', 'NOTE'],
    targetLayers: ['L3', 'L4'],
    extractionDepth: 'STANDARD',
    promptTemplates: [
      { phase: 'ENTITIES', template: ENTITY_PROMPT_TEMPLATE, variables: ['documentType', 'documentTitle', 'unSymbol', 'epistemicLayer', 'text'], version: '1.0' },
      { phase: 'RELATIONS', template: RELATION_PROMPT_TEMPLATE, variables: ['entityList', 'text'], version: '1.0' },
    ],
    pipelineConfig: { chunkSize: 4000, overlap: 200, maxTurns: 1, timeout: 180000, mcpContext: false },
    hookSet: { hooks: ['KQS', 'GapDetection'] },
  });

  // ── METH-POLICY ───────────────────────────────────────────────────────
  console.log('  Creating METH-POLICY...');
  await methodologyService.createMethodology({
    name: 'METH-POLICY',
    version: '1.0',
    description: 'Deep extraction for policy instruments (ST/SGB, ST/AI) L0-L2',
    targetDocTypes: ['POLICY', 'ADMINISTRATIVE_INSTRUCTION', 'BULLETIN'],
    targetLayers: ['L0', 'L1', 'L2'],
    extractionDepth: 'DEEP',
    promptTemplates: [
      { phase: 'ENTITIES', template: RESOLUTION_ENTITY_PROMPT, variables: ['documentType', 'unSymbol', 'epistemicLayer', 'text'], version: '1.0' },
      { phase: 'RELATIONS', template: RELATION_PROMPT_TEMPLATE, variables: ['entityList', 'text'], version: '1.0' },
    ],
    pipelineConfig: { chunkSize: 5000, overlap: 300, maxTurns: 1, timeout: 200000, mcpContext: false },
    hookSet: { hooks: ['KQS', 'KnowledgeTriangle', 'GapDetection'] },
  });

  const created = await methodologyService.listMethodologies({ status: 'ACTIVE' });
  console.log(`\nSeeded ${created.length} methodologies:`);
  created.forEach(m => console.log(`  - ${m.name} (${m.extractionDepth}, targets: ${(m.targetDocTypes || []).join(', ') || 'ALL'})`));

  await mg.close();
}

const reset = process.argv.includes('--reset');
seed({ reset }).catch(err => { console.error('Seed failed:', err); process.exit(1); });
