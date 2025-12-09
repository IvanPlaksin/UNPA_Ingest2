/**
 * @typedef {Object} IngestionItem
 * @property {string} id - Unique ID (e.g., ADO ID or Commit Hash)
 * @property {'work_item'|'file'|'commit'} type - Type of the item
 * @property {string} content - The raw text/code content
 * @property {Object} metadata - Source-specific metadata (author, date, url, etc.)
 * @property {Object} [context] - Hierarchy info (e.g., repo name, area path)
 */

/**
 * Interface that all data source adapters must implement.
 * @interface
 */
class SourceAdapter {
    /**
     * Streams items from the source based on the filter.
     * @param {Object} filter - Configuration for what to fetch (e.g., queryId, repoName)
     * @returns {AsyncIterator<IngestionItem>} Stream of ingestion items
     */
    async *fetchStream(filter) {
        throw new Error("Method 'fetchStream' must be implemented.");
    }

    /**
     * Validates that the adapter is correctly configured (e.g. connection check).
     * @returns {Promise<boolean>} True if healthy
     */
    async validateConfig() {
        throw new Error("Method 'validateConfig' must be implemented.");
    }
}

module.exports = { SourceAdapter };
