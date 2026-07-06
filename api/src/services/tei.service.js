const axios = require('axios');

// Configuration from environment
const TEI_URL = process.env.TEI_URL || 'http://tei:80';
const TEI_BATCH_SIZE = parseInt(process.env.TEI_BATCH_SIZE) || 50;
const TEI_MAX_RETRIES = parseInt(process.env.TEI_MAX_RETRIES) || 3;
const TEI_RETRY_DELAY_MS = parseInt(process.env.TEI_RETRY_DELAY_MS) || 1000;
const TEI_BATCH_DELAY_MS = parseInt(process.env.TEI_BATCH_DELAY_MS) || 100;
const TEI_TIMEOUT_MS = parseInt(process.env.TEI_TIMEOUT_MS) || 30000;

/**
 * Sleep utility for delays between retries/batches
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class TeiService {
    constructor() {
        this.url = TEI_URL;
        this.batchSize = TEI_BATCH_SIZE;
        this.maxRetries = TEI_MAX_RETRIES;
        this.retryDelayMs = TEI_RETRY_DELAY_MS;
        this.batchDelayMs = TEI_BATCH_DELAY_MS;
        this.timeout = TEI_TIMEOUT_MS;
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
                    `${this.url}/embed`,
                    {
                        inputs: batch,
                        normalize: true,
                        truncate: true
                    },
                    { timeout: this.timeout }
                );
                return response.data;
            } catch (error) {
                const isLastAttempt = attempt === this.maxRetries;

                if (isLastAttempt) {
                    console.error(`[TEI] All ${this.maxRetries} retry attempts failed for batch of ${batch.length} texts`);
                    throw error;
                }

                // Exponential backoff: 2^attempt * baseDelay (2s, 4s, 8s, ...)
                const delay = Math.pow(2, attempt) * this.retryDelayMs;
                console.warn(`[TEI] Attempt ${attempt}/${this.maxRetries} failed: ${error.message}. Retrying in ${delay}ms...`);
                await sleep(delay);
            }
        }
    }

    /**
     * Generates embeddings for a list of texts with batching and retry logic.
     * @param {string[]} texts - Array of texts to embed.
     * @param {Object} options - Optional configuration
     * @param {Object} options.job - BullMQ job for progress tracking
     * @param {Function} options.onProgress - Progress callback (current, total)
     * @returns {Promise<number[][]>} - Array of embedding vectors.
     */
    async getEmbeddings(texts, options = {}) {
        if (!texts || texts.length === 0) {
            return [];
        }

        const { job, onProgress } = options;
        const results = [];
        const totalBatches = Math.ceil(texts.length / this.batchSize);
        let processedBatches = 0;

        console.log(`[TEI] Starting embedding generation: ${texts.length} texts in ${totalBatches} batches (batch size: ${this.batchSize})`);

        for (let i = 0; i < texts.length; i += this.batchSize) {
            const batchIndex = Math.floor(i / this.batchSize) + 1;
            const batch = texts.slice(i, i + this.batchSize);

            console.log(`[TEI] Processing batch ${batchIndex}/${totalBatches} (${batch.length} texts)`);

            try {
                const embeddings = await this._processWithRetry(batch);
                results.push(...embeddings);
                processedBatches++;

                // Update progress
                const progressPercent = Math.round((processedBatches / totalBatches) * 100);

                if (job && typeof job.updateProgress === 'function') {
                    await job.updateProgress(progressPercent);
                }

                if (onProgress && typeof onProgress === 'function') {
                    onProgress(processedBatches, totalBatches, progressPercent);
                }

                // Delay between batches to avoid overloading TEI
                if (i + this.batchSize < texts.length) {
                    await sleep(this.batchDelayMs);
                }
            } catch (error) {
                console.error(`[TEI] Failed to process batch ${batchIndex}/${totalBatches}:`, error.message);
                // On failure, add null placeholders for this batch
                results.push(...new Array(batch.length).fill(null));
            }
        }

        const successCount = results.filter(r => r !== null).length;
        console.log(`[TEI] Completed: ${successCount}/${texts.length} texts embedded successfully`);

        return results;
    }

    /**
     * Generates embedding for a single text.
     * @param {string} text - Text to embed.
     * @returns {Promise<number[]>} - Embedding vector.
     */
    async getEmbedding(text) {
        const embeddings = await this.getEmbeddings([text]);
        return embeddings[0];
    }

    /**
     * Check if TEI service is healthy
     * @returns {Promise<boolean>}
     */
    async isHealthy() {
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const response = await axios.get(`${this.url}/health`, { timeout: 10000 });
                if (response.status === 200) return true;
            } catch {
                if (attempt === 2) return false;
                await sleep(1000);
            }
        }
        return false;
    }

    /**
     * Get TEI service info
     * @returns {Promise<Object>}
     */
    async getInfo() {
        try {
            const response = await axios.get(`${this.url}/info`, {
                timeout: 5000
            });
            return {
                ...response.data,
                batchSize: this.batchSize,
                maxRetries: this.maxRetries,
                retryDelayMs: this.retryDelayMs
            };
        } catch (error) {
            return {
                error: error.message,
                url: this.url
            };
        }
    }

    /**
     * Get current configuration
     * @returns {Object}
     */
    getConfig() {
        return {
            url: this.url,
            batchSize: this.batchSize,
            maxRetries: this.maxRetries,
            retryDelayMs: this.retryDelayMs,
            batchDelayMs: this.batchDelayMs,
            timeout: this.timeout
        };
    }
}

module.exports = new TeiService();
