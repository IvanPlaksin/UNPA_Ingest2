/**
 * SQL Extraction Pipeline — Executable GXE Graph
 *
 * Namespace: Core
 * Format: ReactFlow-compatible DAG structure
 *
 * META-GRAPH with 9 phases:
 *   Phase 1: Meta Consultation
 *   Phase 2: Database Reconnaissance
 *   Phase 3: Entity Discovery + D1
 *   Phase 4: Relationship Inference
 *   Phase 5: Transaction Analysis
 *   Phase 6: Business Logic + D2 + D3
 *   Phase 7: Data Validation
 *   Phase 8: Graph Synthesis + Cross-Domain
 *   Phase 9: Knowledge Persistence
 */

// ====================================================================
// META-GRAPH: SQL Extraction Pipeline Orchestrator
// ====================================================================

const SQL_EXTRACTION_META = {
  graph_id: 'CORE-SQL-EXTRACTION-META-V1',
  name: 'SQL Extraction Pipeline',
  description: 'Full multi-domain extraction from SQL Server: D1-D4 domains with cross-domain linking',
  category: 'META',
  namespace: 'Core',
  version: '1.0.0',

  nodes: [
    // ── INPUT ──
    {
      id: 'META-N01',
      type: 'start',
      position: { x: 50, y: 300 },
      data: {
        label: 'Pipeline Input',
        tool: 'workflow.start',
        config: {
          inputs: [
            { name: 'server', type: 'string', required: true },
            { name: 'database', type: 'string', required: true },
            { name: 'user', type: 'string', required: true },
            { name: 'password', type: 'string', required: true },
            { name: 'port', type: 'number', default: 1433 },
            { name: 'schemas', type: 'array', default: ['dbo'] },
            { name: 'sessionId', type: 'string' },
          ],
        },
      },
    },

    // ── PHASE 1: Connect + Meta Consultation ──
    {
      id: 'META-N02',
      type: 'action',
      position: { x: 250, y: 300 },
      data: {
        label: 'SQL Connect',
        tool: 'sql.connect',
        config: {
          server: '{{input.server}}',
          database: '{{input.database}}',
          user: '{{input.user}}',
          password: '{{input.password}}',
          port: '{{input.port}}',
        },
      },
    },
    {
      id: 'META-N03',
      type: 'action',
      position: { x: 250, y: 150 },
      data: {
        label: 'Meta Consultation',
        tool: 'graph.query',
        config: {
          cypher: "MATCH (s:IngestionSession {status: 'complete'}) RETURN s.id as id, s.label as label, s.qualityScore as quality ORDER BY s.completedAt DESC LIMIT 5",
          params: {},
        },
      },
    },

    // ── PHASE 2: Schema Scan ──
    {
      id: 'META-N04',
      type: 'action',
      position: { x: 450, y: 300 },
      data: {
        label: 'Schema Scan',
        tool: 'sql.schema_scan',
        config: {
          connectionId: '{{META-N02.connectionId}}',
          schemas: '{{input.schemas}}',
          includeViews: false,
        },
      },
    },

    // ── PHASE 3: Entity Classification + D1 Persist ──
    {
      id: 'META-N05',
      type: 'ai_node',
      position: { x: 650, y: 200 },
      data: {
        label: 'Classify Tables',
        tool: 'ai.generate',
        config: {
          model: 'gemini-2.0-flash',
          system_prompt: [
            'You are a database analyst. Classify each table into categories:',
            'reference (lookup/enum), master (core entity), transaction (event/log), junction (M:N bridge).',
            '',
            'Tables: {{META-N04.databaseMap.tables}}',
            '',
            'Return JSON: { "classifications": { "schema.table": { "type": "reference|master|transaction|junction", "confidence": 0.0-1.0 } } }',
          ].join('\n'),
          user_prompt: 'Classify all tables based on their column patterns and naming conventions.',
          response_format: 'json',
        },
      },
    },
    {
      id: 'META-N06',
      type: 'action',
      position: { x: 850, y: 200 },
      data: {
        label: 'Persist D1 Entities',
        tool: 'sql.domain_persist',
        config: {
          domain: 'STRUCTURAL',
          action: 'createEntitiesFromMap',
          data: '{{META-N04.databaseMap}}',
          sessionId: '{{input.sessionId}}',
          sourceDatabase: '{{input.database}}',
        },
      },
    },

    // ── PHASE 4: FK Relationships ──
    {
      id: 'META-N07',
      type: 'action',
      position: { x: 850, y: 350 },
      data: {
        label: 'Persist FK Edges',
        tool: 'sql.domain_persist',
        config: {
          domain: 'STRUCTURAL',
          action: 'createForeignKeys',
          data: { edges: '{{META-N04.databaseMap.foreignKeys}}' },
          sessionId: '{{input.sessionId}}',
        },
      },
    },

    // ── PHASE 5: List Procedures ──
    {
      id: 'META-N08',
      type: 'action',
      position: { x: 1050, y: 300 },
      data: {
        label: 'List Procedures',
        tool: 'sql.procedure_list',
        config: {
          connectionId: '{{META-N02.connectionId}}',
          schemas: '{{input.schemas}}',
          includeTriggers: true,
        },
      },
    },

    // ── PHASE 6A: Parse AST (loop over procedures) ──
    {
      id: 'META-N09',
      type: 'action',
      position: { x: 1250, y: 200 },
      data: {
        label: 'Parse Procedure ASTs',
        tool: 'common.loop',
        config: {
          items: '{{META-N08.procedures}}',
          subgraph: 'CORE-SQL-PROCEDURE-ANALYSIS-V1',
          itemVariable: 'procedure',
          collectResults: true,
        },
      },
    },

    // ── PHASE 6B: Semantic Rules (LLM) ──
    {
      id: 'META-N10',
      type: 'ai_node',
      position: { x: 1250, y: 400 },
      data: {
        label: 'Extract Semantic Rules',
        tool: 'ai.generate',
        config: {
          model: 'gemini-2.0-flash',
          system_prompt: [
            'Analyze these stored procedures and extract business rules, calculations, and domain vocabulary.',
            '',
            'Procedures: {{META-N08.procedures}}',
            '',
            'Return JSON: {',
            '  "rules": [{"name": "...", "description": "...", "type": "validation|constraint|workflow|authorization", "sourceTable": "...", "confidence": 0.0-1.0}],',
            '  "calculations": [{"name": "...", "formula": "...", "inputFields": [...], "outputField": "...", "sourceTable": "..."}],',
            '  "vocabulary": [{"term": "...", "definition": "...", "domain": "..."}]',
            '}',
          ].join('\n'),
          user_prompt: 'Extract all business rules, calculations, and domain-specific vocabulary.',
          response_format: 'json',
        },
      },
    },

    // ── PHASE 6C: Persist D3 Semantic ──
    {
      id: 'META-N11',
      type: 'action',
      position: { x: 1450, y: 400 },
      data: {
        label: 'Persist D3 Rules',
        tool: 'sql.domain_persist',
        config: {
          domain: 'SEMANTIC',
          action: 'createSemanticRules',
          data: { rules: '{{META-N10.response.rules}}' },
          sessionId: '{{input.sessionId}}',
        },
      },
    },

    // ── PHASE 7: Validation Summary ──
    {
      id: 'META-N12',
      type: 'action',
      position: { x: 1650, y: 300 },
      data: {
        label: 'Validation Summary',
        tool: 'graph.query',
        config: {
          cypher: [
            "MATCH (e:StructuralEntity) WITH count(e) as entities",
            "MATCH (g:DomainGraph {domain: 'BEHAVIORAL'}) WITH entities, count(g) as graphs",
            "MATCH (r:SemanticRule) WITH entities, graphs, count(r) as rules",
            "RETURN entities, graphs, rules",
          ].join(' '),
          params: {},
          single: true,
        },
      },
    },

    // ── PHASE 8: Cross-Domain Edge Summary ──
    {
      id: 'META-N13',
      type: 'action',
      position: { x: 1850, y: 300 },
      data: {
        label: 'Cross-Domain Summary',
        tool: 'graph.query',
        config: {
          cypher: "MATCH ()-[e:CROSS_DOMAIN]->() RETURN e.edgeType as type, count(e) as count",
          params: {},
        },
      },
    },

    // ── PHASE 9: Output ──
    {
      id: 'META-N14',
      type: 'end',
      position: { x: 2050, y: 300 },
      data: {
        label: 'Pipeline Complete',
        tool: 'workflow.end',
        config: {
          output: {
            sessionId: '{{input.sessionId}}',
            database: '{{input.database}}',
            schemaStats: '{{META-N04}}',
            entityClassification: '{{META-N05.response}}',
            d1Result: '{{META-N06}}',
            fkResult: '{{META-N07}}',
            procedureAnalysis: '{{META-N09}}',
            semanticRules: '{{META-N11}}',
            validation: '{{META-N12}}',
            crossDomain: '{{META-N13}}',
          },
        },
      },
    },
  ],

  edges: [
    // Input → Connect + Meta (parallel)
    { id: 'e01', source: 'META-N01', target: 'META-N02', label: 'connect' },
    { id: 'e02', source: 'META-N01', target: 'META-N03', label: 'meta' },

    // Connect → Schema Scan
    { id: 'e03', source: 'META-N02', target: 'META-N04', label: 'scan' },

    // Schema Scan → Classify + FK (parallel)
    { id: 'e04', source: 'META-N04', target: 'META-N05', label: 'classify' },
    { id: 'e05', source: 'META-N04', target: 'META-N07', label: 'fk' },

    // Classify → Persist D1
    { id: 'e06', source: 'META-N05', target: 'META-N06', label: 'd1' },

    // Schema Scan → List Procedures (depends on scan)
    { id: 'e07', source: 'META-N04', target: 'META-N08', label: 'procs' },

    // List Procedures → Parse ASTs + Semantic Rules (parallel)
    { id: 'e08', source: 'META-N08', target: 'META-N09', label: 'parse' },
    { id: 'e09', source: 'META-N08', target: 'META-N10', label: 'semantic' },

    // Semantic Rules → Persist D3
    { id: 'e10', source: 'META-N10', target: 'META-N11', label: 'd3' },

    // All domain work → Validation
    { id: 'e11', source: 'META-N06', target: 'META-N12', label: 'validate' },
    { id: 'e12', source: 'META-N07', target: 'META-N12', label: 'validate' },
    { id: 'e13', source: 'META-N09', target: 'META-N12', label: 'validate' },
    { id: 'e14', source: 'META-N11', target: 'META-N12', label: 'validate' },

    // Validation → Cross-Domain → Output
    { id: 'e15', source: 'META-N12', target: 'META-N13', label: 'cross' },
    { id: 'e16', source: 'META-N13', target: 'META-N14', label: 'done' },
    { id: 'e17', source: 'META-N03', target: 'META-N12', label: 'meta_context' },
  ],
};

