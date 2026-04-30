---
id: CODEX-PROCESS-001
title: GXE AI Assistant Graph Building Algorithm
category: PROCESS
namespace: META
version: 1.0.0
status: ACTIVE
created: 2026-03-27
author: architecture-session
linkedGraph: META-GRAPH-ASSISTANT-BUILDING-V1
---

# CODEX-PROCESS-001: GXE AI Assistant Graph Building Algorithm

## Overview

This document describes the complete algorithm used by the GXE AI Assistant to build executable AOPEG graphs from natural language requests. The algorithm is also represented as an executable META-GRAPH stored in the Knowledge Base (Memgraph).

## Linked Artifacts

| Artifact | Location | Purpose |
|----------|----------|---------|
| **META-GRAPH** | Memgraph: `CatalogEntry` namespace META | Executable process representation (15 nodes, 14 edges) |
| **ProcessGraph** | Memgraph: `ProcessGraph` node | Documentation container |
| **KnowledgeSections** | Memgraph: P0-P6 | System prompt components |
| **AgentProfile** | Memgraph: `GXE AI Assistant` | Agent identity |

## Process Summary

The algorithm consists of **15 discrete steps** organized into 5 phases:

### Phase 1: Request Initialization

1. **M-N01: Request Receive** (`workflow.start`) -- HTTP POST `/api/v1/assistant/chat` entry point. Receives `{ sessionId, message, graphState, selectionContext, graphId }`.
2. **M-N02: Session Load** (`common.transform`) -- Redis session with key `gxe:assistant:session:{sessionId}`, TTL 7200s. Stores messages (max 100), graphSnapshots (max 10), undoStack (max 50).
3. **M-N03: Context Build** (`common.transform`) -- Assembles system prompt from 5 layers: 7 KnowledgeSections (P0-P6), AgentLearning error lessons, Codex minimal bootstrap, AOPEG executor catalog (74 executors), graph state suffix.
4. **M-N04: Graph Serialize** (`common.transform`) -- Converts current canvas nodes/edges into markdown representation for system context.

### Phase 2: Pre-Processing (Optimizations)

5. **ToolFilter** -- Classifies user intent, reduces tools from 42+ to ~18 (~57% token reduction). Falls back to all tools if confidence < 0.3.
6. **Catalog Reuse** -- Searches Graph Catalog for similar existing graphs. Determines reuse strategy: DIRECT_REUSE, CLONE_MODIFY, ABSTRACT_INHERIT, or CREATE_NEW.

### Phase 3: Agentic Loop (max 10 iterations)

7. **M-N05: Anthropic Call** (`ai.agent`) -- Claude claude-sonnet-4-20250514, max_tokens=8192, streaming. Sends system prompt + message history + filtered tools. SDK maxRetries=3, exponential backoff on 529.
8. **M-N06: Response Parse** (`extraction.structured`) -- GraphActionParser extracts `%%ACTION%%...%%END_ACTION%%` blocks. 4-stage JSON repair. Also extracts `%%RATIONALE%%` and `%%LESSON%%` blocks.
9. **M-N07: Action Validate** (`validation.schema`) -- Validates each action: checks required fields per type. Fuzzy type matching with aliases.
10. **M-N08: Loop Decision** (`workflow.condition`) -- If `hasToolUse === true && iterationCount < 10`, loops back to M-N05. Otherwise proceeds to validation.

### Phase 4: Post-Processing

