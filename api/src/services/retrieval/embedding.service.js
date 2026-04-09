/**
 * Embedding Service
 *
 * Provides text embedding functionality for hybrid search.
 * Integrates with TEI (Text Embeddings Inference) service.
 *
 * Features:
 * - Single text embedding
 * - Batch embedding with chunking
 * - Caching (optional)
 * - Fallback handling
 *
 * @module services/retrieval/embedding.service
 */

const axios = require('axios');

const TEI_URL = process.env.TEI_URL || 'http://localhost:8081';
const VECTOR_SIZE = parseInt(process.env.VECTOR_SIZE) || 1024;
const MAX_BATCH_SIZE = parseInt(process.env.EMBEDDING_BATCH_SIZE) || 32;
const EMBEDDING_TIMEOUT = parseInt(process.env.EMBEDDING_TIMEOUT) || 30000;
const MAX_RETRIES = parseInt(process.env.EMBEDDING_MAX_RETRIES) || 3;
const RETRY_DELAY_MS = parseInt(process.env.EMBEDDING_RETRY_DELAY_MS) || 1000;
const BATCH_DELAY_MS = parseInt(process.env.EMBEDDING_BATCH_DELAY_MS) || 100;

/**
 * Sleep utility for delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * EmbeddingService class
 */
class EmbeddingService {
  /**
   * @param {Object} config - Service configuration
   */
  constructor(config = {}) {
    this.teiUrl = config.teiUrl || TEI_URL;
    this.vectorSize = config.vectorSize || VECTOR_SIZE;
    this.maxBatchSize = config.maxBatchSize || MAX_BATCH_SIZE;
    this.timeout = config.timeout || EMBEDDING_TIMEOUT;
    this.maxRetries = config.maxRetries || MAX_RETRIES;
    this.retryDelayMs = config.retryDelayMs || RETRY_DELAY_MS;
    this.batchDelayMs = config.batchDelayMs || BATCH_DELAY_MS;
    this.cache = config.enableCache ? new Map() : null;
    this.cacheMaxSize = config.cacheMaxSize || 1000;
  }

