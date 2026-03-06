# MS SQL Server Connector

Read-only connector for integrating MS SQL Server databases with UN ProjectAdvisor Knowledge Graph.

## Overview

The MS SQL Connector provides:
- **READ-ONLY access** to database structure and data
- **Semantic analysis** via LLM to extract business meaning from schema
- **ER graph generation** in Memgraph Knowledge Graph
- **Vectorization** in Qdrant for semantic search
- **Domain isolation** with encrypted credential storage

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                        MS SQL Connector                            │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌────────────────┐   ┌────────────────┐   ┌────────────────┐    │
│  │ MSSQLConnector │──▶│ MSSQLAnalyzer  │──▶│ MSSQLGenerator │    │
│  │  (Level 2)     │   │  (AI / LLM)    │   │ (Graph + Vec)  │    │
│  └───────┬────────┘   └────────────────┘   └────────────────┘    │
│          │                                                        │
│          ▼                                                        │
│  ┌────────────────┐                                              │
│  │ DomainService  │◀── Namespace isolation + Credentials         │
│  └────────────────┘                                              │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. MSSQLConnector (`mssql.connector.js`)

Low-level connector to SQL Server.

```javascript
const { MSSQLConnector } = require('./services/connectors');
const connector = new MSSQLConnector();

await connector.connect({
  server: 'sql-server.example.com',
  database: 'MyDB',
  username: 'user',
  password: 'pass',
});

const schemas = await connector.getSchemas();
const tables = await connector.getTables({ schema: 'dbo', includeRowCounts: true });
const columns = await connector.getColumns('dbo', 'Employees');
const sample = await connector.sampleData('dbo', 'Employees', { sampleSize: 50 });
const result = await connector.executeReadOnlyQuery('SELECT TOP 10 * FROM dbo.Employees');

await connector.disconnect();
```

**Safety:**
- All connections use `readOnlyIntent: true`
- DML/DDL operations blocked (INSERT, UPDATE, DELETE, DROP, etc.)
- System schemas excluded automatically

### 2. MSSQLSemanticAnalyzer (`mssql.analyzer.js`)

AI-powered schema analysis to extract business semantics.

```javascript
const { MSSQLSemanticAnalyzer } = require('./services/connectors');
const analyzer = new MSSQLSemanticAnalyzer();

const dbAnalysis = await analyzer.analyzeDatabase(connector, {
  schema: 'dbo',
  skipLLM: false,
  onTableAnalyzed: (name, idx, total) => console.log(`${name} ${idx}/${total}`),
});
```

### 3. MSSQLGraphGenerator (`mssql.graph-generator.js`)

Creates ER graph in Memgraph + vectorizes in Qdrant.

```javascript
const { MSSQLGraphGenerator } = require('./services/connectors');

const generator = new MSSQLGraphGenerator(memgraphService, qdrantService);
const result = await generator.generateERGraph(dbAnalysis, {
  containerLabel: 'PROJECT:my-domain',
  qdrantCollection: 'domain_my_domain',
});
// { nodesCreated, edgesCreated, extractionCycleId, ... }

// Rollback if needed
await generator.deleteExtractionCycle(result.extractionCycleId);
```

## Domain Management

```javascript
const { DomainService, CredentialStore } = require('./services/domain');

const domainService = new DomainService(memgraph, qdrant, credentialStore);

// Create domain
await domainService.createDomain({ displayName: 'IMIS Legacy', description: 'HR/Finance' });

// Add data source with encrypted credentials
await domainService.addDataSource('imis-legacy', {
  connectionName: 'imis-prod-db',
  sourceType: 'MSSQL',
  connectionParams: { server: 'sql-prod.un.org', database: 'IMIS', port: 1433 },
}, { username: 'readonly_user', password: 'secret' });

// Switch active domain
await domainService.switchDomain('imis-legacy');
```

## API Endpoints

### Domain Management (`/api/v1/domains`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List all domains |
| GET | `/current` | Get active domain |
| POST | `/` | Create domain |
| POST | `/:id/switch` | Switch active domain |
| PUT | `/:id` | Update domain |
| POST | `/:id/datasources` | Add data source |
| DELETE | `/:id/datasources/:name` | Remove data source |
| POST | `/:id/datasources/:name/test` | Test connection |

