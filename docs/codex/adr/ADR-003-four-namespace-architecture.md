# ADR-003: Four-Namespace Architecture

**Status:** ACCEPTED
**Date:** 2025-02-15
**Author:** Architecture Team

## Context

UN ProjectAdvisor stores different types of information:
- System architecture documentation
- Extracted knowledge from target projects
- Execution infrastructure and metrics
- Executable graphs

Without clear separation, we risk:
- Cross-project data leakage
- Confusion between system docs and extracted data
- Difficulty querying specific domains
- No clear ownership/permissions model

## Decision

We will organize all graph nodes into **four namespaces**:

| Namespace | Purpose | Access |
|-----------|---------|--------|
| **CORE** | System infrastructure, catalog, tracking | Read: all, Write: system |
| **PROJECT** | Extracted knowledge from target systems | Read: project members, Write: extractors |
| **META** | Execution records, metrics, configs, ADRs | Read: all, Write: system |
| **GXE** | Executable graphs, ports, subgraphs | Read: all, Write: GXE engine |

Every node MUST have a `namespace` property. Namespace is validated on write.

## Consequences

### Positive
- Clear separation of concerns
- Easy to query specific domains (`WHERE n.namespace = 'PROJECT'`)
- Foundation for access control
- Prevents accidental cross-contamination

### Negative
- Additional field on every node
- Must maintain routing logic
- Cross-namespace queries need explicit handling

### Neutral
- Migration required for legacy nodes (completed in FIX-KB-003)

## Alternatives Considered

### Alternative 1: Separate Databases
- Physical isolation per domain
- **Rejected:** Cannot easily cross-reference, operational overhead

### Alternative 2: Label-based Separation
- Use labels like `:Core:Table` vs `:Project:Table`
- **Rejected:** Inconsistent, hard to query, label explosion

### Alternative 3: No Separation
- All nodes in single space
- **Rejected:** Data leakage risk, query complexity

## Related ADRs

- ADR-001: Memgraph as Knowledge Graph Store
- ADR-006: Information Types Classification

## Implementation Status

- [x] Namespace field required on all nodes
- [x] Schema validation in mergeNode()
- [x] Routing rules in CODEX-DOMAINS
- [x] Migration completed (FIX-KB-002, FIX-KB-003, FIX-KB-004)
- [x] 0 nodes without namespace
