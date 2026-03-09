/**
 * Graph Status Management Service
 *
 * Manages lifecycle transitions for DomainGraph nodes.
 * Triggers GNN training on APPROVED status.
 *
 * Status flow:
 *   DRAFT -> UNDER_REVIEW -> APPROVED (triggers GNN) | REJECTED -> DRAFT
 *   APPROVED -> VERSIONED | DEPRECATED | QUARANTINED
 *   DEPRECATED -> OBSOLETE | QUARANTINED
 *   OBSOLETE/VERSIONED -> ARCHIVED
 *   EXPERIMENTAL -> DRAFT | ARCHIVED
 *   QUARANTINED -> DRAFT | ARCHIVED
 */

const { v4: uuidv4 } = require('uuid');
const neo4j = require('neo4j-driver');

const GraphStatus = {
  DRAFT: 'DRAFT',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  VERSIONED: 'VERSIONED',
  DEPRECATED: 'DEPRECATED',
  OBSOLETE: 'OBSOLETE',
  ARCHIVED: 'ARCHIVED',
  EXPERIMENTAL: 'EXPERIMENTAL',
  QUARANTINED: 'QUARANTINED',
};

const STATUS_TRANSITIONS = {
  [GraphStatus.DRAFT]:        [GraphStatus.UNDER_REVIEW, GraphStatus.EXPERIMENTAL],
  [GraphStatus.UNDER_REVIEW]: [GraphStatus.APPROVED, GraphStatus.REJECTED],
  [GraphStatus.APPROVED]:     [GraphStatus.VERSIONED, GraphStatus.DEPRECATED, GraphStatus.QUARANTINED],
  [GraphStatus.REJECTED]:     [GraphStatus.DRAFT],
  [GraphStatus.VERSIONED]:    [GraphStatus.ARCHIVED],
  [GraphStatus.DEPRECATED]:   [GraphStatus.OBSOLETE, GraphStatus.QUARANTINED],
  [GraphStatus.OBSOLETE]:     [GraphStatus.ARCHIVED],
  [GraphStatus.ARCHIVED]:     [],
  [GraphStatus.EXPERIMENTAL]: [GraphStatus.DRAFT, GraphStatus.ARCHIVED],
  [GraphStatus.QUARANTINED]:  [GraphStatus.DRAFT, GraphStatus.ARCHIVED],
};

const REASON_REQUIRED = [GraphStatus.REJECTED, GraphStatus.QUARANTINED];
const GNN_TRIGGER_STATUSES = [GraphStatus.APPROVED];

class GraphStatusService {
  /**
   * @param {Object} memgraphService - MemgraphService instance with runQuery()
   * @param {Object} [eventEmitter] - Optional EventEmitter for side effects
   */
  constructor(memgraphService, eventEmitter = null) {
    this.mg = memgraphService;
    this.eventEmitter = eventEmitter;
  }

  /**
   * Get current status of a graph
   */
  async getStatus(graphId) {
    const result = await this.mg.runQuery(
      `MATCH (g:DomainGraph {id: $graphId})
       RETURN g.status as status, g.statusChangedAt as changedAt,
              g.statusChangedBy as changedBy, g.statusReason as reason,
              g.domain as domain, g.title as title`,
      { graphId }
    );

    if (!result || result.length === 0) return null;

    const r = result[0];
    return {
      status: r.status,
      changedAt: r.changedAt,
      changedBy: r.changedBy,
      reason: r.reason,
      domain: r.domain,
      title: r.title,
    };
  }

  /**
   * Get status history for a graph
   */
  async getStatusHistory(graphId) {
    const result = await this.mg.runQuery(
      `MATCH (g:DomainGraph {id: $graphId})-[:HAS_STATUS_CHANGE]->(sc:GraphStatusChange)
       RETURN sc.id as id, sc.fromStatus as fromStatus, sc.toStatus as toStatus,
              sc.changedAt as changedAt, sc.changedBy as changedBy, sc.reason as reason
       ORDER BY sc.changedAt DESC`,
      { graphId }
    );

    return (result || []).map(r => ({
      id: r.id,
      fromStatus: r.fromStatus,
      toStatus: r.toStatus,
      changedAt: r.changedAt,
      changedBy: r.changedBy,
      reason: r.reason,
    }));
  }

