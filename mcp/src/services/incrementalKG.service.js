/**
 * @fileoverview Frontend Service for Incremental Knowledge Graph Pipeline
 * @module services/incrementalKG
 * @version 1.0.0
 */

const API_BASE = '/api/v1/incremental-kg';

/**
 * Incremental KG API Service
 */
const incrementalKGService = {
  // ═══════════════════════════════════════════════════════════════════════════
  // ROUND MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start a new extraction round
   * @param {Object} config - Extraction configuration
   * @returns {Promise<Object>}
   */
  async startRound(config = {}) {
    const response = await fetch(`${API_BASE}/rounds/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  /**
   * Stop an active extraction round
   * @param {string} runId - Run identifier
   * @returns {Promise<Object>}
   */
  async stopRound(runId) {
    const response = await fetch(`${API_BASE}/rounds/${runId}/stop`, {
      method: 'POST'
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  /**
   * Get run status
   * @param {string} runId - Run identifier
   * @returns {Promise<Object>}
   */
  async getRunStatus(runId) {
    const response = await fetch(`${API_BASE}/rounds/${runId}/status`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  /**
   * Get all extraction rounds
   * @returns {Promise<Object>}
   */
  async getRounds() {
    const response = await fetch(`${API_BASE}/rounds`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  /**
   * Get statistics for a specific round
   * @param {number} roundNumber - Round number
   * @returns {Promise<Object>}
   */
  async getRoundStats(roundNumber) {
    const response = await fetch(`${API_BASE}/rounds/${roundNumber}/stats`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCUMENT PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Process text and extract entities
   * @param {string} text - Text to process
   * @param {Object} options - Processing options
   * @returns {Promise<Object>}
   */
  async processText(text, options = {}) {
    const response = await fetch(`${API_BASE}/process/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, ...options })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  /**
   * Process a document within an active run
   * @param {string} runId - Run ID
   * @param {Object} document - Document to process
   * @param {Object} options - Processing options
   * @returns {Promise<Object>}
   */
  async processDocument(runId, document, options = {}) {
    const response = await fetch(`${API_BASE}/process/document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, document, options })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  /**
   * Process multiple documents in batch
   * @param {string} runId - Run ID
   * @param {Object[]} documents - Documents to process
   * @param {Object} options - Processing options
   * @returns {Promise<Object>}
   */
  async processBatch(runId, documents, options = {}) {
    const response = await fetch(`${API_BASE}/process/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, documents, options })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GRAPH QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get entities from the knowledge graph
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>}
   */
  async getEntities(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`${API_BASE}/entities?${queryString}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  /**
   * Get relationships from the knowledge graph
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>}
   */
  async getRelationships(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`${API_BASE}/relationships?${queryString}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  /**
   * Get graph statistics
   * @returns {Promise<Object>}
   */
  async getGraphStats() {
    const response = await fetch(`${API_BASE}/graph/stats`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OVERALL STATISTICS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get overall pipeline statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    const response = await fetch(`${API_BASE}/stats`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP-BY-STEP PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extract entities only (step 1)
   * @param {string} text - Text to process
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>}
   */
  async extractEntitiesOnly(text, options = {}) {
    const response = await fetch(`${API_BASE}/process/extract-only`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, ...options })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  /**
   * Resolve entities against existing (step 2)
   * @param {Object[]} entities - Entities to resolve
   * @param {Object} options - Resolution options
   * @returns {Promise<Object>}
   */
  async resolveEntities(entities, options = {}) {
    const response = await fetch(`${API_BASE}/process/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entities, ...options })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  /**
   * Extract relationships (step 3)
   * @param {string} text - Original text
   * @param {Object[]} entities - Resolved entities
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>}
   */
  async extractRelationships(text, entities, options = {}) {
    const response = await fetch(`${API_BASE}/process/relationships`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, entities, ...options })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  /**
   * Store to graph (step 4)
   * @param {Object} data - Entities and relationships to store
   * @returns {Promise<Object>}
   */
  async storeToGraph(data) {
    const response = await fetch(`${API_BASE}/process/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    return result.data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GRAPH CONTEXT (for incremental visualization)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get existing graph context for new entities
   * @param {string[]} entityNames - Names of new entities to find connections for
   * @param {Object} options - Options (depth, limit)
   * @returns {Promise<Object>} - Existing nodes, relationships, and connections
   */
  async getGraphContext(entityNames, options = {}) {
    const response = await fetch(`${API_BASE}/graph/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityNames, ...options })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  /**
   * Get all existing graph data for visualization
   * @param {Object} params - Query parameters (limit, currentRound)
   * @returns {Promise<Object>} - Nodes, relationships with isNew/isExisting flags
   */
  async getExistingGraph(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`${API_BASE}/graph/existing?${queryString}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SSE STREAMING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to extraction events for a run
   * @param {string} runId - Run ID
   * @param {Object} handlers - Event handlers
   * @returns {EventSource}
   */
  subscribeToRun(runId, handlers = {}) {
    const eventSource = new EventSource(`${API_BASE}/stream/${runId}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'status':
            handlers.onStatus?.(data.data);
            break;
          case 'documentStarted':
            handlers.onDocumentStarted?.(data.data);
            break;
          case 'documentCompleted':
            handlers.onDocumentCompleted?.(data.data);
            break;
          case 'documentError':
            handlers.onDocumentError?.(data.data);
            break;
          case 'batchProgress':
            handlers.onBatchProgress?.(data.data);
            break;
          case 'roundCompleted':
            handlers.onRoundCompleted?.(data.data);
            eventSource.close();
            break;
        }
      } catch (e) {
        console.error('[IncrementalKG] Error parsing SSE event:', e);
      }
    };

    eventSource.onerror = (error) => {
      handlers.onError?.(error);
    };

    return eventSource;
  }
};

export default incrementalKGService;
