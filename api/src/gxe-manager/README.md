# GXE Manager

Production-grade orchestrator for executable graph executions. Manages lifecycle, triggers, signals, transactions, and observability.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        GxeManager Layer                          │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────┤
│ Trigger     │ Execution   │ Signal      │ Transaction │ Observ- │
│ Engine      │ Registry    │ Router      │ Coordinator │ ability │
├─────────────┴─────────────┴─────────────┴─────────────┴─────────┤
│                     GxeManagerService                            │
├─────────────────────────────────────────────────────────────────┤
│                       RuntimeEngine                              │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────┤
│ BullMQ      │ Redis       │ Memgraph    │ Qdrant      │ LLM     │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────┘
```

## Components

### GxeManagerService
Central orchestrator managing multiple graph executions. Handles launch, pause, resume, cancel, rollback operations.

### ExecutionRegistry
3-tier storage (LRU Cache → Redis → Memgraph) for ExecutionRecords. Provides fast access with persistence.

### TriggerEngine
Supports 7 trigger types: MANUAL, CRON, INTERVAL, ONCE, SIGNAL, DEPENDENCY, SENSOR.

### ConcurrencyGovernor
Rate limiting: global max concurrent, per-graph limits, per-priority quotas.

### SignalRouter
Routes signals with idempotency, resume token validation, Dead Letter Queue.

### TransactionCoordinator
SAGA pattern: sequential/parallel steps, automatic compensation, distributed locking (Redlock).

### AuditLogger
Immutable audit trail persisted to Memgraph, queryable by action/operator/time.

## API Reference

### Executions
| Method | Path | Description |
|--------|------|-------------|
| POST | /executions | Launch new execution |
| GET | /executions | List with filters |
| GET | /executions/:id | Get details |
| POST | /executions/:id/pause | Graceful pause |
| POST | /executions/:id/resume | Resume with payload |
| POST | /executions/:id/cancel | Cancel execution |
| POST | /executions/:id/rollback | Rollback to checkpoint |
| POST | /executions/:id/override-wait | Override async wait |
| POST | /executions/:id/inject-variable | Inject runtime variable |

### Transactions
| Method | Path | Description |
|--------|------|-------------|
| POST | /transactions | Start SAGA |
| GET | /transactions | List transactions |
| POST | /transactions/:id/execute | Execute |
| POST | /transactions/:id/resume | Resume paused |
| POST | /transactions/:id/cancel | Cancel with compensation |
| POST | /transactions/:id/compensate | Run compensation |

### Observability
| Method | Path | Description |
|--------|------|-------------|
| GET | /stream | SSE event stream |
| GET | /stats | Execution counts |
| GET | /capacity | System capacity |
| GET | /audit | Audit log query |

## Usage

```javascript
// Launch execution
const execution = await manager.launch('my-graph', { input: 'data' }, {
  priority: 'HIGH',
  timeoutSeconds: 300
});

// Create SAGA transaction
const transaction = await transactionCoordinator.startTransaction({
  name: 'Order Processing',
  steps: [
    { graphId: 'validate', compensationGraphId: 'rollback-validate' },
    { graphId: 'charge', compensationGraphId: 'refund' },
    { graphId: 'ship' }
  ],
  onFailure: 'COMPENSATE'
});
```

## Configuration

Environment variables:
- `GXE_GLOBAL_MAX_CONCURRENT`: Max concurrent executions (default: 50)
- `GXE_PER_GRAPH_MAX`: Per-graph limit (default: 10)
- `GXE_CHECKPOINT_TTL`: Checkpoint retention in seconds (default: 86400)
- `GXE_TRANSACTION_TTL`: Transaction TTL in seconds (default: 86400)
