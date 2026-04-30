# Appendix F: Proposal Data Standard

> **Status:** Active | **Version:** 0.1.0 | **Date:** 2026-03-24
> **Scope:** Metacognition Proposals, Codex Governance Proposals

---

## F.1 Purpose

Proposals are the primary mechanism for tracked, auditable changes to the Knowledge Graph.
Every proposal must carry enough context for a human reviewer to understand **what happened**,
**why it happened**, and **what changed** — without needing to cross-reference other systems.

A proposal with only `{ action: "assigned_namespace", nodeId: "UUID" }` is useless.
A proposal with a full execution summary, before/after state, and verification is an audit record.

---

## F.2 Proposal Object — Required Fields

### F.2.1 Core Identity

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique proposal ID (e.g. `METACOG-a1b2c3d4`) |
| `createdAt` | ISO 8601 | yes | Creation timestamp |
| `status` | enum | yes | PENDING, AUTO_APPROVED, APPROVED, EXECUTED, REJECTED, EXECUTION_FAILED |
| `autonomyLevel` | enum | yes | L0..L4 |
| `levelName` | string | yes | Human-readable level name |

### F.2.2 Issue Context (nested `issue` object)

The `issue` object must contain **all detection context** so reviewers understand the problem.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | yes | Issue classification (ORPHAN_NODE, MISSING_NAMESPACE, etc.) |
| `severity` | enum | yes | error, warning, info |
| `message` | string | yes | Human-readable description of the problem |
| `suggestedAction` | string | yes | Action to take (connect_or_remove, assign_namespace, etc.) |
| `nodeId` | string | conditional | Target node ID (required for single-node issues) |
| `name` | string | recommended | Node name (human-readable identifier) |
| `label` | string | recommended | Node label/type |
| `fromId` / `toId` | string | conditional | Source/target for edge-related issues |
| `fromName` / `toName` | string | recommended | Human-readable names for edge endpoints |
| `degree` | number | conditional | Connection count (for stale hub detection) |
| `duplicateId` | string | conditional | Second node ID (for duplicate detection) |

**Rule PROP-001:** Every issue MUST include both machine IDs (`nodeId`) AND human-readable identifiers (`name`, `label`). UUIDs alone are not actionable for human reviewers.

---

## F.3 Execution Result — Required Fields

When a proposal is executed, the `executionResult` object must provide a complete audit trail.

### F.3.1 Mandatory Result Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | yes | Executed action identifier |
| `summary` | string | **yes** | Human-readable sentence describing what was done |
| `issueType` | string | yes | Original issue type (for traceability) |
| `issueMessage` | string | yes | Original issue message (for context) |
| `verified` | boolean | yes | Whether post-execution verification confirmed the change |

**Rule PROP-002:** Every executionResult MUST include a `summary` field — a complete sentence
describing the action in human language. Example: `Assigned namespace "CORE" to Tool node "GraphValidator"`.

**Rule PROP-003:** Every executionResult MUST include a `verified` field. The executor must
re-query the graph after mutation to confirm the change was applied.

### F.3.2 Context Fields (action-dependent)

| Field | Type | When | Description |
|-------|------|------|-------------|
| `nodeId` | string | single-node actions | Target node ID |
| `nodeName` | string | single-node actions | Target node name |
| `nodeLabel` | string | single-node actions | Target node label |
| `changes` | object | all mutations | Before/after state diff |
| `mappingRule` | string | namespace assignment | Rule that determined the namespace |
| `fromId` / `toId` | string | edge actions | Edge endpoint IDs |
| `fromName` / `toName` | string | edge actions | Edge endpoint names |
| `degree` | number | stale hub refresh | Connection count at time of execution |
| `status` | string | deferred actions | `requires_manual` for non-automatable actions |

### F.3.3 Changes Object Format

The `changes` field must document what was modified:

```json
// Scalar change — before/after
{ "namespace": { "from": null, "to": "CORE" } }

// New property set
{ "_orphanDetected": true, "_orphanDetectedAt": "2026-03-24T..." }

// Edge creation
{ "edge": { "type": "DEPENDS_ON", "inferred": true, "createdBy": "metacognition" } }
```

---

## F.4 Anti-patterns

**PROP-AP-001: Opaque Result**
```json
// BAD — reviewer cannot understand what happened
{ "action": "assigned_namespace", "nodeId": "A600556E-...", "namespace": "CORE" }
```

**PROP-AP-002: Missing Verification**
```json
// BAD — no confirmation that the change was applied
{ "action": "tagged_orphan", "nodeId": "..." }
```

**PROP-AP-003: UUID-only References**
```json
// BAD — nodeId without name or label
{ "action": "add_transitive_edge", "from": "UUID1", "to": "UUID2" }
```

**PROP-AP-004: Missing Issue Context in Result**
```json
// BAD — execution result loses connection to original issue
{ "action": "assign_namespace", "namespace": "CORE" }
// No issueType, no issueMessage — reviewer can't trace back
```

---

## F.5 Governance Lifecycle

```
DETECT ──→ EVALUATE ──→ PROPOSE ──→ APPROVE ──→ EXECUTE ──→ VERIFY
  │            │            │            │            │          │
  │ Rich       │ Priority   │ Full       │ Human/     │ Run      │ Re-query
  │ context    │ scoring    │ issue      │ Auto       │ action   │ graph to
  │ from       │            │ object     │ decision   │          │ confirm
  │ graph      │            │ preserved  │            │          │
  └────────────┴────────────┴────────────┴────────────┴──────────┘
                  No data loss at any stage
```

**Rule PROP-004:** Data captured during DETECT must flow through to EXECUTE without loss.
The `issue` object is immutable after creation — execution methods must reference it,
not re-derive context.

**Rule PROP-005:** On APPLY (for Codex Governance proposals), the Codex patch version
is automatically incremented. The `codexVersion` field in the response indicates the new version.

---

## F.6 Version Bumping Rules

| Event | Version Change | Example |
|-------|---------------|---------|
| Codex proposal APPLIED | Patch increment | 0.1.3 → 0.1.4 |
| New Part/Standard added | Minor increment | 0.1.x → 0.2.0 |
| Breaking schema change | Major increment | 0.x.y → 1.0.0 |

Patch bumps are automatic (triggered by `applyProposal()`).
Minor and major bumps require manual update via seed script or API.
