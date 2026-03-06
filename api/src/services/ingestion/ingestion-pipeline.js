/**
 * Ingestion Pipeline
 * Complete pipeline for document ingestion and extraction
 *
 * Flow: Parse → Chunk → Extract → Deduplicate → Return
 *
 * @module services/ingestion/ingestion-pipeline
 */

const { documentParser } = require('./document-parser');
const { documentChunker } = require('./document-chunker');

class IngestionPipeline {
  constructor(options = {}) {
    this.options = {
      chunkBeforeExtraction: options.chunkBeforeExtraction !== false,
      chunkSize: options.chunkSize || 1000,
      chunkStrategy: options.chunkStrategy || 'paragraph',
      extractionMode: options.extractionMode || 'hybrid',
      updateGraph: options.updateGraph !== false,
      useBackgroundJobs: options.useBackgroundJobs || false,
      ...options
    };

    this.parser = options.parser || documentParser;
    this.chunker = options.chunker || documentChunker;

    // Lazy-loaded to avoid circular deps
    this._extractor = options.extractor || null;
    this._jobQueue = options.jobQueue || null;
    this._wsService = options.wsService || null;

    this.stats = {
      totalIngested: 0,
      totalChunks: 0,
      totalEntities: 0,
      totalRelations: 0,
      byFormat: {},
      errors: 0
    };
  }

  _getExtractor() {
    if (!this._extractor) {
      try {
        const { unifiedExtractor } = require('../extraction');
        this._extractor = unifiedExtractor;
      } catch {
        this._extractor = { extract: async (text) => ({ entities: [], relations: [], metadata: {} }) };
      }
    }
    return this._extractor;
  }

  _getJobQueue() {
    if (!this._jobQueue) {
      try {
        const { jobQueueService } = require('../jobs');
        this._jobQueue = jobQueueService;
      } catch {
        this._jobQueue = null;
      }
    }
    return this._jobQueue;
  }

  _getWsService() {
    if (!this._wsService) {
      try {
        const { websocketService } = require('../websocket');
        this._wsService = websocketService;
      } catch {
        this._wsService = null;
      }
    }
    return this._wsService;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════

  async ingest(content, options = {}) {
    const format = options.format || '.txt';
    const metadata = options.metadata || {};
    const clientId = options.clientId;

    this.stats.totalIngested++;
    this.stats.byFormat[format] = (this.stats.byFormat[format] || 0) + 1;

    const result = {
      success: false,
      documentId: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      format,
      chunks: [],
      entities: [],
      relations: [],
      metadata: {}
    };

    try {
      // Step 1: Parse
      this._notify(clientId, 'progress', { step: 'parsing', progress: 10 });
      const parsed = await this.parser.parseContent(content, format, metadata);

      if (!parsed.success) {
        throw new Error(parsed.error || 'Parse failed');
      }

      // Step 2: Chunk
      this._notify(clientId, 'progress', { step: 'chunking', progress: 30 });
      let chunks;

      if (this.options.chunkBeforeExtraction && parsed.text.length > this.options.chunkSize) {
        const chunked = this.chunker.chunk(parsed.text, {
          chunkSize: this.options.chunkSize,
          strategy: this.options.chunkStrategy
        });
        chunks = chunked.chunks;
      } else {
        chunks = [{ index: 0, text: parsed.text, length: parsed.text.length }];
      }

      result.chunks = chunks.map(c => ({ index: c.index, length: c.length }));
      this.stats.totalChunks += chunks.length;

      // Step 3: Extract from each chunk
      this._notify(clientId, 'progress', { step: 'extracting', progress: 50 });
      const extractor = this._getExtractor();

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const progress = 50 + Math.round((i / chunks.length) * 40);
        this._notify(clientId, 'progress', {
          step: 'extracting',
          chunk: i + 1,
          totalChunks: chunks.length,
          progress
        });

        const extraction = await extractor.extract(chunk.text, {
          domain: options.domain,
          verify: false
        });

        result.entities.push(...(extraction.entities || []));
        result.relations.push(...(extraction.relations || []));
      }

      // Deduplicate
      result.entities = this._deduplicateEntities(result.entities);
      result.relations = this._deduplicateRelations(result.relations);

      this.stats.totalEntities += result.entities.length;
      this.stats.totalRelations += result.relations.length;

      // Step 4: Finalize
      this._notify(clientId, 'progress', { step: 'finalizing', progress: 95 });

      result.success = true;
      result.metadata = {
        originalLength: content.length,
        chunksProcessed: chunks.length,
        entitiesExtracted: result.entities.length,
        relationsExtracted: result.relations.length,
        processedAt: new Date().toISOString()
      };

      this._notify(clientId, 'complete', { documentId: result.documentId, result });
      return result;

    } catch (error) {
      this.stats.errors++;
      result.error = error.message;
      this._notify(clientId, 'error', { documentId: result.documentId, error: error.message });
      return result;
    }
  }

