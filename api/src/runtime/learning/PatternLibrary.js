/**
 * PatternLibrary
 *
 * In-memory cache of successful execution patterns with persistence hooks.
 * Works with RuntimeAdapter to enable pattern-based graph generation.
 *
 * Part of GXE Runtime Environment - Direction 1 (Feedback Loop)
 *
 * @module runtime/learning/PatternLibrary
 */

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN LIBRARY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * In-memory pattern cache with LRU eviction
 */
class PatternLibrary {
  /**
   * @param {Object} options
   * @param {number} [options.maxSize=100] - Maximum patterns to cache
   * @param {number} [options.minSuccessRate=0.7] - Minimum success rate to cache
   * @param {Object} [options.runtimeAdapter] - RuntimeAdapter for persistence (ImmutableGraph)
   * @param {Object} [options.memgraphService] - MemgraphService for direct Memgraph persistence
   */
  constructor(options = {}) {
    this._maxSize = options.maxSize ?? 100;
    this._minSuccessRate = options.minSuccessRate ?? 0.7;
    this._runtimeAdapter = options.runtimeAdapter ?? null;
    this._memgraphService = options.memgraphService ?? null;

    /** @type {Map<string, CachedPattern>} - category → best pattern */
    this._categoryCache = new Map();

    /** @type {Map<string, CachedPattern>} - hash → pattern */
    this._hashIndex = new Map();

    /** @type {string[]} - LRU order (most recent first) */
    this._accessOrder = [];

    // Statistics
    this._stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      persisted: 0,
      loaded: 0
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the best pattern for a task category
   * @param {string} taskCategory
   * @returns {Promise<Object|null>} - DAG pattern or null
   */
  async getPattern(taskCategory) {
    // Check in-memory cache first
    const cached = this._categoryCache.get(taskCategory);
    if (cached && !this._isStale(cached)) {
      this._recordAccess(cached.hash);
      this._stats.hits++;
      return cached.dag;
    }

    // Try persistent storage
    if (this._runtimeAdapter) {
      try {
        const pattern = await this._runtimeAdapter.getBestPattern(taskCategory);
        if (pattern) {
          this._cachePattern(taskCategory, pattern);
          this._stats.hits++;
          return pattern.dag;
        }
      } catch (err) {
        console.warn('[PatternLibrary] Failed to fetch from adapter:', err.message);
      }
    }

    this._stats.misses++;
    return null;
  }

  /**
   * Get multiple patterns for a category (for selection)
   * @param {string} taskCategory
   * @param {number} [limit=5]
   * @returns {Promise<Object[]>} - Array of DAG patterns
   */
  async getPatterns(taskCategory, limit = 5) {
    if (this._runtimeAdapter) {
      try {
        const patterns = await this._runtimeAdapter.findPatternsByCategory(
          taskCategory,
          this._minSuccessRate,
          limit
        );
        return patterns.map(p => p.dag);
      } catch (err) {
        console.warn('[PatternLibrary] Failed to fetch patterns:', err.message);
      }
    }

    // Fallback to cached
    const cached = this._categoryCache.get(taskCategory);
    return cached ? [cached.dag] : [];
  }

  /**
   * Record an execution result for pattern learning
   * @param {Object} executionResult - RuntimeEngine execution result
   * @param {Object} context - { taskCategory, taskDescription, userId }
   * @returns {Promise<Object>} - { patternId, isNewPattern, successRate }
   */
  async recordExecution(executionResult, context) {
    if (!this._runtimeAdapter) {
      // No persistence - just update in-memory stats
      return this._recordInMemory(executionResult, context);
    }

    // Build ExecutionResult for RuntimeAdapter
    const result = this._buildExecutionResult(executionResult, context);

    try {
      const recordResult = await this._runtimeAdapter.recordExecution(result);

      // Update cache if successful execution
      if (executionResult.status === 'COMPLETED') {
        const pattern = {
          dag: result.dag,
          hash: this._computeHash(result.dag),
          successCount: 1,
          failureCount: 0,
          lastUsedAt: new Date()
        };
        this._cachePattern(context.taskCategory, pattern);
      }

      return {
        patternId: recordResult.patternId,
        isNewPattern: recordResult.isNewPattern,
        successRate: null // Would need to fetch pattern to know
      };
    } catch (err) {
      console.warn('[PatternLibrary] Failed to record execution:', err.message);
      return this._recordInMemory(executionResult, context);
    }
  }

  /**
   * Pre-warm cache with patterns for common categories
   * @param {string[]} categories - Optional list of categories to warm up
   */
  async warmup(categories = []) {
    // First, try loading from Memgraph if available
    if (this._memgraphService) {
      try {
        const loaded = await this.loadFromMemgraph();
        if (loaded > 0) {
          console.log(`[PatternLibrary] Loaded ${loaded} patterns from Memgraph`);
        }
      } catch (err) {
        console.warn('[PatternLibrary] Failed to load from Memgraph:', err.message);
      }
    }

    // Then try RuntimeAdapter if available
    if (this._runtimeAdapter && categories.length > 0) {
      const promises = categories.map(async (category) => {
        try {
          const pattern = await this._runtimeAdapter.getBestPattern(category);
          if (pattern) {
            this._cachePattern(category, pattern);
          }
        } catch (err) {
          // Ignore warmup failures
        }
      });

      await Promise.all(promises);
    }

    console.log(`[PatternLibrary] Warmed up ${this._categoryCache.size} patterns`);
  }

  /**
   * Load patterns from Memgraph into the cache
   * @returns {Promise<number>} - Number of patterns loaded
   */
  async loadFromMemgraph() {
    if (!this._memgraphService) return 0;

    try {
      const result = await this._memgraphService.executeQuery(`
        MATCH (p:ExecutionPattern)
        WHERE p.successCount > 0
        RETURN p
        ORDER BY p.successCount DESC, p.lastUsedAt DESC
        LIMIT 100
      `);

      let loaded = 0;
      for (const record of result.records) {
        try {
          const node = record.get('p');
          const props = node.properties;

          const pattern = {
            dag: JSON.parse(props.dag),
            hash: props.hash,
            successCount: props.successCount || 0,
            failureCount: props.failureCount || 0,
            avgDurationMs: props.avgDurationMs || 0,
            lastUsedAt: props.lastUsedAt ? new Date(props.lastUsedAt) : new Date()
          };

          this._cachePattern(props.category, pattern);
          loaded++;
          this._stats.loaded++;
        } catch (parseErr) {
          console.warn('[PatternLibrary] Failed to parse pattern:', parseErr.message);
        }
      }

      return loaded;
    } catch (err) {
      console.warn('[PatternLibrary] Memgraph query failed:', err.message);
      return 0;
    }
  }

  /**
   * Persist a pattern to Memgraph
   * @param {Object} pattern - Pattern to persist
   * @param {string} category - Task category
   * @returns {Promise<boolean>} - Success status
   */
  async persistToMemgraph(pattern, category) {
    if (!this._memgraphService) return false;

    try {
      const hash = pattern.hash || this._computeHash(pattern.dag);

      await this._memgraphService.executeQuery(`
        MERGE (p:ExecutionPattern {hash: $hash})
        ON CREATE SET
          p.category = $category,
          p.dag = $dag,
          p.successCount = $successCount,
          p.failureCount = $failureCount,
          p.avgDurationMs = $avgDurationMs,
          p.createdAt = $now,
          p.lastUsedAt = $now
        ON MATCH SET
          p.successCount = p.successCount + $successDelta,
          p.failureCount = p.failureCount + $failureDelta,
          p.lastUsedAt = $now
      `, {
        hash,
        category,
        dag: JSON.stringify(pattern.dag),
        successCount: pattern.successCount || 0,
        failureCount: pattern.failureCount || 0,
        avgDurationMs: pattern.avgDurationMs || 0,
        successDelta: pattern.successCount > 0 ? 1 : 0,
        failureDelta: pattern.failureCount > 0 ? 1 : 0,
        now: new Date().toISOString()
      });

      this._stats.persisted++;
      return true;
    } catch (err) {
      console.warn('[PatternLibrary] Failed to persist to Memgraph:', err.message);
      return false;
    }
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getStats() {
    const total = this._stats.hits + this._stats.misses;
    return {
      ...this._stats,
      hitRate: total > 0 ? (this._stats.hits / total) : 0,
      cachedPatterns: this._hashIndex.size,
      categories: this._categoryCache.size
    };
  }

  /**
   * Clear the cache
   */
  clear() {
    this._categoryCache.clear();
    this._hashIndex.clear();
    this._accessOrder = [];
    this._stats = { hits: 0, misses: 0, evictions: 0, persisted: 0, loaded: 0 };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  _cachePattern(category, pattern) {
    const hash = pattern.hash || pattern.dagHash || this._computeHash(pattern.dag);

    const cached = {
      dag: pattern.dag,
      hash,
      successCount: pattern.successCount ?? 0,
      failureCount: pattern.failureCount ?? 0,
      avgDurationMs: pattern.avgDurationMs ?? 0,
      lastUsedAt: pattern.lastUsedAt ? new Date(pattern.lastUsedAt) : new Date(),
      cachedAt: new Date()
    };

    // Update indices
    this._categoryCache.set(category, cached);
    this._hashIndex.set(hash, cached);
    this._recordAccess(hash);

    // Evict if over capacity
    while (this._hashIndex.size > this._maxSize) {
      this._evictLRU();
    }
  }

  _recordAccess(hash) {
    // Remove from current position
    const idx = this._accessOrder.indexOf(hash);
    if (idx !== -1) {
      this._accessOrder.splice(idx, 1);
    }
    // Add to front
    this._accessOrder.unshift(hash);
  }

  _evictLRU() {
    if (this._accessOrder.length === 0) return;

    const hash = this._accessOrder.pop();
    const pattern = this._hashIndex.get(hash);

    if (pattern) {
      this._hashIndex.delete(hash);

      // Remove from category cache if this was the cached pattern
      for (const [category, cached] of this._categoryCache) {
        if (cached.hash === hash) {
          this._categoryCache.delete(category);
          break;
        }
      }

      this._stats.evictions++;
    }
  }

  _isStale(cached) {
    // Patterns older than 1 hour are considered stale
    const maxAge = 60 * 60 * 1000; // 1 hour
    return Date.now() - cached.cachedAt.getTime() > maxAge;
  }

  _computeHash(dag) {
    if (!dag) return 'empty';

    const nodes = dag.nodes || [];
    const edges = dag.edges || [];

    const nodeSignatures = nodes
      .map(n => `${n.id}:${n.executorType}`)
      .sort()
      .join('|');

    const edgeSignatures = edges
      .map(e => `${e.source || e.sourceNodeId}->${e.target || e.targetNodeId}`)
      .sort()
      .join('|');

    const combined = `${nodeSignatures}::${edgeSignatures}`;

    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    return `dag-${Math.abs(hash).toString(16)}`;
  }

  _buildExecutionResult(result, context) {
    // Convert RuntimeEngine result to RuntimeAdapter format
    const nodeResults = new Map();

    if (result.nodeResults) {
      for (const [nodeId, nodeRes] of Object.entries(result.nodeResults)) {
        nodeResults.set(nodeId, {
          nodeId,
          toolId: nodeRes.toolId || 'unknown',
          status: nodeRes.status,
          durationMs: nodeRes.durationMs || 0,
          attempts: nodeRes.attempts || 1,
          error: nodeRes.error
        });
      }
    }

    return {
      executionId: result.executionId || `exec-${Date.now()}`,
      dagId: result.dag?.id || 'unknown',
      status: result.status,
      metrics: result.metrics || {
        totalDurationMs: 0,
        nodesSucceeded: 0,
        nodesFailed: 0,
        nodesSkipped: 0,
        retriesTotal: 0
      },
      nodeResults,
      dag: this._normalizeDag(result.dag || result.workingDag),
      context: {
        taskCategory: context.taskCategory || 'general',
        taskDescription: context.taskDescription,
        userId: context.userId,
        timestamp: new Date()
      }
    };
  }

  _normalizeDag(dag) {
    if (!dag) return { id: 'unknown', nodes: [], edges: [] };

    return {
      id: dag.id || 'dag',
      nodes: (dag.nodes || []).map(n => ({
        id: n.id,
        executorType: n.executorType || n.data?.toolId || n.data?.kind,
        parameters: n.parameters || n.data || {}
      })),
      edges: (dag.edges || []).map(e => ({
        id: e.id,
        source: e.source || e.sourceNodeId,
        target: e.target || e.targetNodeId
      })),
      entryNodeId: dag.entryNodeId,
      exitNodeIds: dag.exitNodeIds
    };
  }

  _recordInMemory(executionResult, context) {
    const dag = this._normalizeDag(executionResult.dag || executionResult.workingDag);
    const hash = this._computeHash(dag);

    let existing = this._hashIndex.get(hash);
    const isSuccess = executionResult.status === 'COMPLETED';
    const isNewPattern = !existing;

    if (!existing) {
      existing = {
        dag,
        hash,
        successCount: 0,
        failureCount: 0,
        avgDurationMs: 0,
        lastUsedAt: new Date(),
        cachedAt: new Date()
      };
    }

    // Update stats
    existing.successCount += isSuccess ? 1 : 0;
    existing.failureCount += isSuccess ? 0 : 1;
    existing.lastUsedAt = new Date();

    // Update cache
    this._hashIndex.set(hash, existing);
    this._categoryCache.set(context.taskCategory, existing);
    this._recordAccess(hash);

    // Persist to Memgraph if available and successful execution
    if (isSuccess && this._memgraphService) {
      // Fire and forget - don't block on persistence
      this.persistToMemgraph(existing, context.taskCategory).catch(err => {
        console.warn('[PatternLibrary] Background persist failed:', err.message);
      });
    }

    const total = existing.successCount + existing.failureCount;
    return {
      patternId: hash,
      isNewPattern,
      successRate: total > 0 ? existing.successCount / total : 0
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  PatternLibrary
};
