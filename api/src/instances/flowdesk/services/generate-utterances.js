'use strict';

/**
 * TASK-FLOWDESK-004 Phase 2: Generate utterances for semantic routing.
 *
 * Uses Claude Sonnet via llm.service to generate diverse multilingual utterances.
 *
 * Usage: node api/src/services/flowdesk/generate-utterances.js
 */

// Load .env from api directory
require('dotenv').config({ path: require('path').join(__dirname, '../../..', '.env') });

const fs = require('fs');
const path = require('path');
const { getInstance: getLLMProvider } = require('../../../services/llm/LLMProviderService');
const llmService = getLLMProvider();

const DATA_DIR = path.join(__dirname, 'data');
const CATALOG_FILE = path.join(DATA_DIR, 'service-catalog.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'utterances.json');

function buildPrompt(service) {
  return `You generate training data for a UN multilingual service request classifier.

Service: ${service.name} (${service.code})
Description: ${service.description}
Category: ${service.category}
Domain: ${service.domain}

Generate utterances UN staff would use to request this service. Include:
- Formal requests, informal, problem statements, questions, keywords, urgent

Output ONLY a JSON array, no other text:
[
  {"text":"English formal request","lang":"en"},
  {"text":"English informal","lang":"en"},
  {"text":"English problem statement","lang":"en"},
  {"text":"English question","lang":"en"},
  {"text":"English keywords only","lang":"en"},
  {"text":"English urgent","lang":"en"},
  {"text":"English with context","lang":"en"},
  {"text":"English varied","lang":"en"},
  {"text":"French utterance 1","lang":"fr"},
  {"text":"French utterance 2","lang":"fr"},
  {"text":"French utterance 3","lang":"fr"},
  {"text":"French utterance 4","lang":"fr"},
  {"text":"Spanish utterance 1","lang":"es"},
  {"text":"Spanish utterance 2","lang":"es"},
  {"text":"Spanish utterance 3","lang":"es"},
  {"text":"Spanish utterance 4","lang":"es"},
  {"text":"Russian utterance 1","lang":"ru"},
  {"text":"Russian utterance 2","lang":"ru"},
  {"text":"Russian utterance 3","lang":"ru"},
  {"text":"Russian utterance 4","lang":"ru"},
  {"text":"Arabic utterance 1","lang":"ar"},
  {"text":"Arabic utterance 2","lang":"ar"},
  {"text":"Chinese utterance 1","lang":"zh"},
  {"text":"Chinese utterance 2","lang":"zh"}
]`;
}

function parseResponse(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Generate Utterances via Claude Sonnet            ║');
  console.log('╚══════════════════════════════════════════════════╝');

  const catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf-8'));
  console.log(`  Services: ${catalog.length}`);

  // Load existing progress
  let result = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      result = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
      console.log(`  Resuming from ${Object.keys(result).length} existing entries`);
    } catch { /* fresh start */ }
  }

  let generated = 0;
  let totalUtterances = 0;
  const errors = [];

  for (let i = 0; i < catalog.length; i++) {
    const service = catalog[i];
    if (result[service.code]) {
      totalUtterances += result[service.code].utterances.length;
      continue;
    }

    console.log(`\n  [${i + 1}/${catalog.length}] ${service.code}: ${service.name}`);
    try {
      const prompt = buildPrompt(service);
      const response = await llmService.chat(
        [{ role: 'user', content: prompt }],
        { model: 'claude-sonnet-4-20250514', temperature: 0.8, maxTokens: 2048 }
      );

      const rc1 = response.content;
      const text1 = Array.isArray(rc1) ? rc1.filter(b => b.type === 'text').map(b => b.text).join('') : (rc1 || '');
      const utterances = parseResponse(text1);
      if (!utterances || utterances.length < 10) {
        console.log(`    WARN: Only ${utterances?.length || 0} utterances, retrying...`);
        const response2 = await llmService.chat(
          [{ role: 'user', content: prompt }],
          { model: 'claude-sonnet-4-20250514', temperature: 0.9, maxTokens: 2048 }
        );
        const rc2 = response2.content;
        const text2 = Array.isArray(rc2) ? rc2.filter(b => b.type === 'text').map(b => b.text).join('') : (rc2 || '');
        const utterances2 = parseResponse(text2);
        result[service.code] = { service, utterances: utterances2 || utterances || [] };
      } else {
        result[service.code] = { service, utterances };
      }

      const count = result[service.code].utterances.length;
      totalUtterances += count;
      generated++;
      console.log(`    OK: ${count} utterances`);

      // Save progress every 5 services
      if (generated % 5 === 0) {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
        console.log(`    [saved: ${Object.keys(result).length}/${catalog.length}]`);
      }
    } catch (err) {
      errors.push({ code: service.code, error: err.message });
      console.log(`    ERROR: ${err.message}`);
    }
  }

  // Final save
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));

  // Summary
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  SUMMARY                                         ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  Services: ${Object.keys(result).length}/${catalog.length}`);
  console.log(`  Total utterances: ${totalUtterances}`);
  console.log(`  Average: ${(totalUtterances / Math.max(Object.keys(result).length, 1)).toFixed(1)}/service`);

  const byLang = {};
  Object.values(result).forEach(e => {
    (e.utterances || []).forEach(u => { byLang[u.lang] = (byLang[u.lang] || 0) + 1; });
  });
  console.log('  By language:');
  Object.entries(byLang).sort((a, b) => b[1] - a[1]).forEach(([l, c]) => console.log(`    ${l}: ${c}`));

  if (errors.length > 0) {
    console.log(`\n  Errors (${errors.length}):`);
    errors.forEach(e => console.log(`    ${e.code}: ${e.error}`));
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