11. **M-N09: Graph Validate** (`validation.graph`) -- GraphValidator runs 6 checks: node ID uniqueness, edge integrity, DAG (Kahn's), connectivity (BFS), entry/exit nodes, standard I/O.
12. **M-N10: Auto-Fix** (`common.transform`) -- Normalizes edges, filters bad IDs, deduplicates nodes, removes self-loops, ensures edge IDs, applies default positions.
13. **M-N11: Session Update** (`common.transform`) -- Saves assistant response to session, pushes graph snapshot, generates inverse diffs for undo, saves learned lessons.

### Phase 5: Output

14. **M-N12: SSE Stream** (`io.stream`) -- Sends final SSE event with type "done" containing text, actions, rationale, lessons, sessionId.
15. **M-N13: Frontend Apply** (`workflow.end`) -- User clicks "Apply" on each ActionCard. handleApplyAction() dispatches setNodes/setEdges to ReactFlow canvas.

### Error Path

- **M-N14: Max Iterations** (`notification.send`) -- Emits warning when agentic loop reaches 10 iterations.
- **M-N15: Complete (Truncated)** (`workflow.end`) -- Partial result delivery.

## Reuse Strategies

| Strategy | Score Threshold | Behavior |
|----------|-----------------|----------|
| **DIRECT_REUSE** | >= 0.9 | Suggest using existing graph as-is |
| **CLONE_MODIFY** | 0.6 -- 0.9 | Load as template, instruct LLM to modify |
| **ABSTRACT_INHERIT** | 0.5 -- 0.6 | Use as reference pattern only |
| **CREATE_NEW** | < 0.5 | Generate from scratch |

## Action Block Format

```
%%ACTION%%
{
  "type": "ADD_NODE",
  "nodeId": "step-1",
  "label": "Process Input",
  "toolId": "common.transform",
  "position": { "x": 100, "y": 100 },
  "parameters": { ... }
}
%%END_ACTION%%
```

Supported action types (9): ADD_NODE, REMOVE_NODE, UPDATE_NODE, ADD_EDGE, REMOVE_EDGE, INSERT_BETWEEN, CREATE_SUBGRAPH, EXTRACT_SUBGRAPH, BATCH, EXECUTE_GRAPH.

## Validation Rules (6 checks)

| Check | Description | Auto-Fix |
|-------|-------------|----------|
| ID Uniqueness | No duplicate node/edge IDs | Yes |
| Edge Integrity | All edges reference existing nodes | Yes |
| DAG Validity | No cycles (Kahn's algorithm) | Warning |
| Connectivity | Single connected component | Warning |
| Entry/Exit | Exactly 1 entry, 1+ exit nodes | Yes |
| I/O Compatibility | Output schema matches input schema | Warning |

## SSE Events

| Event | Payload | When |
|-------|---------|------|
| `filter_applied` | domain, confidence, toolsProvided | After ToolFilter |
| `catalog_search` | strategy, score, candidatesCount | After Catalog Reuse |
| `reuse_suggestion` | action, graphId, graphName | If DIRECT_REUSE or CLONE_MODIFY |
| `chunk` | text delta | During LLM streaming |
| `tool_call` | toolName, input | When LLM uses tool |
| `tool_result` | result | After tool execution |
| `done` | text, actions[], rationale, lessons | After iteration complete |
| `error` | message | On any error |
| `retry` | attempt, delay, reason | On 529 overload |

## Related Files

| File | Purpose |
|------|---------|
| `api/src/controllers/assistant.controller.js` | HTTP endpoint, SSE streaming |
| `api/src/services/agents/anthropic-agent.service.js` | Core agent orchestration |
| `api/src/services/agents/GraphActionParser.js` | Action parsing and validation |
| `api/src/services/agents/SessionContextService.js` | Redis session management |
| `api/src/services/agents/AgentBootstrapService.js` | System prompt assembly |
| `api/src/services/graph/graph-validator.js` | Post-generation validation |
| `api/src/services/graph/tool-filter.js` | Intent-based tool filtering |
| `api/src/services/graph/catalog-reuse.service.js` | Catalog search and reuse |
| `api/src/services/graph-definitions/meta-assistant-graph-building.js` | META-GRAPH definition |

## KnowledgeSections Used

| Priority | Title | Content |
|----------|-------|---------|
| P0 | GXE Assistant Mandate | Core mission and constraints |
| P1 | Action Block Format | %%ACTION%% syntax (MANDATORY) |
| P2 | Executor Taxonomy | 74 executors across 7 domains |
| P3 | Graph Design Patterns | Common workflow patterns |
| P4 | Graph Validation Rules | Structural requirements |
| P5 | Decision Rationale | Error learning format |
| P6 | Graph Execution | EXECUTE_GRAPH action |

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-03-27 | Initial documentation from architecture session |
