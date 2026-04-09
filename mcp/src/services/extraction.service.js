/**
 * Unified Extraction Service
 * @module services/extraction
 *
 * Provides a single API interface for all text extraction operations.
 * Used by Pipeline Lab, Tuning Lab, and other components.
 */

import { API_BASE_URL } from '../config/api.config';

const BASE_URL = API_BASE_URL;

/**
 * Available LLM providers for extraction
 */
export const EXTRACTION_PROVIDERS = {
  OLLAMA: 'ollama',
  CLAUDE: 'claude',
  GEMINI: 'gemini'
};

/**
 * Extraction service class
 */
class ExtractionService {
  constructor() {
    this.activeProvider = null;
    this.abortController = null;
  }

  /**
   * Get all available providers with their status
   * @returns {Promise<Object>} Provider status map
   */
  async getProviders() {
    const response = await fetch(`${BASE_URL}/tuning/providers`);
    if (!response.ok) throw new Error('Failed to fetch providers');
    return response.json();
  }

  /**
   * Select active provider for extraction
   * @param {string} providerName - Provider name (ollama, claude, gemini)
   * @returns {Promise<Object>} Selection result
   */
  async selectProvider(providerName) {
    const response = await fetch(`${BASE_URL}/tuning/providers/${providerName}/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error('Failed to select provider');
    const result = await response.json();
    this.activeProvider = providerName;
    return result;
  }

  /**
   * Test a specific provider with sample text
   * @param {string} providerName - Provider name
   * @param {string} text - Test text
   * @returns {Promise<Object>} Test result with entities and relationships
   */
  async testProvider(providerName, text) {
    const response = await fetch(`${BASE_URL}/tuning/providers/${providerName}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!response.ok) throw new Error(`Provider test failed: ${response.statusText}`);
    return response.json();
  }

  /**
   * Extract entities from text using current or specified provider
   * @param {string} text - Text to analyze
   * @param {Object} options - Extraction options
   * @param {string} options.provider - Override active provider
   * @param {boolean} options.includeRelationships - Extract relationships (default: true)
   * @returns {Promise<Object>} Extraction result
   */
  async extract(text, options = {}) {
    const { provider, includeRelationships = true } = options;

    // Use tuning extract endpoint for single extraction
    const response = await fetch(`${BASE_URL}/tuning/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        provider: provider || this.activeProvider,
        includeRelationships
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Extraction failed');
    }

    return response.json();
  }

  /**
   * Start a pipeline processing session with SSE updates
   * @param {string} text - Text to process
   * @returns {Promise<Object>} Session info with sessionId
   */
  async startPipeline(text) {
    const response = await fetch(`${BASE_URL}/pipeline-lab/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!response.ok) throw new Error('Failed to start pipeline');
    return response.json();
  }

  /**
   * Get SSE stream URL for pipeline updates
   * @param {string} sessionId - Pipeline session ID
   * @returns {string} SSE stream URL
   */
  getPipelineStreamUrl(sessionId) {
    return `${BASE_URL}/pipeline-lab/stream/${sessionId}`;
  }

  /**
   * Subscribe to pipeline SSE events
   * @param {string} sessionId - Pipeline session ID
   * @param {Object} handlers - Event handlers
   * @param {Function} handlers.onStageStart - Called when stage starts
   * @param {Function} handlers.onStageComplete - Called when stage completes
   * @param {Function} handlers.onPipelineComplete - Called when pipeline completes
   * @param {Function} handlers.onError - Called on error
   * @returns {EventSource} EventSource instance for cleanup
   */
  subscribeToPipeline(sessionId, handlers = {}) {
    const eventSource = new EventSource(this.getPipelineStreamUrl(sessionId));

    if (handlers.onStageStart) {
      eventSource.addEventListener('stage_start', (e) => {
        handlers.onStageStart(JSON.parse(e.data));
      });
    }

    if (handlers.onStageComplete) {
      eventSource.addEventListener('stage_complete', (e) => {
        handlers.onStageComplete(JSON.parse(e.data));
      });
    }

    if (handlers.onPipelineComplete) {
      eventSource.addEventListener('pipeline_complete', (e) => {
        handlers.onPipelineComplete(e.data ? JSON.parse(e.data) : {});
      });
    }

    if (handlers.onError) {
      eventSource.addEventListener('error', (e) => {
        try {
          const data = JSON.parse(e.data);
          handlers.onError(data.message || 'Unknown error');
        } catch {
          handlers.onError('Connection lost');
        }
      });

      eventSource.onerror = () => {
        if (eventSource.readyState === EventSource.CLOSED) {
          handlers.onError('Connection closed');
        }
      };
    }

    return eventSource;
  }

  /**
   * Get graph data for a pipeline session
   * @param {string} sessionId - Pipeline session ID
   * @returns {Promise<Object>} Graph data with nodes and links
   */
  async getGraph(sessionId) {
    const response = await fetch(`${BASE_URL}/pipeline-lab/graph/${sessionId}`);
    if (!response.ok) throw new Error('Failed to fetch graph');
    return response.json();
  }

