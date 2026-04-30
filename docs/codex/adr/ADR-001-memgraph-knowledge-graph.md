# ADR-001: Memgraph as Knowledge Graph Store

**Status:** ACCEPTED
**Date:** 2025-01-15
**Author:** Architecture Team

## Context

UN ProjectAdvisor needs a database to store extracted knowledge from legacy systems (IMIS, iNeed/FlowDesc, TFS/TFVC). The knowledge has complex relationships:
- Tables reference other tables (foreign keys)
- Methods call other methods
- Business rules depend on multiple entities
- Workflows have sequential and parallel branches

A traditional relational database would require many JOIN operations and struggle with variable-depth traversals. A document store would lose relationship semantics.

## Decision

We will use **Memgraph** as the primary knowledge graph store.

Memgraph is chosen over alternatives because:
1. **Cypher query language** — industry standard, readable, powerful for graph traversal
2. **In-memory performance** — sub-millisecond queries for connected data
3. **MAGE library** — built-in graph algorithms (PageRank, community detection, pathfinding)
4. **Bolt protocol** — compatible with Neo4j drivers and tooling
5. **Open source** — no vendor lock-in, self-hostable
6. **Streaming support** — Kafka/Pulsar integration for real-time updates

## Consequences

### Positive
- Complex relationship queries are natural and fast
- Graph algorithms available out-of-the-box
- Schema-flexible — can evolve with extraction pipeline
- Visual exploration possible (Memgraph Lab, NEXUS UI)

### Negative
- Single-node limitation — no native horizontal scaling
- Memory-bound — dataset must fit in RAM
- Less mature ecosystem than Neo4j
- Requires graph thinking — learning curve for SQL developers

### Neutral
- Need separate vector store for semantic search (Qdrant)
- Need separate cache layer for high-frequency reads (Redis)

## Alternatives Considered

### Alternative 1: Neo4j
- Industry leader, largest community
- **Rejected:** License cost for enterprise features, heavier resource footprint

### Alternative 2: Amazon Neptune
- Managed service, scales automatically
- **Rejected:** Cloud lock-in, higher latency, no MAGE equivalent

### Alternative 3: PostgreSQL with Apache AGE
- Familiar SQL + graph extension
- **Rejected:** Less mature graph features, complex setup

### Alternative 4: Pure Document Store (MongoDB)
- Flexible schema, good at hierarchical data
- **Rejected:** Loses relationship semantics, requires application-level joins

## Related ADRs

- ADR-005: Polystore Architecture (Memgraph + Qdrant + Redis)
- ADR-003: Four-Namespace Architecture

## Implementation Status

- [x] Memgraph deployed (Docker)
- [x] memgraph.service.js implemented
- [x] Schema Registry validation
- [x] 4,662 nodes migrated
- [x] Health check endpoint