  async ingestFile(filePath, options = {}) {
    const parsed = await this.parser.parseFile(filePath);

    if (!parsed.success) {
      return { success: false, error: parsed.error, filePath };
    }

    return this.ingest(parsed.text, {
      ...options,
      format: parsed.format,
      metadata: { ...options.metadata, filePath }
    });
  }

  async ingestBatch(documents, options = {}) {
    const results = [];
    const clientId = options.clientId;
    const total = documents.length;

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];

      this._notify(clientId, 'batch_progress', {
        current: i + 1,
        total,
        percentage: Math.round(((i + 1) / total) * 100)
      });

      const result = await this.ingest(doc.content, {
        format: doc.format || '.txt',
        domain: doc.domain || options.domain,
        metadata: doc.metadata
      });

      results.push(result);
    }

    const summary = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      totalEntities: results.reduce((sum, r) => sum + (r.entities?.length || 0), 0),
      totalRelations: results.reduce((sum, r) => sum + (r.relations?.length || 0), 0)
    };

    this._notify(clientId, 'batch_complete', { summary });
    return { results, summary };
  }

  async queueIngestion(content, options = {}) {
    const jobQueue = this._getJobQueue();
    if (!this.options.useBackgroundJobs || !jobQueue) {
      return this.ingest(content, options);
    }

    const job = await jobQueue.addJob('extraction', {
      type: 'ingestion',
      content,
      options
    });

    return { queued: true, jobId: job.id, queue: job.queue };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  _deduplicateEntities(entities) {
    const seen = new Map();
    for (const entity of entities) {
      const key = (entity.name || '').toLowerCase();
      if (!key) continue;
      const existing = seen.get(key);
      if (!existing || (entity.confidence || 0) > (existing.confidence || 0)) {
        seen.set(key, entity);
      }
    }
    return [...seen.values()];
  }

  _deduplicateRelations(relations) {
    const seen = new Map();
    for (const rel of relations) {
      const key = `${rel.subject}|${rel.predicate}|${rel.object}`.toLowerCase();
      const existing = seen.get(key);
      if (!existing || (rel.confidence || 0) > (existing.confidence || 0)) {
        seen.set(key, rel);
      }
    }
    return [...seen.values()];
  }

  _notify(clientId, type, data) {
    if (!clientId) return;
    const ws = this._getWsService();
    if (!ws) return;

    try {
      ws.sendToClient(clientId, {
        type: `ingestion_${type}`,
        ...data,
        timestamp: Date.now()
      });
    } catch {
      // Ignore notification errors
    }
  }

  getStats() {
    return {
      ...this.stats,
      parser: this.parser.getStats(),
      chunker: this.chunker.getStats()
    };
  }

  resetStats() {
    this.stats = {
      totalIngested: 0,
      totalChunks: 0,
      totalEntities: 0,
      totalRelations: 0,
      byFormat: {},
      errors: 0
    };
  }
}

const ingestionPipeline = new IngestionPipeline();

module.exports = {
  IngestionPipeline,
  ingestionPipeline
};
