# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for UN ProjectAdvisor.

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-001](ADR-001-memgraph-knowledge-graph.md) | Memgraph as Knowledge Graph Store | ACCEPTED | 2025-01-15 |
| [ADR-002](ADR-002-gxe-aopeg-execution.md) | GXE AOPEG Execution Model | ACCEPTED | 2025-02-01 |
| [ADR-003](ADR-003-four-namespace-architecture.md) | Four-Namespace Architecture | ACCEPTED | 2025-02-15 |
| [ADR-004](ADR-004-bitemporal-versioning.md) | Bi-temporal Versioning with Hash Chain | ACCEPTED | 2025-02-20 |
| [ADR-005](ADR-005-polystore-architecture.md) | Polystore Architecture | ACCEPTED | 2025-02-25 |
| [ADR-006](ADR-006-information-types.md) | Information Types Classification | ACCEPTED | 2025-03-12 |

## Format

Each ADR follows the [Michael Nygard format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) with extensions:

- **Status:** PROPOSED | ACCEPTED | DEPRECATED | SUPERSEDED
- **Context:** Why this decision is needed
- **Decision:** What we decided
- **Consequences:** Positive, negative, neutral impacts
- **Alternatives:** What else was considered
- **Related ADRs:** Cross-references
- **Implementation Status:** Checklist of tasks

## Creating New ADRs

1. Copy template from any existing ADR
2. Use next sequential number: `ADR-NNN-short-title.md`
3. Fill all sections
4. Add to this index
5. Create node in Memgraph (namespace: META, label: ADR)

## Memgraph Integration

ADRs are also stored as nodes:

```cypher
MATCH (a:ADR) RETURN a.adrId, a.title, a.status ORDER BY a.adrId;
```
