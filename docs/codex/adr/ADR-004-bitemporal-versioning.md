# ADR-004: Bi-temporal Versioning with Hash Chain

**Status:** ACCEPTED
**Date:** 2025-02-20
**Author:** Architecture Team

## Context

Knowledge extracted from legacy systems changes over time:
- A business rule is updated in the source system
- An extraction algorithm improves and produces different results
- Human review corrects an error

We need to track both:
1. **When we learned** something (transaction time)
2. **When it was true** in reality (valid time)

Additionally, for audit and integrity, we need cryptographic proof that history wasn't tampered with.

## Decision

We will implement **bi-temporal versioning with hash chain** for critical entities (NodeVersion label).

### Bi-temporal Fields
- `ttStart` / `ttEnd` — Transaction Time (when recorded in system)
- `vtStart` / `vtEnd` — Valid Time (when true in reality)

### Hash Chain Fields
- `contentHash` — SHA-256 of canonicalized node properties
- `previousHash` — chainHash of previous version (or 'GENESIS')
- `chainHash` — SHA-256(previousHash + contentHash)

### Version Chain
```
v1 (SUPERSEDED) <-SUPERSEDES- v2 (SUPERSEDED) <-SUPERSEDES- v3 (ACTIVE)
```

## Consequences

### Positive
- Full audit trail of all changes
- Can answer "what did we know at time T?"
- Can answer "what was true at time T?"
- Tamper-evident history (hash chain)
- Supports compliance requirements

### Negative
- Storage overhead (multiple versions per entity)
- Query complexity for temporal queries
- Hash computation overhead on write

### Neutral
- Not all nodes need versioning (see ADR-006 for which types)
- Tombstones for soft delete (90-day restore window)

## Alternatives Considered

### Alternative 1: Simple Versioning (no temporal)
- Just version numbers, no time tracking
- **Rejected:** Cannot answer temporal queries

### Alternative 2: Event Sourcing
- Store all events, compute state
- **Rejected:** Overkill, complex to query current state

### Alternative 3: Mutable with Audit Log
- Update in place, separate audit log
- **Rejected:** Audit log can diverge, harder to query history

## Related ADRs

- ADR-001: Memgraph as Knowledge Graph Store
- ADR-006: Information Types Classification

## Implementation Status

- [x] NodeVersion schema defined
- [x] version-manager.js implemented (CC-019)
- [x] SUPERSEDES chain creation
- [x] Bridge pattern for domain<->version links
- [x] Tombstone soft delete (CC-021)
- [x] God Mode for immutability override
