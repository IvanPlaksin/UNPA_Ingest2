#!/usr/bin/env node
/**
 * Text Processing Pipeline CLI
 *
 * Interactive tool for testing and debugging the text processing pipeline.
 *
 * Usage:
 *   node pipeline-cli.js analyze "Your text here"
 *   node pipeline-cli.js analyze-file ./document.html
 *   node pipeline-cli.js entities "text with IMIS and Umoja"
 *   node pipeline-cli.js benchmark --count 100
 *   node pipeline-cli.js layers
 *
 * @module scripts/pipeline-cli
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Import services
const { TextSanitizer } = require('../src/services/preprocessing/sanitizer.service');
const { LanguageDetector } = require('../src/services/preprocessing/language-detector');
const { TextChunker } = require('../src/services/chunking/text-chunker');
const { EntityExtractor } = require('../src/services/extraction/entity-extractor');
const { NODE_TYPES, EDGE_TYPES } = require('../src/services/graph/ontology.schema');

// Initialize services
const sanitizer = new TextSanitizer({
  removeHtml: true,
  normalizeWhitespace: true,
  preserveCodeBlocks: true
});

const languageDetector = new LanguageDetector({
  defaultLanguage: 'en',
  minConfidence: 0.3
});

const chunker = new TextChunker({
  maxTokens: 512,
  overlapTokens: 50,
  preserveParagraphs: true
});

const entityExtractor = new EntityExtractor({
  extractStructuredData: true,
  enableSemanticExtraction: false
});

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m'
};

function color(text, colorCode) {
  return `${colorCode}${text}${colors.reset}`;
}

// Parse command line
const args = process.argv.slice(2);
const command = args[0];
const commandArgs = args.slice(1);

// Help text
const HELP = `
${color('Text Processing Pipeline CLI', colors.cyan + colors.bright)}

${color('Commands:', colors.yellow)}
  analyze <text>       Analyze text through full pipeline
  analyze-file <path>  Analyze file content
  entities <text>      Extract only entities from text
  benchmark [options]  Run performance benchmark
  layers               Show ontology layers configuration
  help                 Show this help message

${color('Options for analyze:', colors.yellow)}
  --type <type>        Source type: text, workitem, code (default: text)
  --pii                Enable PII removal
  --verbose            Show detailed output

${color('Options for benchmark:', colors.yellow)}
  --count <n>          Number of documents to process (default: 100)

${color('Examples:', colors.gray)}
  node pipeline-cli.js analyze "IMIS integrates with Umoja"
  node pipeline-cli.js analyze-file ./docs/requirements.html --verbose
  node pipeline-cli.js entities "Contact john@un.org about ST/AI/2023/1"
  node pipeline-cli.js benchmark --count 50
`;

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYZE COMMAND
// ═══════════════════════════════════════════════════════════════════════════════

async function analyzeCommand(text, options = {}) {
  console.log(color('\n═══ TEXT PROCESSING PIPELINE ═══\n', colors.cyan + colors.bright));

  if (!text || text.trim().length === 0) {
    console.log(color('Error: Text is required', colors.red));
    return;
  }

  const totalStart = Date.now();
  const metrics = {};

  // Step 1: Sanitization
  console.log(color('Step 1: Sanitization', colors.yellow));
  const startSanitize = Date.now();
  const sanitized = sanitizer.sanitize(text, {
    removePII: options.pii || false
  });
  metrics.sanitize = Date.now() - startSanitize;

  console.log(color(`  Time: ${metrics.sanitize}ms`, colors.gray));
  console.log(color(`  Input: ${text.length} chars -> Output: ${sanitized.text.length} chars`, colors.gray));
  console.log(color(`  Compression: ${((1 - sanitized.metadata.compressionRatio) * 100).toFixed(1)}%`, colors.gray));

  if (sanitized.changes.length > 0) {
    console.log(color(`  Changes: ${sanitized.changes.map(c => c.type).join(', ')}`, colors.gray));
  }

  if (options.verbose) {
    console.log(color(`  Preview: "${sanitized.text.substring(0, 200)}..."`, colors.gray));
  }

  // Step 2: Language Detection
  console.log(color('\nStep 2: Language Detection', colors.yellow));
  const startLang = Date.now();
  const language = languageDetector.detect(sanitized.text);
  metrics.language = Date.now() - startLang;

  console.log(color(`  Time: ${metrics.language}ms`, colors.gray));
  console.log(color(`  Language: ${language.language} (${(language.confidence * 100).toFixed(1)}% confidence)`, colors.green));
  console.log(color(`  Script: ${language.script}`, colors.gray));

  // Step 3: Chunking
  console.log(color('\nStep 3: Chunking', colors.yellow));
  const startChunk = Date.now();
  const chunks = chunker.chunk(sanitized.text);
  metrics.chunk = Date.now() - startChunk;

  console.log(color(`  Time: ${metrics.chunk}ms`, colors.gray));
  console.log(color(`  Chunks: ${chunks.length}`, colors.green));

  if (options.verbose && chunks.length > 0) {
    const stats = chunker.getStats(chunks);
    console.log(color(`  Total tokens: ~${stats.totalTokens}`, colors.gray));
    console.log(color(`  Avg tokens/chunk: ${stats.avgTokens}`, colors.gray));

    chunks.slice(0, 3).forEach((c, i) => {
      console.log(color(`    [${i}] ${c.tokenEstimate} tokens: "${c.content.substring(0, 60)}..."`, colors.gray));
    });
    if (chunks.length > 3) {
      console.log(color(`    ... and ${chunks.length - 3} more chunks`, colors.gray));
    }
  }

  // Step 4: Entity Extraction
  console.log(color('\nStep 4: Entity Extraction', colors.yellow));
  const startExtract = Date.now();

  let allEntities = [];
  let allRelationships = [];

  for (const chunk of chunks) {
    const result = await entityExtractor.extract(chunk.content, {
      context: options.type || 'text',
      language: language.language
    });
    allEntities = allEntities.concat(result.entities);
    if (result.relationships) {
      allRelationships = allRelationships.concat(result.relationships);
    }
  }

  metrics.extract = Date.now() - startExtract;

  // Deduplicate entities
  const entityMap = new Map();
  for (const entity of allEntities) {
    const key = `${entity.type}:${(entity.name || entity.text || '').toLowerCase()}`;
    if (!entityMap.has(key)) {
      entityMap.set(key, entity);
    } else {
      const existing = entityMap.get(key);
      existing.confidence = Math.max(existing.confidence || 0, entity.confidence || 0);
    }
  }
  const uniqueEntities = [...entityMap.values()];

  console.log(color(`  Time: ${metrics.extract}ms`, colors.gray));
  console.log(color(`  Raw entities: ${allEntities.length}`, colors.gray));
  console.log(color(`  Unique entities: ${uniqueEntities.length}`, colors.green));
  console.log(color(`  Relationships: ${allRelationships.length}`, colors.gray));

  // Display entities table
  if (uniqueEntities.length > 0) {
    console.log(color('\n  Extracted Entities:', colors.yellow));

    // Group by type
    const byType = {};
    for (const entity of uniqueEntities) {
      const type = entity.type || 'Unknown';
      if (!byType[type]) byType[type] = [];
      byType[type].push(entity);
    }

    for (const [type, entities] of Object.entries(byType)) {
      const nodeType = NODE_TYPES[type];
      const layer = nodeType ? nodeType.layer : 'N/A';
      const layerColor = layer === 'Strategic' ? colors.magenta :
                        layer === 'Code' ? colors.green : colors.cyan;

      console.log(color(`\n  ${type} (${entities.length}) - Layer: ${layer}`, layerColor));

      entities.slice(0, 5).forEach(e => {
        const name = e.name || e.text || 'unnamed';
        const conf = e.confidence ? ` [${(e.confidence * 100).toFixed(0)}%]` : '';
        console.log(color(`    • ${name}${conf}`, colors.gray));
      });

      if (entities.length > 5) {
        console.log(color(`    ... and ${entities.length - 5} more`, colors.gray));
      }
    }
  }

  // Summary
  metrics.total = Date.now() - totalStart;

  console.log(color('\n═══ SUMMARY ═══', colors.cyan + colors.bright));
  console.log(`  Total time: ${metrics.total}ms`);
  console.log(`  Language: ${language.language}`);
  console.log(`  Chunks: ${chunks.length}`);
  console.log(`  Entities: ${uniqueEntities.length}`);

  if (sanitized.metadata.hadPII) {
    console.log(color('  ⚠️  PII was detected and redacted', colors.yellow));
  }

  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYZE-FILE COMMAND
// ═══════════════════════════════════════════════════════════════════════════════

async function analyzeFileCommand(filePath, options = {}) {
  const fullPath = path.resolve(filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(color(`Error: File not found: ${fullPath}`, colors.red));
    process.exit(1);
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();

  // Determine source type from extension
  let sourceType = 'text';
  if (['.ts', '.js', '.cs', '.py', '.java', '.sql'].includes(ext)) {
    sourceType = 'code';
  } else if (['.html', '.htm'].includes(ext)) {
    sourceType = 'workitem';
  }

  console.log(color(`\nAnalyzing: ${filePath}`, colors.cyan));
  console.log(color(`  Size: ${content.length} bytes`, colors.gray));
  console.log(color(`  Detected type: ${sourceType}`, colors.gray));

  await analyzeCommand(content, { ...options, type: sourceType });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITIES COMMAND
// ═══════════════════════════════════════════════════════════════════════════════

async function entitiesCommand(text, options = {}) {
  if (!text) {
    console.log(color('Error: Text is required', colors.red));
    return;
  }

  const sanitized = sanitizer.clean(text);
  const result = await entityExtractor.extract(sanitized);

  if (options.json) {
    console.log(JSON.stringify(result.entities, null, 2));
    return;
  }

  console.log(color(`\nFound ${result.entities.length} entities:\n`, colors.cyan));

  if (result.entities.length === 0) {
    console.log(color('  No entities found', colors.gray));
    return;
  }

  // Group by type
  const byType = {};
  for (const entity of result.entities) {
    const type = entity.type || 'Unknown';
    if (!byType[type]) byType[type] = [];
    byType[type].push(entity);
  }

  for (const [type, entities] of Object.entries(byType)) {
    console.log(color(`${type} (${entities.length}):`, colors.yellow));
    entities.forEach(e => {
      const name = e.name || e.text || 'unnamed';
      const conf = e.confidence ? ` [${(e.confidence * 100).toFixed(0)}%]` : '';
      console.log(color(`  • ${name}${conf}`, colors.gray));
    });
  }

  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// BENCHMARK COMMAND
// ═══════════════════════════════════════════════════════════════════════════════

async function benchmarkCommand(options = {}) {
  const count = options.count || 100;

  console.log(color(`\n═══ BENCHMARK: ${count} documents ═══\n`, colors.cyan + colors.bright));

  // Generate test documents
  const docs = Array(count).fill(null).map((_, i) =>
    `Document ${i} discusses IMIS integration with Umoja for ${i % 2 ? 'budget' : 'travel'} processing.
     Contact user${i}@un.org for details. Reference: #${10000 + i}, ST/AI/2023/${i % 10}.
     The system uses ${i % 3 ? 'TypeScript' : 'C#'} and connects to ${i % 2 ? 'Oracle' : 'SQL Server'}.`
  );

  const metrics = {
    sanitize: [],
    detect: [],
    chunk: [],
    extract: [],
    total: []
  };

  console.log(color('Processing...', colors.yellow));

  const progressWidth = 50;
  const updateProgress = (current) => {
    const pct = Math.round((current / count) * 100);
    const filled = Math.round((current / count) * progressWidth);
    const empty = progressWidth - filled;
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
    process.stdout.write(`\r  [${bar}] ${pct}%`);
  };

  for (let i = 0; i < docs.length; i++) {
    const totalStart = Date.now();

    const t1 = Date.now();
    const sanitized = sanitizer.sanitize(docs[i]);
    metrics.sanitize.push(Date.now() - t1);

    const t2 = Date.now();
    languageDetector.detect(sanitized.text);
    metrics.detect.push(Date.now() - t2);

    const t3 = Date.now();
    chunker.chunk(sanitized.text);
    metrics.chunk.push(Date.now() - t3);

    const t4 = Date.now();
    await entityExtractor.extract(sanitized.text);
    metrics.extract.push(Date.now() - t4);

    metrics.total.push(Date.now() - totalStart);
    updateProgress(i + 1);
  }

  console.log('\n');

  // Calculate statistics
  const calcStats = (arr) => ({
    avg: (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2),
    min: Math.min(...arr),
    max: Math.max(...arr),
    p95: arr.sort((a, b) => a - b)[Math.floor(arr.length * 0.95)]
  });

  // Results table
  console.log(color('Results:', colors.yellow));
  console.log('');
  console.log('  Stage        Avg(ms)   Min    Max    P95');
  console.log('  ' + '-'.repeat(45));

  for (const [stage, times] of Object.entries(metrics)) {
    const s = calcStats(times);
    const row = `  ${stage.padEnd(12)} ${s.avg.padStart(7)}   ${String(s.min).padStart(4)}   ${String(s.max).padStart(4)}   ${String(s.p95).padStart(4)}`;
    console.log(row);
  }

  const totalTime = metrics.total.reduce((a, b) => a + b, 0);
  const throughput = (count / (totalTime / 1000)).toFixed(1);

  console.log('');
  console.log(color(`Total: ${totalTime}ms for ${count} docs`, colors.green));
  console.log(color(`Throughput: ${throughput} docs/sec`, colors.green));
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYERS COMMAND
// ═══════════════════════════════════════════════════════════════════════════════

function layersCommand() {
  console.log(color('\n═══ ONTOLOGY LAYERS ═══\n', colors.cyan + colors.bright));

  const layers = {
    Strategic: { zPosition: -200, color: '#9C27B0', types: [] },
    Business: { zPosition: 0, color: '#2196F3', types: [] },
    Code: { zPosition: 200, color: '#4CAF50', types: [] }
  };

  // Group node types by layer
  for (const [typeName, config] of Object.entries(NODE_TYPES)) {
    const layer = config.layer || 'Business';
    if (layers[layer]) {
      layers[layer].types.push(typeName);
    }
  }

  for (const [layerName, config] of Object.entries(layers)) {
    const layerColor = layerName === 'Strategic' ? colors.magenta :
                      layerName === 'Code' ? colors.green : colors.cyan;

    console.log(color(`${layerName} (z=${config.zPosition})`, layerColor + colors.bright));
    console.log(color(`  Color: ${config.color}`, colors.gray));
    console.log(color(`  Node Types (${config.types.length}):`, colors.gray));

    config.types.forEach(t => {
      console.log(color(`    • ${t}`, colors.gray));
    });
    console.log('');
  }

  // Edge types
  console.log(color('Edge Types:', colors.yellow + colors.bright));
  for (const [edgeName, config] of Object.entries(EDGE_TYPES)) {
    console.log(color(`  • ${edgeName}`, colors.gray));
  }

  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  switch (command) {
    case 'analyze':
      const analyzeText = commandArgs.filter(a => !a.startsWith('--')).join(' ');
      const analyzeOpts = {
        type: commandArgs.includes('--type') ? commandArgs[commandArgs.indexOf('--type') + 1] : 'text',
        pii: commandArgs.includes('--pii'),
        verbose: commandArgs.includes('--verbose') || commandArgs.includes('-v')
      };
      await analyzeCommand(analyzeText, analyzeOpts);
      break;

    case 'analyze-file':
      const filePath = commandArgs.find(a => !a.startsWith('--'));
      const fileOpts = {
        pii: commandArgs.includes('--pii'),
        verbose: commandArgs.includes('--verbose') || commandArgs.includes('-v')
      };
      await analyzeFileCommand(filePath, fileOpts);
      break;

    case 'entities':
      const entitiesText = commandArgs.filter(a => !a.startsWith('--')).join(' ');
      const entitiesOpts = {
        json: commandArgs.includes('--json')
      };
      await entitiesCommand(entitiesText, entitiesOpts);
      break;

    case 'benchmark':
      const countIdx = commandArgs.indexOf('--count');
      const benchOpts = {
        count: countIdx >= 0 ? parseInt(commandArgs[countIdx + 1]) : 100
      };
      await benchmarkCommand(benchOpts);
      break;

    case 'layers':
      layersCommand();
      break;

    case 'help':
    case '--help':
    case '-h':
    default:
      console.log(HELP);
      break;
  }
}

main().catch(err => {
  console.error(color(`Error: ${err.message}`, colors.red));
  process.exit(1);
});
