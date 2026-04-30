# ADR-002: GXE AOPEG Execution Model

**Status:** ACCEPTED
**Date:** 2025-02-01
**Author:** Architecture Team

## Context

UN ProjectAdvisor needs to execute business logic graphs extracted from legacy systems. These graphs represent:
- Approval workflows
- Data transformation pipelines
- Decision trees
- Multi-step integrations

We need an execution engine that can:
1. Execute graphs with complex topologies (DAG, with potential cycles for retries)
2. Handle async operations (LLM calls, external APIs)
3. Support partial execution and resumption
4. Track execution history for debugging and optimization

## Decision

We will implement **GXE (Graph Execution Engine)** using the **AOPEG (Asynchronous Observable Parallel Execution Graph)** model.

Key principles:
1. **Asynchronous** — all node executions are async/await
2. **Observable** — execution state is observable via events/SSE
3. **Parallel** — independent nodes execute concurrently
4. **Execution** — nodes transform input to output
5. **Graph** — topology defines execution order

Execution flow:
```
Parse DAG -> Validate -> Build Execution Plan -> Execute Nodes -> Collect Results
                |              |                    |
           Schema Check   Topological Sort    Parallel where possible
```

## Consequences

### Positive
- Natural representation of business workflows
- Parallelism improves throughput
- Observable state enables real-time UI updates
- Graphs are reusable and composable

### Negative
- Complex debugging for parallel failures
- State management overhead
- Learning curve for graph-based thinking

### Neutral
- Requires catalog system for graph storage
- Execution records needed for history

## Alternatives Considered

### Alternative 1: Sequential Pipeline
- Simple linear execution
- **Rejected:** Cannot represent parallel branches, inefficient

### Alternative 2: State Machine (XState)
- Proven library, good for workflows
- **Rejected:** Less natural for data transformation, harder to parallelize

### Alternative 3: Temporal.io
- Production-grade workflow engine
- **Rejected:** External dependency, overkill for current scale

## Related ADRs

- ADR-001: Memgraph as Knowledge Graph Store
- ADR-005: Polystore Architecture (execution records in META)

## Implementation Status

- [x] RuntimeEngine implemented
- [x] AOPEG node types defined
- [x] ExecutionRecorder integrated (CC-029)
- [x] Catalog auto-save (CC-020)
- [ ] Pattern Library promotion
- [ ] Visual graph editor in NEXUS
