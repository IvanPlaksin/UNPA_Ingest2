# ADR-006: Information Types Classification

**Status:** ACCEPTED
**Date:** 2025-03-12
**Author:** Architecture Team

## Context

After auditing the knowledge base (AUDIT-KB-001, AUDIT-KB-002), we found:
- 76 different label combinations
- No clear classification system
- Mixed concerns (system docs vs extracted data)
- Inconsistent metadata requirements

We need a systematic way to categorize all information in the system.

## Decision

We will classify all information into **17 Information Types** across two levels:

### Level 1: System Meta (about UN ProjectAdvisor itself)
1. SystemArchitecture — components, dependencies
2. SystemRequirements — features, backlog
3. SystemDecisions — ADRs, rationale
4. SystemMetrics — performance, usage
5. SystemConfig — AI config, settings
6. ResearchKnowledge — theories, methodologies

### Level 2: Target Project (about analyzed systems)
7. ExtractedSchema — tables, columns, procedures
8. ExtractedCode — functions, methods, classes
9. ExtractedRules — business rules, validations
10. ExtractedEntities — concepts, organizations
11. ExecutableGraph — GXE subgraphs, ports
12. ExecutionRecord — execution history
13. InformationGraph — domain graphs, behavioral
14. CatalogInfra — catalog entries, versions
15. IngestionTracking — sessions, phases
16. GXEAudit — tech debt, gaps, goals
17. ReferenceData — support groups, staff profiles

Each type has:
- Mandatory namespace
- Allowed labels
- Required fields
- Allowed edge types

## Consequences

### Positive
- Clear categorization for all nodes
- Routing rules can auto-assign namespace
- Validation can check type-specific requirements
- Documentation is type-aware

### Negative
- Must maintain type registry
- New labels need classification
- Migration for legacy labels

### Neutral
- Documented in CODEX-DOMAINS.md (Part IX)

## Alternatives Considered

### Alternative 1: No Classification
- Just labels and namespaces
- **Rejected:** Too unstructured, hard to maintain

### Alternative 2: Hierarchical Types
- Type -> Subtype -> Label
- **Rejected:** Over-engineering, three levels is enough

## Related ADRs

- ADR-003: Four-Namespace Architecture
- ADR-004: Bi-temporal Versioning

## Implementation Status

- [x] CODEX-DOMAINS.md written (CC-028)
- [x] LABEL_ROUTING map defined
- [x] All 76 labels classified
- [x] 0 unclassified labels
- [x] Routing rules in production
