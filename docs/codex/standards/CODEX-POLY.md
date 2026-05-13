# CODEX-POLY: Polystore Protocol

**Status:** 🟡 Draft
**Version:** 0.1.0
**Last updated:** 2026-03-12

---

## Preamble

UN ProjectAdvisor is a polystore system using three data stores:

- **Memgraph** — graph database (nodes, edges, properties, relationships)
- **Qdrant** — vector store (embeddings, semantic search)
- **Redis** — cache and message queues (pub/sub, TTL-cache, sessions)

Writing to multiple stores **is not atomic**. There is no distributed transaction manager that joins all three systems into a single ACID transaction. This means that partial failures are possible during writes: data may be written to Memgraph but not reach Qdrant, or the Redis cache may remain stale.

This protocol defines:

1. **Write order** — in what sequence to update the stores
2. **Error handling** — compensating transactions on partial failures
3. **Consistency recovery** — mechanisms for detecting and correcting desynchronization

---

## 7.1 Write order

### Write flow diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│   Memgraph      │────▶│    Qdrant       │────▶│     Redis       │
│   (primary)     │     │  (secondary)    │     │    (cache)      │
│                 │     │                 │     │                 │
│  Graph: nodes,  │     │  Vectors:       │     │  Cache:         │
│  edges,         │     │  embeddings,    │     │  invalidation,  │
│  properties     │     │  payload        │     │  pub/sub        │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
       ▲                                               │
       │              feedback loop                    │
       └───────────────────────────────────────────────┘
```

### Write order rationale

| Order | Store | Reason |
|-------|-------|--------|
| 1st | **Memgraph** | Source of truth. All entities receive a `nodeId` when created in the graph. Without a `nodeId`, writing to Qdrant is impossible. |
| 2nd | **Qdrant** | Secondary store. Requires the `nodeId` from Memgraph to link the vector to the graph node. After upsert, returns a `vectorId` that is written back to Memgraph. |
| 3rd | **Redis** | Cache is invalidated last. There is no point in invalidating the cache before writing to the primary stores is complete. Also used for pub/sub notifications on write completion. |

### Store dependency table

| Operation | Memgraph → Qdrant | Qdrant → Memgraph | Memgraph → Redis | Redis → Memgraph |
|-----------|-------------------|--------------------|------------------|------------------|
| Node creation | `nodeId` passed as payload ID | `vectorId` written to node property | Cache key contains `nodeId` | No dependency |
| Property update | New text → recompute embedding | None | Invalidate key `node:{nodeId}` | None |
| Node deletion | Delete vector by `nodeId` | None | Delete all keys `*:{nodeId}:*` | None |
| Edge creation | None (edges are not vectorized) | None | Invalidate neighbor cache | None |
| Search (read) | None | Results enriched with properties from MG | Cache query results | None |

### Write operation template

```javascript
async function polystoreWrite(entityData, options = {}) {
  const operationId = crypto.randomUUID();
  const saga = new PolystoreSaga(operationId);

  try {
    // ── Step 1: Memgraph (primary) ──────────────────────────────
    const nodeId = entityData.id || crypto.randomUUID();

    const mgResult = await saga.addStep({
      name: 'CreateNode',
      execute: async () => {
        const result = await memgraphService.runQuery(
          `MERGE (n:${entityData.label} {id: $id})
           SET n += $properties, n.updatedAt = datetime()
           RETURN n.id AS nodeId`,
          { id: nodeId, properties: entityData.properties }
        );
        return { nodeId: result.records[0].get('nodeId') };
      },
      compensate: async () => {
        await memgraphService.runQuery(
          `MATCH (n {id: $id}) DETACH DELETE n`,
          { id: nodeId }
        );
      }
    });

    // ── Step 2: Qdrant (secondary) ─────────────────────────────
    let vectorId = null;
    if (entityData.text && options.vectorize !== false) {
      const embedding = await teiService.embed(entityData.text);

      const qdrantResult = await saga.addStep({
        name: 'UpsertVector',
        execute: async () => {
          await qdrantService.upsert(options.collection || 'default', {
            id: nodeId,
            vector: embedding,
            payload: {
              nodeId: mgResult.nodeId,
              label: entityData.label,
              text: entityData.text,
              namespace: entityData.namespace || 'default',
              createdAt: new Date().toISOString()
            }
          });
          return { vectorId: nodeId };
        },
        compensate: async () => {
          await qdrantService.delete(options.collection || 'default', {
            points: [nodeId]
          });
        }
      });

      vectorId = qdrantResult.vectorId;

      // ── Step 2b: Write back vectorId to Memgraph ────────
      await saga.addStep({
        name: 'UpdateVectorRef',
        execute: async () => {
          await memgraphService.runQuery(
            `MATCH (n {id: $id}) SET n.vectorId = $vectorId`,
            { id: nodeId, vectorId }
          );
          return { updated: true };
        },
        compensate: async () => {
          await memgraphService.runQuery(
            `MATCH (n {id: $id}) REMOVE n.vectorId`,
            { id: nodeId }
          );
        }
      });
    }

    // ── Step 3: Redis (cache) ──────────────────────────────────
    await saga.addStep({
      name: 'InvalidateCache',
      execute: async () => {
        const cacheKeys = [
          `node:${nodeId}`,
          `neighbors:${nodeId}`,
          `search:${entityData.namespace || 'default'}:*`
        ];
        for (const key of cacheKeys) {
          if (key.includes('*')) {
            const matchingKeys = await redisService.keys(key);
            if (matchingKeys.length > 0) {
              await redisService.del(...matchingKeys);
            }
          } else {
            await redisService.del(key);
          }
        }
        // Publish event for subscribers
        await redisService.publish('polystore:changes', JSON.stringify({
          operationId,
          type: 'write',
          nodeId,
          label: entityData.label,
          timestamp: Date.now()
        }));
        return { invalidated: true };
      },
      compensate: async () => {
        // Cache does not require compensation — it self-heals
        // through TTL and subsequent read requests
      }
    });

    return { operationId, nodeId, vectorId, status: 'committed' };

  } catch (error) {
    await saga.compensate();
    throw new PolystoreWriteError(operationId, error);
  }
}
```

---

## 7.2 Compensating transactions

### Compensation principle

In the absence of distributed transactions, the **Saga** pattern is used — a sequence of local transactions with compensating actions. On failure at any step, all previous steps are rolled back in reverse order (LIFO).

### Compensation flow diagram

```
Forward path:
═══════════════════════════════════════════════════════════════

  Step 1              Step 2              Step 3
  CreateNode  ──OK──▶ UpsertVector ──OK──▶ InvalidateCache ──▶ COMMITTED
       │                    │                    │
       │                    │                    ✗ FAIL
       │                    │                    │
       ▼                    ▼                    ▼