  /**
   * Process a single batch with exponential backoff retry
   * @param {string[]} batch - Batch of texts to embed
   * @returns {Promise<number[][]>} - Array of embedding vectors
   * @private
   */
  async _processWithRetry(batch) {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await axios.post(
          `${this.teiUrl}/embed`,
          {
            inputs: batch,
            normalize: true,
            truncate: true
          },
          { timeout: this.timeout }
        );
        return response.data;
      } catch (error) {
        if (attempt === this.maxRetries) {
          console.error(`[EmbeddingService] All ${this.maxRetries} retry attempts failed for batch of ${batch.length} texts`);
          throw error;
        }

        // Exponential backoff: 2^attempt * baseDelay
        const delay = Math.pow(2, attempt) * this.retryDelayMs;
        console.warn(`[EmbeddingService] Attempt ${attempt}/${this.maxRetries} failed: ${error.message}. Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  /**
   * Generate embedding for a single text
   * @param {string} text - Text to embed
   * @returns {Promise<Object>} Embedding result
   */
  async embed(text) {
    if (!text || typeof text !== 'string') {
      return {
        embedding: new Array(this.vectorSize).fill(0),
        error: 'Invalid input text'
      };
    }

    // Check cache
    if (this.cache) {
      const cacheKey = this._getCacheKey(text);
      if (this.cache.has(cacheKey)) {
        return {
          embedding: this.cache.get(cacheKey),
          cached: true
        };
      }
    }

    try {
      const response = await axios.post(
        `${this.teiUrl}/embed`,
        {
          inputs: [text],
          normalize: true,
          truncate: true
        },
        { timeout: this.timeout }
      );

      const embedding = response.data[0];

      // Update cache
      if (this.cache && embedding) {
        this._addToCache(text, embedding);
      }

      return {
        embedding,
        vectorSize: embedding?.length || 0
      };
    } catch (error) {
      console.error('Embedding error:', error.message);
      return {
        embedding: null,
        error: error.message
      };
    }
  }

  /**
   * Generate embeddings for multiple texts with batching, retry, and progress tracking
   * @param {string[]} texts - Array of texts to embed
   * @param {Object} options - Optional configuration
   * @param {Object} options.job - BullMQ job for progress tracking
   * @param {Function} options.onProgress - Progress callback (current, total, percent)
   * @returns {Promise<Object>} Batch embedding result
   */
  async embedBatch(texts, options = {}) {
    if (!Array.isArray(texts) || texts.length === 0) {
      return {
        embeddings: [],
        error: 'Invalid input texts'
      };
    }

    const { job, onProgress } = options;

    // Filter and validate texts
    const validTexts = texts.map((t, i) => ({
      index: i,
      text: typeof t === 'string' ? t : '',
      valid: typeof t === 'string' && t.length > 0
    }));

    const textsToEmbed = validTexts
      .filter(t => t.valid)
      .map(t => t.text);

    if (textsToEmbed.length === 0) {
      return {
        embeddings: texts.map(() => new Array(this.vectorSize).fill(0)),
        error: 'No valid texts to embed'
      };
    }

    // Split into batches
    const batches = [];
    for (let i = 0; i < textsToEmbed.length; i += this.maxBatchSize) {
      batches.push(textsToEmbed.slice(i, i + this.maxBatchSize));
    }

    const totalBatches = batches.length;
    console.log(`[EmbeddingService] Starting: ${textsToEmbed.length} texts in ${totalBatches} batches (batch size: ${this.maxBatchSize})`);

    // Process batches with retry
    const allEmbeddings = [];
    let successBatches = 0;
    let failedBatches = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`[EmbeddingService] Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} texts)`);

      try {
        const embeddings = await this._processWithRetry(batch);
        allEmbeddings.push(...embeddings);
        successBatches++;

        // Update progress
        const progressPercent = Math.round(((batchIndex + 1) / totalBatches) * 100);

        if (job && typeof job.updateProgress === 'function') {
          await job.updateProgress(progressPercent);
        }

        if (onProgress && typeof onProgress === 'function') {
          onProgress(batchIndex + 1, totalBatches, progressPercent);
        }

        // Delay between batches
        if (batchIndex < batches.length - 1) {
          await sleep(this.batchDelayMs);
        }
      } catch (error) {
        console.error(`[EmbeddingService] Failed to process batch ${batchIndex + 1}/${totalBatches}:`, error.message);
        // Add null placeholders for failed batch
        allEmbeddings.push(...new Array(batch.length).fill(null));
        failedBatches++;
      }
    }

    console.log(`[EmbeddingService] Completed: ${successBatches}/${totalBatches} batches succeeded, ${failedBatches} failed`);

    // Map embeddings back to original indices
    const embeddings = new Array(texts.length).fill(null);
    let embeddingIndex = 0;

    validTexts.forEach(t => {
      if (t.valid) {
        embeddings[t.index] = allEmbeddings[embeddingIndex++];
      } else {
        embeddings[t.index] = new Array(this.vectorSize).fill(0);
      }
    });

    return {
      embeddings,
      count: allEmbeddings.filter(e => e !== null).length,
      vectorSize: allEmbeddings.find(e => e !== null)?.length || this.vectorSize,
      batches: {
        total: totalBatches,
        success: successBatches,
        failed: failedBatches
      }
    };
  }

  /**
   * Check if service is available
   * @returns {Promise<boolean>} Service health status
   */
  async isHealthy() {
    try {
      const response = await axios.get(`${this.teiUrl}/health`, {
        timeout: 5000
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Get service info
   * @returns {Promise<Object>} Service information
   */
  async getInfo() {
    try {
      const response = await axios.get(`${this.teiUrl}/info`, {
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      return {
        error: error.message,
        url: this.teiUrl
      };
    }
  }

  /**
   * Generate cache key from text
   * @private
   */
  _getCacheKey(text) {
    // Simple hash for cache key
    let hash = 0;
    for (let i = 0; i < Math.min(text.length, 1000); i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `emb_${hash}_${text.length}`;
  }

  /**
   * Add embedding to cache with LRU eviction
   * @private
   */
  _addToCache(text, embedding) {
    const key = this._getCacheKey(text);

    // Evict oldest if cache is full
    if (this.cache.size >= this.cacheMaxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, embedding);
  }

  /**
   * Clear embedding cache
   */
  clearCache() {
    if (this.cache) {
      this.cache.clear();
    }
  }
}

/**
 * Create embedding service instance
 */
function createEmbeddingService(config = {}) {
  return new EmbeddingService(config);
}

/**
 * Default instance
 */
const defaultEmbeddingService = new EmbeddingService();

module.exports = {
  EmbeddingService,
  createEmbeddingService,
  defaultEmbeddingService
};
