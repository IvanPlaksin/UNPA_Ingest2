'use strict';

/**
 * Test script for the GLiNER NER microservice.
 * Run after: docker compose --profile gliner up -d gliner
 *
 * Usage:
 *   node api/scripts/test-gliner.js
 *   GLINER_URL=http://localhost:5100 node api/scripts/test-gliner.js
 */

const GLINER_URL = process.env.GLINER_URL || 'http://localhost:5100';

const TEST_TEXT = `
The Secretary-General of the United Nations submitted a report to the General Assembly
on the implementation of Resolution A/RES/77/489 concerning ICT Strategy 2023-2028.
The Office of Information and Communications Technology (OICT) is responsible for
implementing the Digital Transformation Roadmap under the oversight of the
Information Technology Governance Committee (ITGC), which was established by
the Secretary-General's bulletin ST/SGB/2020/5.
The United Nations Secretariat, headquartered in New York, cooperates with
UNDP and specialized agencies to ensure interoperability of systems including
Umoja, iNeed, and the Service Portal.
`;

async function testHealth() {
  console.log('\n── /health ──────────────────────────────────');
  const res = await fetch(`${GLINER_URL}/health`);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
  if (!data.model_loaded) {
    console.warn('⚠  Model not loaded yet — first /ner call will trigger download (~500MB)');
  }
  return data;
}

async function testNER() {
  console.log('\n── /ner ─────────────────────────────────────');
  const res = await fetch(`${GLINER_URL}/ner`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: TEST_TEXT.trim(), threshold: 0.30 }),
  });
  const data = await res.json();

  if (!res.ok) {
    console.error('Error:', data);
    return;
  }

  console.log(`Text length: ${data.text_length} chars`);
  console.log(`Entities found: ${data.entities.length}`);
  console.log('\nEntities:');
  for (const e of data.entities) {
    console.log(`  [${e.canonical_type.padEnd(14)}] "${e.text}" (score: ${e.score})`);
  }
  return data;
}

async function testBatch() {
  console.log('\n── /batch ───────────────────────────────────');
  const texts = [
    'The General Assembly adopted resolution A/RES/78/1 on United Nations reform.',
    'António Guterres, the Secretary-General, presented the report in Geneva.',
  ];
  const res = await fetch(`${GLINER_URL}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts, threshold: 0.30 }),
  });
  const data = await res.json();

  if (!res.ok) {
    console.error('Error:', data);
    return;
  }

  for (let i = 0; i < data.results.length; i++) {
    console.log(`\nText ${i + 1}: "${texts[i].slice(0, 60)}..."`);
    console.log(`  Entities: ${data.results[i].entities.map(e => `${e.text} (${e.canonical_type})`).join(', ')}`);
  }
  return data;
}

async function main() {
  console.log(`Testing GLiNER service at: ${GLINER_URL}`);

  try {
    await testHealth();
  } catch (e) {
    console.error(`\n✗ Service unreachable: ${e.message}`);
    console.error('  Make sure the container is running:');
    console.error('  docker compose --profile gliner up -d gliner');
    process.exit(1);
  }

  try {
    await testNER();
    await testBatch();
    console.log('\n✓ All tests passed');
  } catch (e) {
    console.error(`\n✗ Test failed: ${e.message}`);
    process.exit(1);
  }
}

main();
