# CODEX UN PROJECTADVISOR

**Version:** 0.1.2-draft
**Created:** 2026-03-12
**Updated:** 2026-03-19
**Status:** In development

## Purpose

The Codex is a collection of standards for storing, versioning, and managing knowledge
in the UN ProjectAdvisor system. Intended for:
- AI agents performing operations on the knowledge graph
- Architects designing system extensions
- Operators maintaining the system

## Structure

| Part | Document | Status | Version |
|------|----------|--------|---------|
| 0 | [Manifesto for AI Agents](manifesto/AI_MANIFESTO.md) | 🟡 In development | 0.1.0 |
| I | [CODEX-CRUD: Operations Standard](standards/CODEX-CRUD.md) | 🟡 In development | 0.1.0 |
| II | [CODEX-META: Metadata Standard](standards/CODEX-META.md) | 🟡 In development | 0.1.0 |
| III | [CODEX-VERSION: Versioning Standard](standards/CODEX-VERSION.md) | 🟡 In development | 0.1.0 |
| IV | [CODEX-NS: Namespace Standard](standards/CODEX-NS.md) | 🟡 In development | 0.1.0 |
| V | [CODEX-VALID: Validation Standard](standards/CODEX-VALID.md) | 🟡 In development | 0.1.0 |
| VI | [CODEX-CATALOG: Catalog Standard](standards/CODEX-CATALOG.md) | 🟡 In development | 0.1.0 |
| VII | [CODEX-POLY: Polystore Protocol](standards/CODEX-POLY.md) | 🟡 In development | 0.1.0 |
| VIII | [Self-Evolving System](future/SELF-EVOLUTION.md) | 🟡 In development | 0.1.0 |
| IX | [CODEX-DOMAINS: Information Type Standards](standards/CODEX-DOMAINS.md) | 🟡 In development | 0.1.0 |

## Appendices

| Appendix | Document | Status |
|----------|----------|--------|
| A | [JSON Schemas](appendices/A_JSON_SCHEMAS.md) | 🔴 Not started |
| B | [Cypher Templates](appendices/B_CYPHER_TEMPLATES.md) | 🔴 Not started |
| C | [Error Codes](appendices/C_ERROR_CODES.md) | 🔴 Not started |
| D | [Migration Guide](appendices/D_MIGRATION_GUIDE.md) | 🔴 Not started |
| E | [Code Review Checklist](appendices/E_CODE_REVIEW_CHECKLIST.md) | 🔴 Not started |
| ADR | [Architecture Decision Records](adr/README.md) | 🟢 6 ADRs |

## Codex Principles

1. **Immutability-first** — data is never deleted, only versioned
2. **Provenance by default** — every fact has a source and a confidence score
3. **Bi-temporal tracking** — transaction time + valid time for every record
4. **Hash chain integrity** — cryptographic verification of the change chain
5. **Polystore coordination** — atomicity or compensation when writing to multiple stores
6. **Agent accountability** — AI agents are responsible for data quality

## Research Foundation

The Codex is based on state-of-the-art research:

### Temporal Knowledge Graphs
- **Graphiti / Zep** — validity windows, facts are invalidated not deleted
- **AeonG** — anchor+delta storage for efficient version storage
- **ConVer-G** — bitstring versioning for fast temporal queries

### Immutable Data Systems
- **Datomic** — datoms with temporal coordinates, append-only
- **EventStoreDB** — event sourcing, CQRS patterns
- **Git** — content-addressable storage, Merkle trees

### Provenance Standards
- **W3C PROV-O** — Entity/Activity/Agent triad
- **PAV Ontology** — Provenance/Authoring/Versioning
- **OpenMetadata** — column-level lineage

### Multi-Agent Systems
- **Google A2A Protocol (2025)** — agent-to-agent communication
- **CIR3** — balanced collective convergence
- **DSPy** — programmable LLM pipelines (foundation for APES)

### Graph Neural Networks
- **PyTorch Geometric** — GNN framework
- **ACL 2025 GNN-RAG** — multi-hop reasoning
- **Link Prediction** — knowledge graph completion

## Statistics v0.1.2

| Metric | Value |
|--------|-------|
| Codex parts | 10 (0-IX) |
| Markdown files | 19 (12 standards + 7 ADRs) |
| JSON Schemas | 8 |
| Error codes | 18+ |
| Unit tests | 36 |
| ADRs | 6 |
| Background jobs | 2 (OrphanDetector, TombstoneExpirer) |
| Tool nodes | 145 (CODEX=11, CORE=104, PROJECT=30) |
| Tool categories | 19 (11 MCP + 8 AOPEG) |
| Tool namespaces | 3 (CODEX, CORE, PROJECT) |
| Seed scripts | 2 (seed-tool-catalog.js, seed-aopeg-executors.js) |

## Roadmap to 1.0.0

- [ ] Production validation (3+ months of usage)
- [ ] Appendices A-E
- [ ] Integration tests
- [ ] Performance benchmarks
- [ ] Security audit
- [ ] Multi-language support (EN/RU/FR/ES/AR/ZH)

## Change History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0-draft | 2026-03-12 | Claude Code + Claude Opus | Full Codex: 9 parts, Schema Registry, 34 tests |
| 0.1.1-draft | 2026-03-13 | Claude Code + Claude Opus | Part IX, 6 ADRs, ExecutionRecord, StartupManager, 36 tests |
| 0.1.2-draft | 2026-03-19 | Claude Code + Claude Opus | Tool Namespace Architecture (§9.7), 145 Tool nodes, MCP discovery |