Compensation path (LIFO):
═══════════════════════════════════════════════════════════════

                                          Compensate Step 3
                                          (no-op for cache)
                                                │
                                                ▼
                           Compensate Step 2
                           (delete vector from Qdrant)
                                  │
                                  ▼
            Compensate Step 1
            (DETACH DELETE node from Memgraph)
                    │
                    ▼
               ROLLED BACK


Failure scenarios:
═══════════════════════════════════════════════════════════════

  Failure at Step 1:   No compensation (nothing written)
  Failure at Step 2:   Compensate Step 1 (delete node from MG)
  Failure at Step 3:   Compensate Step 2 + Step 1
  Compensation failure: alertInconsistency() → manual intervention
```

### PolystoreSaga class

```javascript
class PolystoreSaga {
  constructor(operationId) {
    this.operationId = operationId;
    this.completedSteps = [];     // Stack of completed steps (LIFO for rollback)
    this.startedAt = Date.now();
    this.status = 'pending';      // pending | executing | committed | compensating | failed
  }

  /**
   * Adds and executes a saga step.
   * Each step registers its compensation function before execution.
   * On execute failure — the compensation for the current step is NOT called
   * (it did not complete successfully), but all previous steps are rolled back.
   *
   * @param {Object} step - { name, execute, compensate }
   * @returns {*} Result of execute()
   */
  async addStep(step) {
    this.status = 'executing';

    const stepRecord = {
      name: step.name,
      compensate: step.compensate,
      executedAt: Date.now(),
      result: null
    };

    try {
      // Execute the forward action
      const result = await step.execute();
      stepRecord.result = result;

      // Register in the stack AFTER successful execution
      this.completedSteps.push(stepRecord);

      logger.debug(`[Saga:${this.operationId}] Step "${step.name}" completed`, {
        stepIndex: this.completedSteps.length,
        result
      });

      return result;

    } catch (error) {
      logger.error(`[Saga:${this.operationId}] Step "${step.name}" failed`, {
        error: error.message,
        completedSteps: this.completedSteps.map(s => s.name)
      });

      // Do not add current step — it did not complete
      throw error;
    }
  }