  /**
   * Validate if a status transition is allowed
   */
  canTransition(fromStatus, toStatus) {
    const allowed = STATUS_TRANSITIONS[fromStatus] || [];
    return allowed.includes(toStatus);
  }

  /**
   * Get allowed next statuses
   */
  getAllowedTransitions(currentStatus) {
    return STATUS_TRANSITIONS[currentStatus] || [];
  }

  /**
   * Transition a graph to a new status
   *
   * @param {string} graphId
   * @param {string} newStatus
   * @param {string} changedBy - User/system identifier
   * @param {string} [reason] - Required for REJECTED/QUARANTINED
   * @returns {{ success: boolean, previousStatus?: string, newStatus?: string, changeId?: string, error?: string }}
   */
  async transitionStatus(graphId, newStatus, changedBy, reason = null) {
    // Validate status value
    if (!Object.values(GraphStatus).includes(newStatus)) {
      return { success: false, error: `Invalid status: ${newStatus}` };
    }

    // Check reason requirement
    if (REASON_REQUIRED.includes(newStatus) && !reason) {
      return { success: false, error: `Reason required for status: ${newStatus}` };
    }

    // Get current status
    const currentResult = await this.mg.runQuery(
      `MATCH (g:DomainGraph {id: $graphId}) RETURN g.status as status`,
      { graphId }
    );

    if (!currentResult || currentResult.length === 0) {
      return { success: false, error: 'Graph not found' };
    }

    const currentStatus = currentResult[0].status;

    // Validate transition
    if (!this.canTransition(currentStatus, newStatus)) {
      return {
        success: false,
        error: `Transition from ${currentStatus} to ${newStatus} not allowed`,
        allowedTransitions: this.getAllowedTransitions(currentStatus),
      };
    }

    const now = new Date().toISOString();
    const changeId = uuidv4();

    // Update graph status
    await this.mg.runQuery(
      `MATCH (g:DomainGraph {id: $graphId})
       SET g.status = $newStatus,
           g.statusChangedAt = $now,
           g.statusChangedBy = $changedBy,
           g.statusReason = $reason,
           g.updatedAt = $now`,
      { graphId, newStatus, now, changedBy, reason: reason || '' }
    );

    // Create status change audit record
    await this.mg.runQuery(
      `MATCH (g:DomainGraph {id: $graphId})
       CREATE (sc:GraphStatusChange {
         id: $changeId,
         fromStatus: $fromStatus,
         toStatus: $newStatus,
         changedAt: $now,
         changedBy: $changedBy,
         reason: $reason
       })
       CREATE (g)-[:HAS_STATUS_CHANGE]->(sc)`,
      { graphId, changeId, fromStatus: currentStatus, newStatus, now, changedBy, reason: reason || '' }
    );

    // Emit event
    const eventData = {
      graphId,
      previousStatus: currentStatus,
      newStatus,
      changedBy,
      reason,
      timestamp: now,
    };

    if (this.eventEmitter) {
      this.eventEmitter.emit('graph_status_changed', eventData);
    }

    // Trigger GNN training if applicable
    if (GNN_TRIGGER_STATUSES.includes(newStatus)) {
      if (this.eventEmitter) {
        this.eventEmitter.emit('gnn_training_triggered', {
          graphId,
          triggerStatus: newStatus,
          timestamp: now,
        });
      }
      this._queueGnnTraining(graphId).catch(err => {
        console.error('[GraphStatus] Failed to queue GNN training:', err.message);
      });
    }

    return {
      success: true,
      previousStatus: currentStatus,
      newStatus,
      changeId,
    };
  }