  /**
   * Export graph data
   * @param {string} sessionId - Pipeline session ID
   * @param {string} format - Export format (json, cypher, graphml)
   * @returns {Promise<Object>} Export data
   */
  async exportGraph(sessionId, format = 'json') {
    const response = await fetch(`${BASE_URL}/pipeline-lab/export/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format })
    });
    if (!response.ok) throw new Error('Failed to export graph');
    return response.json();
  }

  /**
   * Rerun a specific pipeline stage
   * @param {number} stageId - Stage ID to rerun
   * @param {Object} options - Rerun options
   * @returns {Promise<Object>} Rerun result
   */
  async rerunStage(stageId, options = {}) {
    const response = await fetch(`${BASE_URL}/pipeline-lab/stage/${stageId}/rerun`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });
    if (!response.ok) throw new Error('Failed to rerun stage');
    return response.json();
  }

  /**
   * Edit stage output manually
   * @param {number} stageId - Stage ID
   * @param {Object} output - New output data
   * @returns {Promise<Object>} Edit result
   */
  async editStageOutput(stageId, output) {
    const response = await fetch(`${BASE_URL}/pipeline-lab/stage/${stageId}/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ output })
    });
    if (!response.ok) throw new Error('Failed to edit stage');
    return response.json();
  }

  // ===== Tuning API Methods =====

  /**
   * Get tuning configuration
   * @returns {Promise<Object>} Current config
   */
  async getTuningConfig() {
    const response = await fetch(`${BASE_URL}/tuning/config`);
    if (!response.ok) throw new Error('Failed to fetch config');
    return response.json();
  }

  /**
   * Update tuning configuration
   * @param {Object} updates - Config updates
   * @returns {Promise<Object>} Updated config
   */
  async updateTuningConfig(updates) {
    const response = await fetch(`${BASE_URL}/tuning/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error('Failed to update config');
    return response.json();
  }

  /**
   * Reset tuning configuration to defaults
   * @returns {Promise<Object>} Reset result
   */
  async resetTuningConfig() {
    const response = await fetch(`${BASE_URL}/tuning/config/reset`, {
      method: 'POST'
    });
    if (!response.ok) throw new Error('Failed to reset config');
    return response.json();
  }

  /**
   * Get tuning parameters
   * @returns {Promise<Object>} Parameters
   */
  async getTuningParameters() {
    const response = await fetch(`${BASE_URL}/tuning/parameters`);
    if (!response.ok) throw new Error('Failed to fetch parameters');
    return response.json();
  }

  /**
   * Evaluate extraction results
   * @param {Object} pipelineResult - Extraction results to evaluate
   * @returns {Promise<Object>} Evaluation metrics
   */
  async evaluate(pipelineResult) {
    const response = await fetch(`${BASE_URL}/tuning/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipelineResult })
    });
    if (!response.ok) throw new Error('Failed to evaluate');
    return response.json();
  }

  /**
   * Get tuning recommendations based on evaluation
   * @param {Object} evaluation - Evaluation results
   * @returns {Promise<Object>} Recommendations
   */
  async getRecommendations(evaluation) {
    const response = await fetch(`${BASE_URL}/tuning/recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evaluation })
    });
    if (!response.ok) throw new Error('Failed to get recommendations');
    return response.json();
  }

  /**
   * Start auto-tuning session
   * @param {Object} options - Tuning options
   * @returns {Promise<Object>} Session info
   */
  async startAutoTuning(options = {}) {
    const response = await fetch(`${BASE_URL}/tuning/auto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });
    if (!response.ok) throw new Error('Failed to start auto-tuning');
    return response.json();
  }

  /**
   * Get tuning session status
   * @returns {Promise<Object>} Status info
   */
  async getTuningStatus() {
    const response = await fetch(`${BASE_URL}/tuning/status`);
    if (!response.ok) throw new Error('Failed to fetch status');
    return response.json();
  }

  /**
   * Stop tuning session
   * @param {string} sessionId - Session ID
   * @param {boolean} applyBest - Apply best config (default: true)
   * @returns {Promise<Object>} Stop result
   */
  async stopTuning(sessionId, applyBest = true) {
    const response = await fetch(`${BASE_URL}/tuning/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, applyBest })
    });
    if (!response.ok) throw new Error('Failed to stop tuning');
    return response.json();
  }

  /**
   * Get tuning session history
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} History data
   */
  async getTuningHistory(sessionId) {
    const response = await fetch(`${BASE_URL}/tuning/history/${sessionId}`);
    if (!response.ok) throw new Error('Failed to fetch history');
    return response.json();
  }
}

// Export singleton instance
const extractionService = new ExtractionService();
export default extractionService;

// Named exports for specific functions
export const {
  getProviders,
  selectProvider,
  testProvider,
  extract,
  startPipeline,
  getPipelineStreamUrl,
  subscribeToPipeline,
  getGraph,
  exportGraph,
  rerunStage,
  editStageOutput,
  getTuningConfig,
  updateTuningConfig,
  resetTuningConfig,
  getTuningParameters,
  evaluate,
  getRecommendations,
  startAutoTuning,
  getTuningStatus,
  stopTuning,
  getTuningHistory
} = extractionService;