  /**
   * Compensate all completed steps in reverse order (LIFO).
   * If a compensation step itself fails —
   * continue compensating the rest, but mark the desynchronization.
   */
  async compensate() {
    this.status = 'compensating';
    const errors = [];

    logger.warn(`[Saga:${this.operationId}] Starting compensation`, {
      stepsToCompensate: this.completedSteps.map(s => s.name)
    });

    // LIFO — reverse order
    const stepsToUndo = [...this.completedSteps].reverse();

    for (const step of stepsToUndo) {
      try {
        if (typeof step.compensate === 'function') {
          await step.compensate(step.result);
          logger.info(`[Saga:${this.operationId}] Compensated step "${step.name}"`);
        }
      } catch (compensationError) {
        errors.push({
          step: step.name,
          error: compensationError.message
        });

        logger.error(`[Saga:${this.operationId}] Compensation FAILED for step "${step.name}"`, {
          error: compensationError.message
        });
      }
    }

    if (errors.length > 0) {
      this.status = 'failed';
      await this.alertInconsistency(errors);
    } else {
      this.status = 'compensated';
    }

    return { status: this.status, errors };
  }

  /**
   * Alert on data desynchronization.
   * Called when a compensating transaction itself fails,
   * leaving data in an inconsistent state.
   *
   * @param {Array} errors - array of { step, error }
   */
  async alertInconsistency(errors) {
    const alert = {
      operationId: this.operationId,
      severity: 'CRITICAL',
      type: 'POLYSTORE_INCONSISTENCY',
      startedAt: this.startedAt,
      detectedAt: Date.now(),
      completedSteps: this.completedSteps.map(s => s.name),
      compensationErrors: errors,
      requiresManualIntervention: true
    };

    // Write to Memgraph for audit
    try {
      await memgraphService.runQuery(
        `CREATE (a:InconsistencyAlert {
          id: $id,
          operationId: $operationId,
          severity: $severity,
          errors: $errors,
          createdAt: datetime()
        })`,
        {
          id: crypto.randomUUID(),
          operationId: this.operationId,
          severity: alert.severity,
          errors: JSON.stringify(errors)
        }
      );
    } catch (dbError) {
      // If even the alert could not be written — log to stderr
      console.error('[CRITICAL] Cannot persist inconsistency alert:', alert);
    }

    // Publish to Redis for monitoring
    try {
      await redisService.publish('polystore:inconsistency', JSON.stringify(alert));
    } catch (redisError) {
      // Redis may be unavailable — expected during cascading failure
    }

    logger.error(`[CRITICAL] Polystore inconsistency detected`, alert);
  }
}
```

### Usage example

```javascript
async function createEntityWithFullSync(entityData) {
  const operationId = crypto.randomUUID();
  const saga = new PolystoreSaga(operationId);

  try {
    // ── Operation 1: Create node in Memgraph ──────────────────
    const mgResult = await saga.addStep({
      name: 'CreateNode',
      execute: async () => {
        const result = await memgraphService.runQuery(
          `CREATE (n:Entity {id: $id, name: $name, description: $desc, createdAt: datetime()})
           RETURN n.id AS nodeId`,
          { id: entityData.id, name: entityData.name, desc: entityData.description }
        );
        return { nodeId: result.records[0].get('nodeId') };
      },
      compensate: async (result) => {
        await memgraphService.runQuery(
          `MATCH (n:Entity {id: $id}) DETACH DELETE n`,
          { id: result.nodeId }
        );
        logger.info(`Compensated: deleted node ${result.nodeId} from Memgraph`);
      }
    });

    // ── Operation 2: Upsert vector to Qdrant ───────────────────
    const qdrantResult = await saga.addStep({
      name: 'UpsertVector',
      execute: async () => {
        const embedding = await teiService.embed(entityData.description);
        await qdrantService.upsert('entities', {
          id: mgResult.nodeId,
          vector: embedding,
          payload: {
            nodeId: mgResult.nodeId,
            name: entityData.name,
            label: 'Entity'
          }
        });
        return { vectorId: mgResult.nodeId, collection: 'entities' };
      },
      compensate: async (result) => {
        await qdrantService.delete(result.collection, {
          points: [result.vectorId]
        });
        logger.info(`Compensated: deleted vector ${result.vectorId} from Qdrant`);
      }
    });

    // ── Operation 3: Invalidate Redis cache ────────────────────
    const redisResult = await saga.addStep({
      name: 'InvalidateCache',
      execute: async () => {
        await redisService.del(`entity:${mgResult.nodeId}`);
        await redisService.del('entities:list');
        await redisService.publish('entities:updated', JSON.stringify({
          action: 'create',
          nodeId: mgResult.nodeId
        }));
        return { keysInvalidated: 2 };
      },
      compensate: async () => {
        // Cache self-heals — no compensation needed.
        // On the next read request the cache will be rebuilt from Memgraph.
        logger.info('Compensated: cache invalidation is self-healing, no action needed');
      }
    });

    return {
      operationId,
      nodeId: mgResult.nodeId,
      vectorId: qdrantResult.vectorId,
      cacheInvalidated: redisResult.keysInvalidated,
      status: 'committed'
    };

  } catch (error) {
    logger.error(`Entity creation failed, starting compensation`, { operationId, error: error.message });
    const compensation = await saga.compensate();
    throw new PolystoreWriteError(operationId, error, compensation);
  }
}
```

---

## 7.3 Eventually consistent

### Allowable temporary inconsistencies

In a polystore architecture, absolute consistency between stores is impossible. We define allowable windows of temporary inconsistency:

| Store pair | Type of desynchronization | Allowable window | Consequences | Detection |
|------------|---------------------------|-----------------|--------------|-----------|
| Memgraph → Qdrant | Node created in MG, vector not yet written to Qdrant | **< 5 seconds** | Semantic search does not find the new node. Graph queries work. | `findMissingVectors()` |
| Qdrant → Redis | Vector updated in Qdrant, Redis cache contains old result | **< 1 second** | Search results show stale data | TTL-based expiry |
| Deleted node → Orphaned vector | Node deleted from MG, vector remains in Qdrant | **< 1 hour** | Search may return references to non-existent nodes | `findOrphanedVectors()` |
| MG property update → Qdrant payload | Property changed in MG, payload in Qdrant is stale | **< 5 seconds** | Filtering by payload returns stale data | Periodic reconciliation |
| Redis cache → MG state | Cache contains stale data | **< TTL (300 sec)** | Read requests return stale data | TTL auto-expiry |

### Consistency levels

The system supports three consistency levels, selected based on the requirements of the operation:

| Level | Description | Memgraph | Qdrant | Redis | Latency | Usage |
|-------|-------------|----------|--------|-------|---------|-------|
| `STRONG` | All operations synchronous | sync | sync | sync | High (200-500ms) | Critical writes, financial data |
| `EVENTUAL` | MG synchronous, rest asynchronous | sync | async | async | Medium (50-100ms) | Standard CRUD operations |
| `BEST_EFFORT` | All operations asynchronous | async | async | async | Low (10-30ms) | Bulk import, background tasks |

### writeWithConsistency implementation

```javascript
const ConsistencyLevel = {
  STRONG: 'STRONG',
  EVENTUAL: 'EVENTUAL',
  BEST_EFFORT: 'BEST_EFFORT'
};

