# SQL Import + GNN Analysis Feature

## Overview

End-to-end pipeline for importing SQL Server database structures into GXE graphs
and optionally enriching them with GNN (Graph Neural Network) analysis.

## User Flow

```
1. Click [SQL] button in GXE Toolbar
2. ImportSqlSelector opens → select/create Data Source
3. Click [Import & Analyze] → SSE streams progress
4. 3 graphs created in new GXE tabs (Structure, Entities, BusinessLogic)
5. GnnAnalysisPrompt modal: "Run GNN Analysis?"
6. Select analyses → [Run Analysis]
7. GNN service processes graph
8. Results visualized: predicted edges, classification badges, communities
9. GnnSummaryPanel shows metrics with expandable details
```

## Architecture

### SQL Import

| Component | File | Description |
|-----------|------|-------------|
| ImportSqlStore | `mcp/src/stores/importSqlStore.js` | Zustand store for full workflow state |
| importSql.service | `mcp/src/services/importSql.service.js` | Frontend API + SSE client |
| ImportSqlSelector | `mcp/src/components/GXE/ImportSqlSelector.jsx` | Floating dialog (source, form, log) |
| ImportSqlLog | `mcp/src/components/GXE/ImportSqlLog.jsx` | Colored console log |
| MssqlImportOrchestrator | `api/src/services/connectors/mssql.import-orchestrator.js` | Backend pipeline coordinator |
| mssql-import.controller | `api/src/controllers/mssql-import.controller.js` | SSE endpoint controller |

### GNN Analysis

| Component | File | Description |
|-----------|------|-------------|
| GnnAnalysisPrompt | `mcp/src/components/GXE/GnnAnalysisPrompt.jsx` | Post-import modal with analysis options |
| GnnInsightsOverlay | `mcp/src/components/GXE/GnnInsightsOverlay.jsx` | Predicted edges + badges for ReactFlow |
| GnnSummaryPanel | `mcp/src/components/GXE/GnnSummaryPanel.jsx` | Bottom bar with expandable metrics |
| gnn.service | `mcp/src/services/gnn.service.js` | GNN Python service client |

## GNN Analyses

| Type | Endpoint | Description |
|------|----------|-------------|
| Link Prediction | `POST /api/v1/gnn/predict-links` | Predict hidden relationships between tables |
| Node Classification | `POST /api/v1/gnn/classify-nodes` | Categorize tables (Transaction, Reference, Log, etc.) |
| Community Detection | `POST /api/v1/gnn/detect-communities` | Find logical groupings in schema |

## Visualization

- **Predicted Links**: dashed animated edges in purple (#a855f7) with probability % labels
- **Classifications**: colored badges on nodes with category names
- **Communities**: nodes grouped with community color coding

## GraphActionsPanel

GNN analyses are also available via GraphActionsPanel > GNN category:
- Predict Links (single analysis)
- Classify Nodes (single analysis)
- Detect Communities (single analysis)
- Full GNN Analysis (all three)

## API Endpoints

### SSE Import
```
GET /api/v1/mssql/import-analyze?domainId=...&connectionName=...
```
Query params: `includeStructure`, `includeEntities`, `includeBusinessLogic`, `sampleRows`, `schemas`

### GNN (Python service, port 5000)
```
POST /api/v1/gnn/predict-links
POST /api/v1/gnn/classify-nodes
POST /api/v1/gnn/detect-communities
POST /api/v1/gnn/graph-embedding
POST /api/v1/gnn/embed/nodes
GET  /api/v1/gnn/model-status
```

## Error Handling

- GNN service unavailable: error displayed in prompt, retry possible
- Empty graph: validation prevents analysis from starting
- Partial failure: each analysis has independent try/catch, partial results shown
- Network timeout: standard fetch error handling with user-visible messages
