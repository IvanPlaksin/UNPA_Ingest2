# ADR-005: Polystore Architecture

**Status:** ACCEPTED
**Date:** 2025-02-25
**Author:** Architecture Team

## Context

Different data access patterns require different storage technologies:
- **Graph traversal** — finding connected entities
- **Semantic search** — finding similar content by meaning
- **Caching** — fast access to frequently read data
- **Job queues** — reliable async task processing

No single database excels at all patterns.

## Decision

We will implement a **polystore architecture** with three primary stores:

| Store | Technology | Purpose |
|-------|------------|---------|
| **Graph** | Memgraph | Nodes, edges, relationships, queries |
| **Vector** | Qdrant | Embeddings, semantic search, similarity |
| **Cache/Queue** | Redis | Caching, pub/sub, job queues (BullMQ) |

### Write Order
```
Memgraph (primary) -> Qdrant (secondary) -> Redis (cache)
```

### Consistency Model
- Memgraph is source of truth
- Qdrant mirrors node embeddings
- Redis is ephemeral cache (can be rebuilt)

### Saga Pattern for Writes
Compensating transactions if any step fails (LIFO rollback).

## Consequences

### Positive
- Best tool for each job
- Semantic search without graph overhead
- Fast caching layer
- Reliable job processing

### Negative
- Operational complexity (3 systems)
- Consistency challenges (eventual consistency)
- Orphaned data risk (Qdrant without Memgraph)

### Neutral
- Need OrphanDetector cron (implemented CC-017)
- Need health checks across all stores

## Alternatives Considered

### Alternative 1: Memgraph Only
- Add vector search via MAGE/custom
- **Rejected:** Not optimized for high-dim vectors

### Alternative 2: Single Document Store
- MongoDB with vector search
- **Rejected:** Loses graph semantics

### Alternative 3: Cloud-native (AWS)
- Neptune + OpenSearch + ElastiCache
- **Rejected:** Cloud lock-in, cost

## Related ADRs

- ADR-001: Memgraph as Knowledge Graph Store
- ADR-003: Four-Namespace Architecture

## Implementation Status

- [x] Memgraph service
- [x] Qdrant service with collections
- [x] Redis service with BullMQ
- [x] Polystore Saga (CC-018)
- [x] OrphanDetector cron (CC-017)
- [x] Health endpoints (CC-031)