/**
 * Write data with the selected consistency level.
 *
 * @param {Object} entityData - data to write
 * @param {string} level - consistency level (STRONG | EVENTUAL | BEST_EFFORT)
 * @returns {Object} write result
 */
async function writeWithConsistency(entityData, level = ConsistencyLevel.EVENTUAL) {
  const operationId = crypto.randomUUID();
  const results = { operationId, level, steps: {} };

  switch (level) {

    case ConsistencyLevel.STRONG: {
      // ── All three steps synchronously, with full Saga compensation ──
      const saga = new PolystoreSaga(operationId);

      try {
        results.steps.memgraph = await saga.addStep({
          name: 'CreateNode',
          execute: () => writeToMemgraph(entityData),
          compensate: (res) => deleteFromMemgraph(res.nodeId)
        });

        results.steps.qdrant = await saga.addStep({
          name: 'UpsertVector',
          execute: () => upsertToQdrant(entityData, results.steps.memgraph.nodeId),
          compensate: (res) => deleteFromQdrant(res.vectorId)
        });

        results.steps.redis = await saga.addStep({
          name: 'InvalidateCache',
          execute: () => invalidateRedisCache(results.steps.memgraph.nodeId),
          compensate: () => {} // self-healing
        });

        results.status = 'committed';
      } catch (error) {
        await saga.compensate();
        throw new PolystoreWriteError(operationId, error);
      }
      break;
    }

    case ConsistencyLevel.EVENTUAL: {
      // ── Memgraph synchronously, Qdrant and Redis — via queue ──
      try {
        results.steps.memgraph = await writeToMemgraph(entityData);
      } catch (error) {
        throw new PolystoreWriteError(operationId, error);
      }

      // Async tasks via Redis queue
      const asyncTasks = {
        qdrant: {
          type: 'UPSERT_VECTOR',
          nodeId: results.steps.memgraph.nodeId,
          entityData,
          operationId,
          retryCount: 0,
          maxRetries: 3
        },
        redis: {
          type: 'INVALIDATE_CACHE',
          nodeId: results.steps.memgraph.nodeId,
          operationId
        }
      };

      await redisService.lpush('polystore:async-queue', JSON.stringify(asyncTasks.qdrant));
      await redisService.lpush('polystore:async-queue', JSON.stringify(asyncTasks.redis));

      results.steps.qdrant = { status: 'queued' };
      results.steps.redis = { status: 'queued' };
      results.status = 'committed-partial';
      break;
    }

    case ConsistencyLevel.BEST_EFFORT: {
      // ── All three steps asynchronously via queue ───────────────
      const taskId = crypto.randomUUID();

      const batchTask = {
        type: 'POLYSTORE_BATCH_WRITE',
        taskId,
        operationId,
        entityData,
        steps: ['memgraph', 'qdrant', 'redis'],
        retryCount: 0,
        maxRetries: 5,
        createdAt: Date.now()
      };

      await redisService.lpush('polystore:batch-queue', JSON.stringify(batchTask));

      results.steps.memgraph = { status: 'queued' };
      results.steps.qdrant = { status: 'queued' };
      results.steps.redis = { status: 'queued' };
      results.status = 'queued';
      break;
    }

    default:
      throw new Error(`Unknown consistency level: ${level}`);
  }

  return results;
}
```

---

## 7.4 Checkpoint/Resume

### Purpose

Long-running pipelines (bulk import, full re-indexing, GXE execution) may process thousands of nodes. On failure, progress must not be lost — resumption from the last successful step is required.

### CheckpointManager class

```javascript
class CheckpointManager {
  constructor(pipelineId, redisService) {
    this.pipelineId = pipelineId;
    this.redisService = redisService;
    this.checkpointKey = `checkpoint:${pipelineId}`;
    this.TTL_SECONDS = 86400; // 24 hours
  }

