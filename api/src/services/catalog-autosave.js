'use strict';

/**
 * Catalog Auto-Save — CODEX-CATALOG §6.2
 *
 * Automatically saves GXE graphs to the catalog after successful execution.
 * Tracks usage statistics and promotes frequently used graphs to Pattern Library.
 */

class CatalogAutoSave {
  /**
   * @param {import('./graphCatalog.service')} catalogService
   * @param {import('./memgraph.service')} memgraphService
   * @param {Object} [logger] - Optional logger (defaults to console)
   */
  constructor(catalogService, memgraphService, logger) {
    this.catalog = catalogService;
    this.memgraph = memgraphService;
    this.logger = logger || console;
  }

  /**
   * Hook called after GXE execution completes.
   * Auto-saves on first successful run; updates stats on subsequent runs.
   *
   * @param {string} dagId - DAG identifier
   * @param {{ status: string, metrics?: Object }} executionResult
   * @param {Object} dag - Full DAG definition { id, nodes, edges, ... }
   * @returns {Promise<{ action: string, entryId?: string }>}
   */
  async onExecutionComplete(dagId, executionResult, dag) {
    try {
      const existing = await this._findByDagId(dagId);

      if (!existing && executionResult.status === 'COMPLETED') {
        return await this._autoSaveNew(dagId, dag);
      }

      if (existing) {
        return await this._updateStats(existing, executionResult);
      }

      return { action: 'SKIPPED', reason: 'not_completed_or_no_entry' };
    } catch (err) {
      this.logger.error('[CatalogAutoSave] onExecutionComplete failed:', err.message);
      return { action: 'ERROR', error: err.message };
    }
  }

  /**
   * Auto-save a new graph to the catalog on first successful execution.
   * @private
   */
  async _autoSaveNew(dagId, dag) {
    const result = await this.catalog.createGraph({
      name: dag.name || `Auto-saved: ${dagId.slice(0, 8)}`,
      description: dag.description || `Auto-saved on first successful execution`,
      type: this._inferType(dag),
      namespace: dag.namespace || 'PROJECT',
      visibility: 'PRIVATE',
      tags: ['auto-saved', ...(dag.tags || [])],
      nodes: dag.nodes || [],
      edges: dag.edges || [],
      createdBy: 'catalog-autosave',
    });

    this.logger.info('[CatalogAutoSave] Graph auto-saved', {
      dagId,
      entryId: result.entryId || result.id,
    });

    // Tag the entry as auto-saved for filtering
    try {
      await this.memgraph.runQuery(`
        MATCH (e:CatalogEntry {entryId: $entryId})
        SET e.autoSaved = true,
            e.sourceDagId = $dagId
        RETURN e
      `, { entryId: result.entryId || result.id, dagId });
    } catch {
      // Non-critical — tagging failure shouldn't block
    }

    return { action: 'CREATED', entryId: result.entryId || result.id };
  }

  /**
   * Update usage stats for an existing catalog entry.
   * @private
   */
  async _updateStats(entry, executionResult) {
    const entryId = entry.entryId || entry.id;
    const success = executionResult.status === 'COMPLETED';

    try {
      // Increment usage count + update quality score (exponential moving average)
      await this.memgraph.runQuery(`
        MATCH (e:CatalogEntry {entryId: $entryId})
        SET e.usageCount = coalesce(e.usageCount, 0) + 1,
            e.lastExecutedAt = $now,
            e.qualityScore = coalesce(e.qualityScore, 1.0) * 0.9 + $increment
        RETURN e.usageCount as usageCount, e.qualityScore as qualityScore
      `, {
        entryId,
        now: new Date().toISOString(),
        increment: success ? 0.1 : 0.0,
      });

      // Check for pattern promotion eligibility
      const stats = await this._getStats(entryId);
      if (stats.usageCount >= 10 && stats.qualityScore >= 0.9) {
        await this._promoteToPattern(entryId);
      }
    } catch (err) {
      this.logger.warn('[CatalogAutoSave] Stats update failed:', err.message);
    }

    return { action: 'UPDATED', entryId };
  }

  /**
   * Find a catalog entry by its source DAG ID.
   * @private
   */
  async _findByDagId(dagId) {
    const result = await this.memgraph.runQuery(`
      MATCH (e:CatalogEntry {sourceDagId: $dagId})
      RETURN e
      LIMIT 1
    `, { dagId });

    return result[0]?.e?.properties || result[0]?.e || null;
  }

  /**
   * Get stats for a catalog entry.
   * @private
   */
  async _getStats(entryId) {
    const result = await this.memgraph.runQuery(`
      MATCH (e:CatalogEntry {entryId: $entryId})
      RETURN e.usageCount as usageCount, e.qualityScore as qualityScore
    `, { entryId });

    return {
      usageCount: result[0]?.usageCount ?? 0,
      qualityScore: result[0]?.qualityScore ?? 0,
    };
  }

  /**
   * Promote a high-performing graph to the Pattern Library.
   * @private
   */
  async _promoteToPattern(entryId) {
    try {
      await this.memgraph.runQuery(`
        MATCH (e:CatalogEntry {entryId: $entryId})
        WHERE NOT e:PromotedPattern
        SET e:PromotedPattern,
            e.promotedAt = $now,
            e.promotionReason = 'auto: usageCount >= 10, qualityScore >= 0.9'
        RETURN e
      `, { entryId, now: new Date().toISOString() });

      this.logger.info('[CatalogAutoSave] Graph promoted to Pattern Library', { entryId });
    } catch (err) {
      this.logger.warn('[CatalogAutoSave] Pattern promotion failed:', err.message);
    }
  }

  /**
   * Infer graph type from DAG structure.
   * @private
   */
  _inferType(dag) {
    const nodes = dag.nodes || [];
    if (nodes.length === 1) return 'atomic';
    const types = nodes.map(n => (n.type || n.data?.type || '').toLowerCase());
    if (types.includes('tool') || types.includes('mcp_tool')) return 'technical';
    if (types.includes('approval') || types.includes('decision') || types.includes('gate')) return 'business';
    if (types.includes('subgraph') || types.includes('compose')) return 'composite';
    return 'technical';
  }
}

// Factory
function createCatalogAutoSave(catalogService, memgraphService, logger) {
  return new CatalogAutoSave(catalogService, memgraphService, logger);
}

module.exports = { CatalogAutoSave, createCatalogAutoSave };
