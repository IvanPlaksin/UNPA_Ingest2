'use strict';

/**
 * TASK-FLOWDESK-004 Phase 6: Test semantic search accuracy.
 *
 * Usage: node api/src/services/flowdesk/test-semantic-search.js
 */

const { init, classifyUserIntent } = require('./semantic-search');

const TEST_CASES = [
  // English - clear intent
  { input: 'I need a new laptop', expected: 'IT-HW-LAP', lang: 'en' },
  { input: 'my monitor is broken', expected: 'IT-HW-MON', lang: 'en' },
  { input: 'request annual leave', expected: 'HR-BEN-LEV', lang: 'en' },
  { input: 'I forgot my password', expected: 'IT-SEC-PWD', lang: 'en' },
  { input: 'need a printer for our office', expected: 'IT-HW-PRT', lang: 'en' },
  { input: 'book a meeting room for tomorrow', expected: 'FAC-CNF-RM', lang: 'en' },
  { input: 'I need VPN access for remote work', expected: 'IT-NET-VPN', lang: 'en' },
  { input: 'my account is locked', expected: 'IT-SEC-UNL', lang: 'en' },

  // English - informal/typos
  { input: 'need new labtop asap', expected: 'IT-HW-LAP', lang: 'en' },
  { input: 'cant login to my email', expected: 'IT-SEC-PWD', lang: 'en' },
  { input: 'wifi not working', expected: 'IT-NET-WIFI', lang: 'en' },

  // English - problem statement
  { input: 'the air conditioning is not working in my office', expected: 'FAC-BLD-HVAC', lang: 'en' },
  { input: 'lights are flickering on the 3rd floor', expected: 'FAC-BLD-LGT', lang: 'en' },
  { input: 'I reported a security incident', expected: 'IT-SEC-INC', lang: 'en' },

  // French
  { input: "J'ai besoin d'un nouvel ordinateur portable", expected: 'IT-HW-LAP', lang: 'fr' },
  { input: 'demande de congé', expected: 'HR-BEN-LEV', lang: 'fr' },

  // Spanish
  { input: 'necesito una laptop nueva', expected: 'IT-HW-LAP', lang: 'es' },
  { input: 'solicitud de vacaciones', expected: 'HR-BEN-LEV', lang: 'es' },

  // Russian
  { input: 'мне нужен новый ноутбук', expected: 'IT-HW-LAP', lang: 'ru' },
  { input: 'заявка на отпуск', expected: 'HR-BEN-LEV', lang: 'ru' },

  // Arabic
  { input: 'أحتاج إلى كمبيوتر محمول جديد', expected: 'IT-HW-LAP', lang: 'ar' },

  // Chinese
  { input: '我需要一台新笔记本电脑', expected: 'IT-HW-LAP', lang: 'zh' },

  // Cross-domain
  { input: 'I need a visitor badge for my guest', expected: 'SEC-ACC-VIS', lang: 'en' },
  { input: 'request office supplies', expected: 'LOG-INV-SUP', lang: 'en' },
  { input: 'need to install software on my computer', expected: 'IT-SW-INS', lang: 'en' },
  { input: 'submit an expense report', expected: 'FIN-AP-EXP', lang: 'en' },
];

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Semantic Search Accuracy Test                    ║');
  console.log('╚══════════════════════════════════════════════════╝');

  await init();

  let correct = 0;
  let top3Correct = 0;
  let total = 0;
  const byLang = {};
  const byDomain = {};
  const byConfidence = { high: { correct: 0, total: 0 }, medium: { correct: 0, total: 0 }, low: { correct: 0, total: 0 }, unclassified: { correct: 0, total: 0 } };
  const failures = [];

  for (const tc of TEST_CASES) {
    total++;
    const result = await classifyUserIntent(tc.input);
    const topCode = result.top_match?.service_code;
    const altCodes = result.alternatives.map(a => a.service_code);
    const isCorrect = topCode === tc.expected;
    const inTop3 = isCorrect || altCodes.includes(tc.expected);

    if (isCorrect) correct++;
    if (inTop3) top3Correct++;

    // Track by language
    const lang = tc.lang || 'en';
    if (!byLang[lang]) byLang[lang] = { correct: 0, total: 0 };
    byLang[lang].total++;
    if (isCorrect) byLang[lang].correct++;

    // Track by domain
    const domain = tc.expected.split('-')[0];
    if (!byDomain[domain]) byDomain[domain] = { correct: 0, total: 0 };
    byDomain[domain].total++;
    if (isCorrect) byDomain[domain].correct++;

    // Track by confidence
    byConfidence[result.confidence].total++;
    if (isCorrect) byConfidence[result.confidence].correct++;

    const mark = isCorrect ? '✓' : (inTop3 ? '~' : '✗');
    const score = result.top_match?.score?.toFixed(3) || 'N/A';
    console.log(`  ${mark} [${lang}] "${tc.input.slice(0, 40)}..." → ${topCode} (${score}, ${result.confidence}) ${isCorrect ? '' : `expected: ${tc.expected}`}`);

    if (!isCorrect) {
      failures.push({
        input: tc.input,
        expected: tc.expected,
        got: topCode,
        score: result.top_match?.score,
        confidence: result.confidence,
        alternatives: altCodes,
      });
    }
  }

  // Summary
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  TEST RESULTS                                    ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  Accuracy (top-1): ${correct}/${total} = ${(correct / total * 100).toFixed(1)}%`);
  console.log(`  Accuracy (top-3): ${top3Correct}/${total} = ${(top3Correct / total * 100).toFixed(1)}%`);

  console.log('\n  By language:');
  Object.entries(byLang).sort().forEach(([lang, stats]) => {
    console.log(`    ${lang}: ${stats.correct}/${stats.total} = ${(stats.correct / stats.total * 100).toFixed(0)}%`);
  });

  console.log('\n  By domain:');
  Object.entries(byDomain).sort().forEach(([domain, stats]) => {
    console.log(`    ${domain}: ${stats.correct}/${stats.total} = ${(stats.correct / stats.total * 100).toFixed(0)}%`);
  });

  console.log('\n  By confidence:');
  Object.entries(byConfidence).forEach(([level, stats]) => {
    if (stats.total > 0) {
      console.log(`    ${level}: ${stats.correct}/${stats.total} = ${(stats.correct / stats.total * 100).toFixed(0)}% accurate`);
    }
  });

  if (failures.length > 0) {
    console.log(`\n  Failures (${failures.length}):`);
    failures.forEach(f => {
      console.log(`    "${f.input}" → got: ${f.got} (${f.score?.toFixed(3)}), expected: ${f.expected}, alts: [${f.alternatives.join(',')}]`);
    });
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