  /**
   * Saves a checkpoint to Redis with a 24-hour TTL.
   *
   * @param {Object} state - current pipeline state
   * @param {string} state.currentStep - name of the current step
   * @param {number} state.processedCount - number of processed items
   * @param {Array<string>} state.completedOps - list of completed operations
   * @param {Object} state.context - arbitrary context for resumption
   */
  async saveCheckpoint(state) {
    const checkpoint = {
      pipelineId: this.pipelineId,
      currentStep: state.currentStep,
      processedCount: state.processedCount,
      completedOps: state.completedOps || [],
      context: state.context || {},
      savedAt: Date.now(),
      version: 1
    };

    await this.redisService.set(
      this.checkpointKey,
      JSON.stringify(checkpoint),
      'EX',
      this.TTL_SECONDS
    );

    logger.debug(`[Checkpoint:${this.pipelineId}] Saved`, {
      step: state.currentStep,
      processed: state.processedCount
    });

    return checkpoint;
  }

  /**
   * Loads the latest checkpoint from Redis.
   *
   * @returns {Object|null} checkpoint state or null if not found / TTL expired
   */
  async loadCheckpoint() {
    const raw = await this.redisService.get(this.checkpointKey);

    if (!raw) {
      logger.debug(`[Checkpoint:${this.pipelineId}] No checkpoint found`);
      return null;
    }

    try {
      const checkpoint = JSON.parse(raw);
      logger.info(`[Checkpoint:${this.pipelineId}] Loaded`, {
        step: checkpoint.currentStep,
        processed: checkpoint.processedCount,
        savedAt: new Date(checkpoint.savedAt).toISOString()
      });
      return checkpoint;
    } catch (parseError) {
      logger.error(`[Checkpoint:${this.pipelineId}] Corrupt checkpoint data`, {
        error: parseError.message
      });
      return null;
    }
  }