### MSSQL Direct (`/api/v1/mssql`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/connect` | Connect to server |
| POST | `/disconnect` | Disconnect |
| GET | `/status` | Connection status |
| GET | `/schemas` | List schemas |
| GET | `/tables` | List tables/views |
| GET | `/columns/:schema/:table` | Column details |
| GET | `/constraints/:schema/:table` | Constraints |
| GET | `/indexes/:schema/:table` | Indexes |
| GET | `/procedures` | Stored procedures |
| GET | `/dependencies` | Object dependencies |
| POST | `/sample/:schema/:table` | Sample data |
| POST | `/query` | Read-only query |
| GET | `/row-counts` | Fast row counts |
| GET | `/overview` | Full overview |

### SSE Ingestion (`/api/v1/rabbithole/ingest/mssql`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/` | Start ingestion (SSE) |
| DELETE | `/:cycleId` | Rollback extraction |
| GET | `/:cycleId/stats` | Cycle statistics |

```bash
curl -X POST http://localhost:3001/api/v1/rabbithole/ingest/mssql \
  -H "Content-Type: application/json" \
  -d '{"domainId": "imis-legacy", "connectionName": "imis-prod-db"}'
```

SSE Events:
```
data: {"phase":"domain","message":"Switching domain context...","progress":5}
data: {"phase":"connect","message":"Connected: SQL-PROD-01 / IMIS","progress":20}
data: {"phase":"analysis","message":"Analyzed: Employees (5/47)","progress":35}
data: {"phase":"graph","message":"Graph created: 234 nodes, 567 edges","progress":90}
data: {"phase":"done","message":"Ingestion complete!","progress":100,"summary":{...}}
```

## MCP Tools

### Level 2 (Domain Tools)

| Tool ID | Description | Safety |
|---------|-------------|--------|
| `data.mssql_connect` | Establish connection | REQUIRES_APPROVAL |
| `data.mssql_disconnect` | Close connection | AUTO |
| `data.mssql_status` | Connection status | AUTO |
| `data.mssql_get_schemas` | List schemas | AUTO |
| `data.mssql_get_tables` | List tables/views | AUTO |
| `data.mssql_get_columns` | Column details | AUTO |
| `data.mssql_get_constraints` | Constraints | AUTO |
| `data.mssql_get_indexes` | Indexes | AUTO |
| `data.mssql_get_procedures` | Stored procedures | AUTO |
| `data.mssql_get_dependencies` | Dependencies | AUTO |
| `data.mssql_sample_data` | Sample rows | AUTO |
| `data.mssql_execute_query` | Execute SELECT | REQUIRES_APPROVAL |
| `data.mssql_get_row_counts` | Fast row counts | AUTO |
| `data.mssql_get_overview` | Full overview | AUTO |

### Level 3 (Patterns)

| Pattern ID | Description |
|------------|-------------|
| `data.mssql_ingest` | Complete ingestion pipeline |
| `data.mssql_er_extraction` | ER graph generation |
| `data.mssql_business_logic` | SP business rule analysis |

## Security

1. **READ-ONLY** - all connections use `readOnlyIntent: true`
2. **Query Validation** - DML/DDL blocked before execution
3. **Credential Isolation** - passwords in Redis with AES-256-GCM, never in graph
4. **System Object Exclusion** - sys, INFORMATION_SCHEMA excluded
5. **Extraction Cycle Tracking** - all nodes tagged with `extractionCycleId` for rollback

## Testing

```bash
# Unit tests (no SQL Server needed)
npx jest --testPathPattern=connectors

# Integration tests (require SQL Server)
MSSQL_TEST_SERVER=localhost \
MSSQL_TEST_DATABASE=TestDB \
MSSQL_TEST_USER=sa \
MSSQL_TEST_PASSWORD=YourPassword \
npx jest --testPathPattern=connectors
```

## Dependencies

```json
{ "mssql": "^11.0.0" }
```

## File Structure

```
api/src/
├── config/
│   └── mssql.config.js              # Constants and types
├── services/
│   ├── domain/
│   │   ├── domain.service.js         # Domain management
│   │   ├── credential.store.js       # Encrypted credentials
│   │   └── index.js
│   └── connectors/
│       ├── mssql.connector.js        # Core connector
│       ├── mssql.analyzer.js         # AI semantic analysis
│       ├── mssql.graph-generator.js  # Graph + vector generation
│       └── index.js
├── routes/
│   ├── domain.route.js               # /api/v1/domains
│   └── mssql.route.js                # /api/v1/mssql
└── mcp/tools/data/
    ├── BaseMSSQLTool.js              # Shared base class
    ├── MSSQL*Tool.js                 # 14 Level 2 tools
    ├── MSSQL*Tool.js                 # 3 Level 3 patterns
    └── index.js                      # Factory
```