// ====================================================================
// SUB-GRAPH: Procedure Analysis (called per-procedure in loop)
// ====================================================================

const SQL_PROCEDURE_ANALYSIS = {
  graph_id: 'CORE-SQL-PROCEDURE-ANALYSIS-V1',
  name: 'SQL Procedure Analysis',
  description: 'Analyze a single stored procedure: AST parse → GXE translate → D2 persist → cross-domain link',
  category: 'SUBGRAPH',
  namespace: 'Core',
  version: '1.0.0',

  nodes: [
    {
      id: 'PROC-N01',
      type: 'start',
      position: { x: 50, y: 200 },
      data: {
        label: 'Procedure Input',
        tool: 'workflow.start',
        config: {
          inputs: [
            { name: 'procedure', type: 'object', required: true },
            { name: 'sessionId', type: 'string' },
            { name: 'sourceDatabase', type: 'string' },
          ],
        },
      },
    },

    // AST Parse
    {
      id: 'PROC-N02',
      type: 'action',
      position: { x: 250, y: 200 },
      data: {
        label: 'Parse AST',
        tool: 'sql.ast_parse',
        config: {
          sql: '{{input.procedure.sql}}',
          procedureName: '{{input.procedure.name}}',
          procedureSchema: '{{input.procedure.schema}}',
        },
      },
    },

    // GXE Translate
    {
      id: 'PROC-N03',
      type: 'action',
      position: { x: 450, y: 200 },
      data: {
        label: 'GXE Translate',
        tool: 'sql.gxe_translate',
        config: {
          ast: '{{PROC-N02.ast}}',
          sql: '{{input.procedure.sql}}',
          procedureName: '{{input.procedure.name}}',
          procedureSchema: '{{input.procedure.schema}}',
        },
      },
    },

    // Persist D2 Behavioral Graph
    {
      id: 'PROC-N04',
      type: 'action',
      position: { x: 650, y: 200 },
      data: {
        label: 'Persist D2 Graph',
        tool: 'sql.domain_persist',
        config: {
          domain: 'BEHAVIORAL',
          action: 'createBehavioralGraph',
          data: {
            procedure: {
              name: '{{input.procedure.name}}',
              schema: '{{input.procedure.schema}}',
              sql: '{{input.procedure.sql}}',
              ast: '{{PROC-N02.ast}}',
            },
          },
          sessionId: '{{input.sessionId}}',
          sourceDatabase: '{{input.sourceDatabase}}',
        },
      },
    },

    // Output
    {
      id: 'PROC-N05',
      type: 'end',
      position: { x: 850, y: 200 },
      data: {
        label: 'Procedure Done',
        tool: 'workflow.end',
        config: {
          output: {
            procedureName: '{{input.procedure.name}}',
            parseSuccess: '{{PROC-N02.parseSuccess}}',
            nodeCount: '{{PROC-N03.nodeCount}}',
            confidence: '{{PROC-N03.confidence}}',
            referencedTables: '{{PROC-N03.referencedTables}}',
            d2Result: '{{PROC-N04}}',
          },
        },
      },
    },
  ],

  edges: [
    { id: 'pe01', source: 'PROC-N01', target: 'PROC-N02', label: 'parse' },
    { id: 'pe02', source: 'PROC-N02', target: 'PROC-N03', label: 'translate' },
    { id: 'pe03', source: 'PROC-N03', target: 'PROC-N04', label: 'persist' },
    { id: 'pe04', source: 'PROC-N04', target: 'PROC-N05', label: 'done' },
  ],
};

// ====================================================================
// EXPORTS
// ====================================================================

module.exports = {
  SQL_EXTRACTION_META,
  SQL_PROCEDURE_ANALYSIS,

  // Convenience: all graphs as array
  allGraphs: [SQL_EXTRACTION_META, SQL_PROCEDURE_ANALYSIS],
};