  /**
   * Resumes pipeline execution from the last checkpoint.
   * Skips already completed operations.
   *
   * @param {Array<Object>} operations - full list of pipeline operations
   *   Each operation: { id, name, execute }
   * @param {Function} onProgress - callback for progress tracking
   * @returns {Object} execution result
   */
  async resumeFromCheckpoint(operations, onProgress) {
    const checkpoint = await this.loadCheckpoint();
    const completedOps = checkpoint ? new Set(checkpoint.completedOps) : new Set();
    let processedCount = checkpoint ? checkpoint.processedCount : 0;

    logger.info(`[Checkpoint:${this.pipelineId}] Resuming`, {
      totalOps: operations.length,
      alreadyCompleted: completedOps.size,
      skipping: completedOps.size
    });

    const results = [];

    for (const op of operations) {
      // Skip already completed operations
      if (completedOps.has(op.id)) {
        logger.debug(`[Checkpoint:${this.pipelineId}] Skipping completed op: ${op.name}`);
        continue;
      }

      try {
        const result = await op.execute();
        results.push({ opId: op.id, name: op.name, status: 'ok', result });

        completedOps.add(op.id);
        processedCount++;

        // Save checkpoint
        await this.saveCheckpoint({
          currentStep: op.name,
          processedCount,
          completedOps: Array.from(completedOps),
          context: checkpoint ? checkpoint.context : {}
        });

        if (onProgress) {
          onProgress({
            completed: processedCount,
            total: operations.length,
            currentOp: op.name
          });
        }

      } catch (error) {
        logger.error(`[Checkpoint:${this.pipelineId}] Op "${op.name}" failed`, {
          error: error.message,
          processedCount
        });

        // Save checkpoint BEFORE the error — on retry skip completed ones
        await this.saveCheckpoint({
          currentStep: op.name,
          processedCount,
          completedOps: Array.from(completedOps),
          context: { lastError: error.message, failedOp: op.id }
        });

        throw error;
      }
    }

    // Clear checkpoint after successful completion
    await this.redisService.del(this.checkpointKey);

    return {
      pipelineId: this.pipelineId,
      totalProcessed: processedCount,
      results,
      status: 'completed'
    };
  }
}
```

### Checkpoint frequency

| Pipeline type | Checkpoint frequency | Rationale |
|---------------|----------------------|-----------|
| **Bulk import** | Every 100 nodes | Balance between performance and acceptable progress loss. Reprocessing 100 nodes — acceptable ~30 seconds. |
| **Incremental update** | Every 10 nodes | Incremental updates are more valuable — each node may contain unique data. Losing 10 nodes — acceptable. |
| **GXE execution** | Every node | Each GXE graph node may trigger an LLM call (expensive). Repeating an LLM call wastes budget. Checkpoint at every step is mandatory. |
| **Reindexing** | Every 500 vectors | Reindexing is an idempotent operation. Repeating 500 upserts in Qdrant — ~10 seconds, acceptable. |
| **Graph migration** | Every migration step | Migration changes structure. Partial migration is more dangerous than partial import. Checkpoint at every DDL step. |

---

## 7.5 Health checks

### PolystoreHealthChecker class

```javascript
class PolystoreHealthChecker {
  constructor(memgraphService, qdrantService, redisService) {
    this.memgraph = memgraphService;
    this.qdrant = qdrantService;
    this.redis = redisService;
  }

  /**
   * Full consistency check between stores.
   *
   * @returns {Object} desynchronization report
   */
  async checkConsistency() {
    const report = {
      checkedAt: new Date().toISOString(),
      issues: [],
      stats: {}
    };

    // ── Check 1: Orphaned vectors ────────────────────────────────
    const orphaned = await this.findOrphanedVectors();
    report.stats.orphanedVectors = orphaned.length;
    if (orphaned.length > 0) {
      report.issues.push({
        type: 'ORPHANED_VECTORS',
        severity: orphaned.length > 100 ? 'HIGH' : 'MEDIUM',
        count: orphaned.length,
        description: `Found ${orphaned.length} vectors in Qdrant without corresponding nodes in Memgraph`,
        vectorIds: orphaned.slice(0, 50) // First 50 for report
      });
    }

    // ── Check 2: Missing vectors ─────────────────────────────────
    const missing = await this.findMissingVectors();
    report.stats.missingVectors = missing.length;
    if (missing.length > 0) {
      report.issues.push({
        type: 'MISSING_VECTORS',
        severity: missing.length > 50 ? 'HIGH' : 'MEDIUM',
        count: missing.length,
        description: `Found ${missing.length} nodes in Memgraph with vectorId but without corresponding records in Qdrant`,
        nodeIds: missing.slice(0, 50)
      });
    }

    // ── Check 3: Stale cache ─────────────────────────────────────
    const stale = await this.findStaleCache();
    report.stats.staleCacheKeys = stale.length;
    if (stale.length > 0) {
      report.issues.push({
        type: 'STALE_CACHE',
        severity: 'LOW',
        count: stale.length,
        description: `Found ${stale.length} Redis cache keys referencing non-existent or changed nodes`,
        keys: stale.slice(0, 20)
      });
    }

    report.healthy = report.issues.length === 0;
    return report;
  }

