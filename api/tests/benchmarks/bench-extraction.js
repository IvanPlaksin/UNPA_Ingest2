/**
 * Extraction Pipeline Benchmarks
 *
 * Measures performance of:
 *   - Text chunking (different sizes and strategies)
 *   - Entity extraction (regex mode)
 *   - Full pipeline: chunk → extract
 *   - Batch extraction (multiple documents)
 */

const { BenchmarkRunner, generateText } = require('./benchmark-runner');
const { TextChunker } = require('../../src/services/chunking/text-chunker');
const { EntityExtractor } = require('../../src/services/extraction/entity-extractor');

async function run() {
  const runner = new BenchmarkRunner({ iterations: 50, warmup: 5 });

  // Prepare test data
  const text1KB = generateText(1);
  const text10KB = generateText(10);
  const text100KB = generateText(100);

  const chunker = new TextChunker();
  const chunkerSmall = new TextChunker({ maxTokens: 256, overlapTokens: 20 });
  const chunkerLarge = new TextChunker({ maxTokens: 1024, overlapTokens: 100 });
  const extractor = new EntityExtractor({ useRegex: true, useLLM: false });

  // ── Chunking benchmarks ──────────────────────────────────────────────────
  runner.category('Text Chunking');

  await runner.benchmark('Chunk 1KB (default 512 tokens)', () => {
    chunker.chunk(text1KB);
  });

  await runner.benchmark('Chunk 10KB (default 512 tokens)', () => {
    chunker.chunk(text10KB);
  });

  await runner.benchmark('Chunk 100KB (default 512 tokens)', () => {
    chunker.chunk(text100KB);
  });

  await runner.benchmark('Chunk 10KB (256 tokens, small)', () => {
    chunkerSmall.chunk(text10KB);
  });

  await runner.benchmark('Chunk 10KB (1024 tokens, large)', () => {
    chunkerLarge.chunk(text10KB);
  });

  await runner.benchmark('chunkForEmbedding 10KB', () => {
    chunker.chunkForEmbedding(text10KB);
  });

  await runner.benchmark('chunkForRAG 10KB', () => {
    chunker.chunkForRAG(text10KB);
  });

  // ── Entity Extraction benchmarks ─────────────────────────────────────────
  runner.category('Entity Extraction (Regex)');

  await runner.benchmark('Extract entities from 1KB', async () => {
    await extractor.extract(text1KB);
  });

  await runner.benchmark('Extract entities from 10KB', async () => {
    await extractor.extract(text10KB);
  });

  await runner.benchmark('Extract entities from 100KB', async () => {
    await extractor.extract(text100KB);
  }, { iterations: 20 });

  await runner.benchmark('extractWithRegex 10KB (sync)', () => {
    extractor.extractWithRegex(text10KB);
  });

  // ── Full pipeline: chunk → extract ───────────────────────────────────────
  runner.category('Full Pipeline: Chunk → Extract');

  await runner.benchmark('Pipeline 1KB', async () => {
    const chunks = chunker.chunk(text1KB);
    for (const chunk of chunks) {
      await extractor.extract(chunk.content);
    }
  });

  await runner.benchmark('Pipeline 10KB', async () => {
    const chunks = chunker.chunk(text10KB);
    for (const chunk of chunks) {
      await extractor.extract(chunk.content);
    }
  }, { iterations: 20 });

  await runner.benchmark('Pipeline 100KB', async () => {
    const chunks = chunker.chunk(text100KB);
    for (const chunk of chunks) {
      await extractor.extract(chunk.content);
    }
  }, { iterations: 10 });

  // ── Batch extraction ─────────────────────────────────────────────────────
  runner.category('Batch Extraction');

  const docs10 = Array.from({ length: 10 }, () => generateText(5));
  const docs50 = Array.from({ length: 50 }, () => generateText(2));

  await runner.benchmark('Batch: 10 docs × 5KB', async () => {
    for (const doc of docs10) {
      const chunks = chunker.chunk(doc);
      for (const chunk of chunks) {
        await extractor.extract(chunk.content);
      }
    }
  }, { iterations: 5 });

  await runner.benchmark('Batch: 50 docs × 2KB', async () => {
    for (const doc of docs50) {
      const chunks = chunker.chunk(doc);
      for (const chunk of chunks) {
        await extractor.extract(chunk.content);
      }
    }
  }, { iterations: 3 });

  // ── Output ───────────────────────────────────────────────────────────────
  runner.printSummary();
  return runner;
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = { run };