  /**
   * Bulk status update
   */
  async bulkTransitionStatus(graphIds, newStatus, changedBy, reason = null) {
    const results = { success: [], failed: [] };

    for (const graphId of graphIds) {
      const result = await this.transitionStatus(graphId, newStatus, changedBy, reason);
      if (result.success) {
        results.success.push({ graphId, ...result });
      } else {
        results.failed.push({ graphId, error: result.error });
      }
    }

    return results;
  }

  // Convenience methods

  async submitForReview(graphId, submittedBy) {
    return this.transitionStatus(graphId, GraphStatus.UNDER_REVIEW, submittedBy);
  }

  async approve(graphId, approvedBy) {
    return this.transitionStatus(graphId, GraphStatus.APPROVED, approvedBy);
  }

  async reject(graphId, rejectedBy, reason) {
    return this.transitionStatus(graphId, GraphStatus.REJECTED, rejectedBy, reason);
  }

  async quarantine(graphId, quarantinedBy, reason) {
    return this.transitionStatus(graphId, GraphStatus.QUARANTINED, quarantinedBy, reason);
  }

  /**
   * Get graphs by status with optional domain filter
   */
  async getGraphsByStatus(status, options = {}) {
    const { domain, limit = 50, offset = 0 } = options;

    let query = `MATCH (g:DomainGraph {status: $status})`;
    const params = {
      status,
      limit: neo4j.int(parseInt(limit) || 50),
      offset: neo4j.int(parseInt(offset) || 0),
    };

    if (domain) {
      query += ` WHERE g.domain = $domain`;
      params.domain = domain;
    }

    query += ` RETURN g.id as id, g.domain as domain, g.title as title,
               g.status as status, g.statusChangedAt as changedAt,
               g.statusChangedBy as changedBy, g.confidence as confidence,
               g.sourceSystem as sourceSystem
               ORDER BY g.updatedAt DESC SKIP $offset LIMIT $limit`;

    const result = await this.mg.runQuery(query, params);
    return result || [];
  }

  /**
   * Get review queue (graphs awaiting approval)
   */
  async getReviewQueue(options = {}) {
    return this.getGraphsByStatus(GraphStatus.UNDER_REVIEW, options);
  }

  /**
   * Get approved graphs that haven't been used for GNN training yet
   */
  async getApprovedPendingGnn() {
    const result = await this.mg.runQuery(
      `MATCH (g:DomainGraph {status: 'APPROVED'})
       WHERE g.gnnTrainingQueued IS NULL OR g.gnnTrainingQueued = false
       RETURN g.id as id, g.domain as domain, g.title as title,
              g.statusChangedAt as approvedAt
       ORDER BY g.statusChangedAt ASC`
    );
    return result || [];
  }

  /**
   * Get status summary (counts per status)
   */
  async getStatusSummary() {
    const result = await this.mg.runQuery(
      `MATCH (g:DomainGraph)
       RETURN g.status as status, g.domain as domain, count(g) as count
       ORDER BY g.status, g.domain`
    );

    const summary = {};
    for (const r of (result || [])) {
      if (!summary[r.status]) summary[r.status] = { total: 0, byDomain: {} };
      const cnt = typeof r.count === 'object' && r.count.toNumber ? r.count.toNumber() : r.count;
      summary[r.status].total += cnt;
      summary[r.status].byDomain[r.domain] = cnt;
    }
    return summary;
  }

  /**
   * Queue GNN training (placeholder for async job)
   */
  async _queueGnnTraining(graphId) {
    console.log(`[GraphStatus] GNN training queued for graph: ${graphId}`);
    await this.mg.runQuery(
      `MATCH (g:DomainGraph {id: $graphId})
       SET g.gnnTrainingQueued = true,
           g.gnnTrainingQueuedAt = $now`,
      { graphId, now: new Date().toISOString() }
    );
  }
}

module.exports = {
  GraphStatusService,
  GraphStatus,
  STATUS_TRANSITIONS,
  REASON_REQUIRED,
  GNN_TRIGGER_STATUSES,
};