  /**
   * Find "orphaned" vectors — records in Qdrant
   * for which no corresponding node exists in Memgraph.
   *
   * Algorithm: scroll through all points in the Qdrant collection,
   * check existence in Memgraph for each batch.
   *
   * @param {string} collection - Qdrant collection name (default 'default')
   * @returns {Array<string>} list of vectorIds without nodes in MG
   */
  async findOrphanedVectors(collection = 'default') {
    const orphaned = [];
    let offset = null;
    const batchSize = 100;

    do {
      // Scroll through Qdrant points
      const scrollResult = await this.qdrant.scroll(collection, {
        limit: batchSize,
        offset: offset,
        with_payload: true,
        with_vectors: false // Vectors not needed for checking
      });

      const points = scrollResult.points || [];
      if (points.length === 0) break;

      // Extract nodeId from payload of each point
      const nodeIds = points
        .map(p => p.payload?.nodeId || p.id)
        .filter(Boolean);

      if (nodeIds.length > 0) {
        // Batch check in Memgraph: which nodeIds exist?
        const existResult = await this.memgraph.runQuery(
          `UNWIND $ids AS nid
           OPTIONAL MATCH (n {id: nid})
           RETURN nid, n IS NOT NULL AS exists`,
          { ids: nodeIds }
        );

        const existingSet = new Set(
          existResult.records
            .filter(r => r.get('exists'))
            .map(r => r.get('nid'))
        );

        // Those not in Memgraph — orphaned
        for (const point of points) {
          const nodeId = point.payload?.nodeId || point.id;
          if (!existingSet.has(nodeId)) {
            orphaned.push(nodeId);
          }
        }
      }

      offset = scrollResult.next_page_offset;
    } while (offset !== null && offset !== undefined);

    return orphaned;
  }

  /**
   * Find "missing" vectors — nodes in Memgraph
   * that have a vectorId property but have no corresponding record in Qdrant.
   *
   * @param {string} collection - Qdrant collection name (default 'default')
   * @returns {Array<string>} list of nodeIds with missing vectors
   */
  async findMissingVectors(collection = 'default') {
    const missing = [];

    // Get all nodes with vectorId from Memgraph
    const mgResult = await this.memgraph.runQuery(
      `MATCH (n)
       WHERE n.vectorId IS NOT NULL
       RETURN n.id AS nodeId, n.vectorId AS vectorId`
    );

    const nodesWithVectors = mgResult.records.map(r => ({
      nodeId: r.get('nodeId'),
      vectorId: r.get('vectorId')
    }));

    // Batch check in Qdrant
    const batchSize = 100;
    for (let i = 0; i < nodesWithVectors.length; i += batchSize) {
      const batch = nodesWithVectors.slice(i, i + batchSize);
      const pointIds = batch.map(n => n.vectorId);

      try {
        const getResult = await this.qdrant.getPoints(collection, {
          ids: pointIds,
          with_payload: false,
          with_vectors: false
        });

        const foundIds = new Set((getResult || []).map(p => p.id));

        for (const node of batch) {
          if (!foundIds.has(node.vectorId)) {
            missing.push(node.nodeId);
          }
        }
      } catch (error) {
        // If collection does not exist — all vectors are missing
        if (error.message?.includes('not found')) {
          missing.push(...batch.map(n => n.nodeId));
        } else {
          throw error;
        }
      }
    }

    return missing;
  }

  /**
   * Find stale cache entries — keys in Redis
   * referencing nodes that were deleted or changed in Memgraph.
   *
   * @returns {Array<string>} list of stale Redis keys
   */
  async findStaleCache() {
    const staleKeys = [];

    // Scan node:* keys in Redis
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', 'node:*', 'COUNT', 100);
      cursor = nextCursor;

      for (const key of keys) {
        const nodeId = key.replace('node:', '');
        const cached = await this.redis.get(key);

        if (!cached) continue;

        try {
          const cachedData = JSON.parse(cached);

          // Check existence and freshness in Memgraph
          const mgResult = await this.memgraph.runQuery(
            `MATCH (n {id: $id})
             RETURN n.updatedAt AS updatedAt`,
            { id: nodeId }
          );

          if (mgResult.records.length === 0) {
            // Node deleted — cache is stale
            staleKeys.push(key);
          } else {
            const mgUpdatedAt = mgResult.records[0].get('updatedAt');
            if (cachedData.cachedAt && mgUpdatedAt && new Date(mgUpdatedAt) > new Date(cachedData.cachedAt)) {
              // Node updated after caching
              staleKeys.push(key);
            }
          }
        } catch (parseError) {
          // Invalid JSON in cache — also stale
          staleKeys.push(key);
        }
      }
    } while (cursor !== '0');

