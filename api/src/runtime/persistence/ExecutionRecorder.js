/**
 * ExecutionRecorder — Unified execution record persistence.
 *
 * Records every graph execution as an ExecutionRecord node in META namespace.
 * Bridges RuntimeEngine and GxeManagerService execution paths into a single
 * unified record format.
 *
 * CC-029: Created to unify AOPEG_Execution and ExecutionRecord into one path.
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

class ExecutionRecorder {
  /**
   * @param {Object} memgraph - MemgraphService instance
   */
  constructor(memgraph) {
    this.memgraph = memgraph;
  }

  /**
   * Record a graph execution in Memgraph.
   *
   * @param {Object} data
   * @param {string} data.graphId - Graph/CatalogEntry ID
   * @param {string} [data.graphName] - Human-readable graph name
   * @param {string} [data.catalogEntryId] - CatalogEntry entryId for linking
   * @param {string} data.status - COMPLETED | FAILED | TIMED_OUT | PARTIAL_FAILURE
   * @param {string} data.startedAt - ISO timestamp
   * @param {string} data.completedAt - ISO timestamp
   * @param {number} data.durationMs - Total duration in ms
   * @param {string} [data.executedBy='system'] - Who triggered execution
   * @param {Object} [data.input] - Execution input payload
   * @param {Object} [data.output] - Execution output
   * @param {Object} [data.error] - Error object if failed
   * @param {Object} [data.metrics] - Scheduler metrics (nodesSucceeded, nodesFailed, etc.)
   * @param {Array} [data.nodeResults] - Per-node execution results
   * @param {boolean} [data.recordNodeDetails=false] - Whether to persist node-level records
   * @returns {Promise<Object>} Created ExecutionRecord
   */
  async recordExecution(data) {
    const executionId = `exec-${uuidv4().substring(0, 12)}`;
    const now = new Date().toISOString();

    const record = {
      executionId,
      graphId: data.graphId || '',
      graphName: data.graphName || '',
      status: data.status || 'COMPLETED',
      startedAt: data.startedAt || now,
      completedAt: data.completedAt || now,
      durationMs: data.durationMs || 0,
      executedBy: data.executedBy || 'system',
      inputHash: this._hashInput(data.input),
      outputSummary: this._summarize(data.output),
      nodesTotal: data.metrics?.totalNodes || data.metrics?.nodesTotal || 0,
      nodesSucceeded: data.metrics?.nodesSucceeded || 0,
      nodesFailed: data.metrics?.nodesFailed || 0,
      nodesSkipped: data.metrics?.nodesSkipped || 0,
      totalRetries: data.metrics?.totalRetries || 0,
      errorMessage: data.error?.message || data.error || '',
      createdAt: now,
      namespace: 'META'
    };

    try {
      // Create ExecutionRecord node + link to CatalogEntry
      await this.memgraph.executeQuery(`
        CREATE (e:ExecutionRecord {
          executionId: $executionId,
          graphId: $graphId,
          graphName: $graphName,
          status: $status,
          namespace: $namespace,
          startedAt: $startedAt,
          completedAt: $completedAt,
          durationMs: $durationMs,
          executedBy: $executedBy,
          inputHash: $inputHash,
          outputSummary: $outputSummary,
          nodesTotal: $nodesTotal,
          nodesSucceeded: $nodesSucceeded,
          nodesFailed: $nodesFailed,
          nodesSkipped: $nodesSkipped,
          totalRetries: $totalRetries,
          errorMessage: $errorMessage,
          createdAt: $createdAt
        })
        WITH e
        OPTIONAL MATCH (c:CatalogEntry {entryId: $catalogEntryId})
        WITH e, c
        WHERE c IS NOT NULL
        CREATE (e)-[:EXECUTED_FROM]->(c)
        RETURN e.executionId AS id
      `, {
        ...record,
        catalogEntryId: data.catalogEntryId || data.graphId || ''
      });

      // Optionally record per-node details
      if (data.recordNodeDetails && data.nodeResults) {
        await this._recordNodeResults(executionId, data.nodeResults);
      }

      return record;
    } catch (error) {
      console.error('[ExecutionRecorder] Failed to record execution:', error.message);
      return null;
    }
  }

  /**
   * Record per-node execution details.
   * @private
   */
  async _recordNodeResults(executionId, nodeResults) {
    if (!nodeResults || typeof nodeResults !== 'object') return;

    const entries = Array.isArray(nodeResults)
      ? nodeResults
      : Object.entries(nodeResults).map(([nodeId, data]) => ({ nodeId, ...data }));

    for (const node of entries) {
      try {
        await this.memgraph.executeQuery(`
          MATCH (e:ExecutionRecord {executionId: $executionId})
          CREATE (ne:ExecutionNodeRecord {
            id: $id,
            namespace: 'META',
            executionId: $executionId,
            nodeId: $nodeId,
            status: $status,
            durationMs: $durationMs,
            attempts: $attempts,
            errorMessage: $errorMessage,
            createdAt: $createdAt
          })
          CREATE (e)-[:EXECUTED_NODE]->(ne)
        `, {
          executionId,
          id: `ner-${uuidv4().substring(0, 8)}`,
          nodeId: node.nodeId || '',
          status: node.status || 'unknown',
          durationMs: node.durationMs || 0,
          attempts: node.attempts || 1,
          errorMessage: node.error?.message || node.error || '',
          createdAt: new Date().toISOString()
        });
      } catch (err) {
        console.warn('[ExecutionRecorder] Failed to record node:', node.nodeId, err.message);
      }
    }
  }

  /**
   * Hash input payload for deduplication.
   * @private
   */
  _hashInput(input) {
    if (!input) return '';
    try {
      return crypto.createHash('sha256')
        .update(JSON.stringify(input))
        .digest('hex')
        .slice(0, 16);
    } catch {
      return '';
    }
  }

  /**
   * Summarize output (truncated JSON).
   * @private
   */
  _summarize(output) {
    if (!output) return '';
    try {
      const str = JSON.stringify(output);
      return str.length > 500 ? str.slice(0, 500) + '...' : str;
    } catch {
      return '';
    }
  }
}

module.exports = { ExecutionRecorder };
