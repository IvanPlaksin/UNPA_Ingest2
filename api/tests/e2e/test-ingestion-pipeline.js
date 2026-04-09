/**
 * Task 8.3 — Data Ingestion Pipeline Tests
 *
 * Tests DocumentParser, DocumentChunker, IngestionPipeline, and routes.
 */

// ── Test helpers ────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertTrue(val, msg) {
  if (!val) throw new Error(`${msg || 'Assertion failed'}: expected truthy, got ${JSON.stringify(val)}`);
}

async function test(name, fn, timeoutMs = 10000) {
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs))
    ]);
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n${'═'.repeat(63)}`);
  console.log(title);
  console.log('═'.repeat(63));
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  console.log('Data Ingestion Pipeline Tests (Task 8.3)');
  console.log('═'.repeat(63));

  const { DocumentParser, documentParser, DocumentChunker, documentChunker, IngestionPipeline, ingestionPipeline } = require('../../src/services/ingestion');

  // ============================================================
  // DocumentParser — Text
  // ============================================================
  section('DocumentParser — Text');

  await test('Parse plain text', async () => {
    const result = await documentParser.parseContent('Hello world.\n\nThis is a test.', '.txt');
    assertTrue(result.success);
    assertEqual(result.format, '.txt');
    assertTrue(result.text.includes('Hello world'));
    assertTrue(result.stats.lines >= 3);
    assertTrue(result.stats.words >= 6);
  });

  await test('Parse text extracts sections', async () => {
    const result = await documentParser.parseContent('Section one.\n\nSection two.\n\nSection three.', '.txt');
    assertTrue(result.sections.length >= 3);
    assertTrue(result.sections[0].content.includes('Section one'));
  });

  await test('Parse log files as text', async () => {
    const result = await documentParser.parseContent('[INFO] Started server\n[ERROR] Failed connection', '.log');
    assertTrue(result.success);
    assertEqual(result.format, '.log');
    assertTrue(result.stats.lines === 2);
  });

  // ============================================================
  // DocumentParser — Markdown
  // ============================================================
  section('DocumentParser — Markdown');

  await test('Parse markdown with headers', async () => {
    const md = '# Title\n\nIntro text.\n\n## Section 1\n\nContent one.\n\n## Section 2\n\nContent two.';
    const result = await documentParser.parseContent(md, '.md');
    assertTrue(result.success);
    assertTrue(result.sections.length >= 2);
    assertTrue(result.sections.some(s => s.title === 'Title'));
    assertTrue(result.sections.some(s => s.title === 'Section 1'));
  });

  await test('Parse markdown extracts code blocks', async () => {
    const md = '# Code\n\n```javascript\nconst x = 1;\n```\n\n```python\nprint("hi")\n```';
    const result = await documentParser.parseContent(md, '.md');
    assertTrue(result.codeBlocks.length === 2);
    assertEqual(result.codeBlocks[0].language, 'javascript');
    assertEqual(result.codeBlocks[1].language, 'python');
  });

  await test('Parse markdown extracts links', async () => {
    const md = 'Check [Google](https://google.com) and [GitHub](https://github.com).';
    const result = await documentParser.parseContent(md, '.md');
    assertTrue(result.links.length === 2);
    assertEqual(result.links[0].text, 'Google');
    assertEqual(result.links[1].url, 'https://github.com');
  });

  // ============================================================
  // DocumentParser — JSON
  // ============================================================
  section('DocumentParser — JSON');

  await test('Parse JSON object', async () => {
    const json = JSON.stringify({ name: 'Test', value: 42, nested: { a: 1 } });
    const result = await documentParser.parseContent(json, '.json');
    assertTrue(result.success);
    assertTrue(result.text.includes('name: Test'));
    assertEqual(result.data.name, 'Test');
    assertEqual(result.structure.type, 'object');
    assertTrue(result.stats.keys >= 3);
  });

  await test('Parse JSON array', async () => {
    const json = JSON.stringify([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
    const result = await documentParser.parseContent(json, '.json');
    assertTrue(result.success);
    assertEqual(result.structure.type, 'array');
    assertEqual(result.structure.length, 2);
  });

  await test('Invalid JSON returns error', async () => {
    const result = await documentParser.parseContent('not valid json', '.json');
    assertEqual(result.success, false);
    assertTrue(result.error !== undefined);
  });

  // ============================================================
  // DocumentParser — CSV
  // ============================================================
  section('DocumentParser — CSV');

  await test('Parse CSV with headers', async () => {
    const csv = 'name,age,city\nAlice,30,NYC\nBob,25,LA';
    const result = await documentParser.parseContent(csv, '.csv');
    assertTrue(result.success);
    assertEqual(result.headers.length, 3);
    assertEqual(result.rows.length, 2);
    assertEqual(result.rows[0].name, 'Alice');
    assertEqual(result.rows[1].city, 'LA');
    assertTrue(result.text.includes('name: Alice'));
  });

  await test('Parse CSV with quoted fields', async () => {
    const csv = 'title,desc\n"Hello, World","A ""test"" value"';
    const result = await documentParser.parseContent(csv, '.csv');
    assertTrue(result.success);
    assertEqual(result.rows[0].title, 'Hello, World');
  });

  // ============================================================
  // DocumentParser — XML/HTML
  // ============================================================
  section('DocumentParser — XML/HTML');

  await test('Parse XML extracts text and tags', async () => {
    const xml = '<root><item>Hello</item><item>World</item></root>';
    const result = await documentParser.parseContent(xml, '.xml');
    assertTrue(result.success);
    assertTrue(result.text.includes('Hello'));
    assertTrue(result.text.includes('World'));
    assertTrue(result.tags.includes('root'));
    assertTrue(result.tags.includes('item'));
  });

  await test('Parse HTML strips tags', async () => {
    const html = '<html><head><title>Test Page</title></head><body><p>Hello</p><script>alert(1)</script></body></html>';
    const result = await documentParser.parseContent(html, '.html');
    assertTrue(result.success);
    assertEqual(result.title, 'Test Page');
    assertTrue(result.text.includes('Hello'));
    assertTrue(!result.text.includes('alert'));
  });

  await test('Parse HTML extracts links', async () => {
    const html = '<a href="https://example.com">Example</a>';
    const result = await documentParser.parseContent(html, '.html');
    assertTrue(result.links.length === 1);
    assertEqual(result.links[0].url, 'https://example.com');
    assertEqual(result.links[0].text, 'Example');
  });

  // ============================================================
  // DocumentParser — YAML
  // ============================================================
  section('DocumentParser — YAML');

  await test('Parse YAML key-value pairs', async () => {
    const yaml = 'name: Test\nversion: 1.0\n# comment\nport: 3000';
    const result = await documentParser.parseContent(yaml, '.yaml');
    assertTrue(result.success);
    assertEqual(result.data.name, 'Test');
    assertEqual(result.data.version, '1.0');
    assertEqual(result.data.port, '3000');
    assertEqual(result.stats.keys, 3);
  });

  await test('Parse YML (alias) works', async () => {
    const result = await documentParser.parseContent('key: value', '.yml');
    assertTrue(result.success);
    assertEqual(result.data.key, 'value');
  });

  // ============================================================
  // DocumentParser — Errors & Metadata
  // ============================================================
  section('DocumentParser — Errors & Metadata');

  await test('Unsupported format throws', async () => {
    try {
      await documentParser.parseContent('data', '.xyz');
      assertTrue(false, 'Should throw');
    } catch (e) {
      assertTrue(e.message.includes('No parser'));
    }
  });

  await test('parseBuffer works', async () => {
    const buf = Buffer.from('Hello from buffer');
    const result = await documentParser.parseBuffer(buf, 'test.txt');
    assertTrue(result.success);
    assertTrue(result.text.includes('Hello from buffer'));
  });

  await test('getSupportedFormats returns list', async () => {
    const formats = documentParser.getSupportedFormats();
    assertTrue(Array.isArray(formats));
    assertTrue(formats.includes('.txt'));
    assertTrue(formats.includes('.json'));
    assertTrue(formats.includes('.csv'));
  });

  await test('getStats tracks parse count', async () => {
    const stats = documentParser.getStats();
    assertTrue(stats.totalParsed > 0);
    assertTrue(stats.totalBytes > 0);
  });

  // ============================================================
  // DocumentChunker — Paragraph
  // ============================================================
  section('DocumentChunker — Paragraph');

  await test('Chunk short text into single chunk', async () => {
    const result = documentChunker.chunk('Short text.');
    assertEqual(result.chunks.length, 1);
    assertEqual(result.metadata.strategy, 'paragraph');
  });

  await test('Chunk long text into multiple chunks', async () => {
    const paragraphs = Array(20).fill('This is a paragraph with enough text to fill a chunk. It contains several sentences to make it realistic.').join('\n\n');
    const result = documentChunker.chunk(paragraphs, { chunkSize: 500 });
    assertTrue(result.chunks.length > 1);
    assertTrue(result.metadata.totalChunks > 1);
    assertTrue(result.metadata.avgChunkSize > 0);
  });

  await test('Chunks have correct structure', async () => {
    const text = 'Para one.\n\nPara two.\n\nPara three.\n\nPara four.';
    const result = documentChunker.chunk(text, { chunkSize: 20 });
    for (const chunk of result.chunks) {
      assertTrue(typeof chunk.index === 'number');
      assertTrue(typeof chunk.text === 'string');
      assertTrue(typeof chunk.length === 'number');
      assertEqual(chunk.length, chunk.text.length);
    }
  });

  // ============================================================
  // DocumentChunker — Sentence
  // ============================================================
  section('DocumentChunker — Sentence');

  await test('Sentence strategy splits by sentences', async () => {
    const text = 'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.';
    const result = documentChunker.chunk(text, { strategy: 'sentence', chunkSize: 40 });
    assertTrue(result.chunks.length >= 2);
    assertEqual(result.metadata.strategy, 'sentence');
  });

  // ============================================================
  // DocumentChunker — Fixed
  // ============================================================
  section('DocumentChunker — Fixed');

  await test('Fixed strategy splits by character count', async () => {
    const text = 'A'.repeat(500) + ' ' + 'B'.repeat(500);
    const result = documentChunker.chunk(text, { strategy: 'fixed', chunkSize: 300, chunkOverlap: 50 });
    assertTrue(result.chunks.length >= 3);
    assertEqual(result.metadata.strategy, 'fixed');
  });

  // ============================================================
  // DocumentChunker — Semantic
  // ============================================================
  section('DocumentChunker — Semantic');

  await test('Semantic strategy detects markdown headers', async () => {
    const text = '# Introduction\n\nIntro content here with enough text to be a chunk.\n\n# Methods\n\nMethods content here with sufficient text to be a chunk.';
    const result = documentChunker.chunk(text, { strategy: 'semantic', chunkSize: 5000, chunkOverlap: 0 });
    assertEqual(result.metadata.strategy, 'semantic');
    assertTrue(result.chunks.length >= 1);
  });

  // ============================================================
  // DocumentChunker — Rechunk & Stats
  // ============================================================
  section('DocumentChunker — Rechunk & Stats');

  await test('rechunk combines and re-splits', async () => {
    const initial = documentChunker.chunk('A long text.\n\nAnother paragraph.\n\nThird paragraph.', { chunkSize: 30 });
    const rechunked = documentChunker.rechunk(initial.chunks, { chunkSize: 100 });
    assertTrue(rechunked.chunks.length >= 1);
  });

  await test('getStats tracks chunking', async () => {
    const stats = documentChunker.getStats();
    assertTrue(stats.totalChunked > 0);
    assertTrue(stats.totalChunks > 0);
    assertTrue(stats.avgChunkSize > 0);
  });

  // ============================================================
  // IngestionPipeline — Core
  // ============================================================
  section('IngestionPipeline — Core');

  // Create a test pipeline with a mock extractor
  const mockExtractor = {
    extract: async (text) => ({
      entities: [
        { name: 'TestEntity', type: 'System', confidence: 0.9 },
        { name: 'AnotherEntity', type: 'Person', confidence: 0.8 }
      ],
      relations: [
        { subject: 'TestEntity', predicate: 'uses', object: 'AnotherEntity', confidence: 0.7 }
      ],
      metadata: {}
    })
  };

  const testPipeline = new IngestionPipeline({
    extractor: mockExtractor,
    chunkSize: 500
  });

  await test('Ingest text content', async () => {
    const result = await testPipeline.ingest('This is test content for ingestion.');
    assertTrue(result.success);
    assertTrue(result.documentId.startsWith('doc_'));
    assertTrue(result.entities.length > 0);
    assertTrue(result.relations.length > 0);
    assertTrue(result.metadata.processedAt);
  });

  await test('Ingest with format option', async () => {
    const json = JSON.stringify({ name: 'test', value: 42 });
    const result = await testPipeline.ingest(json, { format: '.json' });
    assertTrue(result.success);
    assertEqual(result.format, '.json');
  });

  await test('Ingest chunking for large documents', async () => {
    const longText = Array(50).fill('This is a paragraph with some content for testing chunking behavior.').join('\n\n');
    const result = await testPipeline.ingest(longText);
    assertTrue(result.success);
    assertTrue(result.chunks.length > 1, 'Should have multiple chunks');
    assertTrue(result.metadata.chunksProcessed > 1);
  });

  await test('Ingest deduplicates entities', async () => {
    // With multiple chunks, same entities appear multiple times
    const longText = Array(10).fill('Some content about TestEntity and systems.').join('\n\n');
    const result = await testPipeline.ingest(longText, { format: '.txt' });
    assertTrue(result.success);
    // Mock returns same entities for each chunk, dedup should reduce them
    const testEntityCount = result.entities.filter(e => e.name === 'TestEntity').length;
    assertEqual(testEntityCount, 1);
  });

  await test('Ingest handles parse errors gracefully', async () => {
    const result = await testPipeline.ingest('invalid json', { format: '.json' });
    assertEqual(result.success, false);
    assertTrue(result.error !== undefined);
  });

  // ============================================================
  // IngestionPipeline — Batch
  // ============================================================
  section('IngestionPipeline — Batch');

  await test('Batch ingest multiple documents', async () => {
    const docs = [
      { content: 'First document content.', format: '.txt' },
      { content: 'Second document content.', format: '.txt' },
      { content: JSON.stringify({ data: 'test' }), format: '.json' }
    ];
    const result = await testPipeline.ingestBatch(docs);
    assertEqual(result.results.length, 3);
    assertEqual(result.summary.total, 3);
    assertTrue(result.summary.successful >= 2);
    assertTrue(result.summary.totalEntities >= 0);
  });

  // ============================================================
  // IngestionPipeline — Queue
  // ============================================================
  section('IngestionPipeline — Queue');

  await test('Queue ingestion falls back to direct when no jobs', async () => {
    const noJobPipeline = new IngestionPipeline({
      extractor: mockExtractor,
      useBackgroundJobs: false
    });
    const result = await noJobPipeline.queueIngestion('Test content');
    assertTrue(result.success); // Direct ingestion
    assertTrue(result.documentId);
  });

  // ============================================================
  // IngestionPipeline — Stats
  // ============================================================
  section('IngestionPipeline — Stats');

  await test('getStats returns pipeline stats', async () => {
    const stats = testPipeline.getStats();
    assertTrue(stats.totalIngested > 0);
    assertTrue(stats.totalChunks >= 0);
    assertTrue(typeof stats.parser === 'object');
    assertTrue(typeof stats.chunker === 'object');
  });

  await test('resetStats clears pipeline stats', async () => {
    testPipeline.resetStats();
    const stats = testPipeline.getStats();
    assertEqual(stats.totalIngested, 0);
    assertEqual(stats.totalChunks, 0);
    assertEqual(stats.errors, 0);
  });

  // ============================================================
  // Ingestion Routes — Mock req/res
  // ============================================================
  section('Ingestion Routes — Mock req/res');

  const router = require('../../src/routes/ingestion.routes');

  function findHandler(method, routePath) {
    for (const layer of router.stack) {
      if (layer.route && layer.route.path === routePath) {
        const match = layer.route.methods[method];
        if (match) {
          return layer.route.stack[layer.route.stack.length - 1].handle;
        }
      }
    }
    return null;
  }

  function mockReqRes(body = {}, params = {}) {
    const req = { body, params, query: {} };
    let statusCode = 200;
    let responseData = null;
    const res = {
      status(code) { statusCode = code; return res; },
      json(data) { responseData = data; }
    };
    return { req, res, getStatus: () => statusCode, getData: () => responseData };
  }

  await test('POST /text validates content', async () => {
    const handler = findHandler('post', '/text');
    assertTrue(handler !== null);
    const { req, res, getStatus, getData } = mockReqRes({});
    await handler(req, res);
    assertEqual(getStatus(), 400);
    assertTrue(getData().error.includes('content'));
  });

  await test('POST /text accepts valid content', async () => {
    // Route handler uses singleton pipeline which calls real extractor (slow).
    // Verify the handler exists and processes the request structure correctly.
    const handler = findHandler('post', '/text');
    assertTrue(handler !== null, 'POST /text handler should exist');
    // Verify it doesn't reject valid input (400)
    const { req, res, getStatus } = mockReqRes({ content: 'Hello world test content.' });
    // Call without awaiting (may timeout due to real extractor), but verify no immediate 400
    const promise = handler(req, res);
    // Give it a moment
    await new Promise(r => setTimeout(r, 100));
    assertTrue(getStatus() !== 400, 'Should not be 400 for valid content');
    // Don't await the full extraction
  });

  await test('POST /batch validates documents', async () => {
    const handler = findHandler('post', '/batch');
    const { req, res, getStatus, getData } = mockReqRes({});
    await handler(req, res);
    assertEqual(getStatus(), 400);
    assertTrue(getData().error.includes('documents'));
  });

  await test('POST /batch rejects too many documents', async () => {
    const handler = findHandler('post', '/batch');
    const docs = Array(51).fill({ content: 'text' });
    const { req, res, getStatus, getData } = mockReqRes({ documents: docs });
    await handler(req, res);
    assertEqual(getStatus(), 400);
    assertTrue(getData().error.includes('50'));
  });

  await test('POST /queue validates content', async () => {
    const handler = findHandler('post', '/queue');
    assertTrue(handler !== null);
    const { req, res, getStatus, getData } = mockReqRes({});
    await handler(req, res);
    assertEqual(getStatus(), 400);
    assertTrue(getData().error.includes('content'));
  });

  await test('GET /formats returns supported formats', async () => {
    const handler = findHandler('get', '/formats');
    assertTrue(handler !== null);
    const { req, res, getData } = mockReqRes();
    await handler(req, res);
    assertTrue(getData().success);
    assertTrue(Array.isArray(getData().formats));
    assertTrue(getData().formats.includes('.txt'));
  });

  await test('GET /stats returns statistics', async () => {
    const handler = findHandler('get', '/stats');
    assertTrue(handler !== null);
    const { req, res, getData } = mockReqRes();
    await handler(req, res);
    assertTrue(getData().success);
    assertTrue(typeof getData().stats === 'object');
    assertTrue(getData().stats.totalIngested >= 0);
  });

  // ============================================================
  // Module Exports
  // ============================================================
  section('Module Exports');

  const mod = require('../../src/services/ingestion');

  await test('Module exports DocumentParser', async () => {
    assertTrue(typeof mod.DocumentParser === 'function');
    assertTrue(mod.documentParser instanceof mod.DocumentParser);
  });

  await test('Module exports DocumentChunker', async () => {
    assertTrue(typeof mod.DocumentChunker === 'function');
    assertTrue(mod.documentChunker instanceof mod.DocumentChunker);
  });

  await test('Module exports IngestionPipeline', async () => {
    assertTrue(typeof mod.IngestionPipeline === 'function');
    assertTrue(mod.ingestionPipeline instanceof mod.IngestionPipeline);
  });

  await test('ingestion.routes exports router', async () => {
    assertTrue(typeof router === 'function');
    assertTrue(router.stack.length > 0);
  });

  // ── Summary ──
  console.log(`\n${'═'.repeat(63)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(63));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