    return staleKeys;
  }

  /**
   * Automatically repair detected desynchronizations.
   *
   * @param {Object} report - report from checkConsistency()
   * @returns {Object} repair result
   */
  async autoRepair(report) {
    const repairLog = {
      startedAt: new Date().toISOString(),
      repaired: [],
      failed: []
    };

    for (const issue of report.issues) {
      try {
        switch (issue.type) {

          case 'ORPHANED_VECTORS': {
            // Delete orphaned vectors from Qdrant
            const orphanedIds = issue.vectorIds || [];
            if (orphanedIds.length > 0) {
              await this.qdrant.delete('default', {
                points: orphanedIds
              });
              repairLog.repaired.push({
                type: 'ORPHANED_VECTORS',
                action: 'Deleted orphaned vectors from Qdrant',
                count: orphanedIds.length
              });
            }
            break;
          }

          case 'MISSING_VECTORS': {
            // Recreate missing vectors
            const nodeIds = issue.nodeIds || [];
            let reindexed = 0;

            for (const nodeId of nodeIds) {
              try {
                const mgResult = await this.memgraph.runQuery(
                  `MATCH (n {id: $id})
                   RETURN n.id AS nodeId, n.description AS text, labels(n)[0] AS label`,
                  { id: nodeId }
                );

                if (mgResult.records.length > 0) {
                  const record = mgResult.records[0];
                  const text = record.get('text');

                  if (text) {
                    const embedding = await teiService.embed(text);
                    await this.qdrant.upsert('default', {
                      id: nodeId,
                      vector: embedding,
                      payload: {
                        nodeId,
                        label: record.get('label'),
                        text
                      }
                    });
                    reindexed++;
                  } else {
                    // No text — remove vectorId from node
                    await this.memgraph.runQuery(
                      `MATCH (n {id: $id}) REMOVE n.vectorId`,
                      { id: nodeId }
                    );
                  }
                }
              } catch (nodeError) {
                repairLog.failed.push({
                  type: 'MISSING_VECTORS',
                  nodeId,
                  error: nodeError.message
                });
              }
            }

            repairLog.repaired.push({
              type: 'MISSING_VECTORS',
              action: 'Recreated missing vectors in Qdrant',
              count: reindexed
            });
            break;
          }

          case 'STALE_CACHE': {
            // Delete stale cache keys
            const keys = issue.keys || [];
            if (keys.length > 0) {
              await this.redis.del(...keys);
              repairLog.repaired.push({
                type: 'STALE_CACHE',
                action: 'Deleted stale Redis cache keys',
                count: keys.length
              });
            }
            break;
          }

          default:
            logger.warn(`Unknown issue type: ${issue.type}`);
        }

      } catch (repairError) {
        repairLog.failed.push({
          type: issue.type,
          error: repairError.message
        });
      }
    }

    repairLog.completedAt = new Date().toISOString();
    return repairLog;
  }
}
```

### Check schedule

| Check | Interval | Rationale | autoRepair |
|-------|----------|-----------|------------|
| **Orphaned vectors** (`findOrphanedVectors`) | Every 6 hours | Orphaned vectors accumulate slowly (only on delete failures). 6 hours is enough for detection without overloading Qdrant with scrolling. | Yes — delete from Qdrant |
| **Missing vectors** (`findMissingVectors`) | Every 1 hour | Missing vectors affect semantic search. 1 hour is a compromise between search freshness and re-indexing load. | Yes — recreate embeddings |
| **Stale cache** (`findStaleCache`) | Every 15 minutes | Stale cache is the least critical problem (TTL 300 seconds self-cleans). 15 minutes catches keys without TTL and keys with long TTL. | Yes — delete keys |
| **Hash chain integrity** | Weekly | Checking the integrity of the audit log hash chain. Expensive operation (full traversal). Weekly is sufficient for detecting tampering. | No — manual investigation |

---

*This document is part of the [UN ProjectAdvisor Codex](../CODEX_INDEX.md)*
