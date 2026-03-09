// ============================================================================
// INGESTION KNOWLEDGE SCHEMA
// Namespace: Core, Label: INGESTION
//
// Extracted knowledge about the database:
// - Business entities and attributes
// - Relationships (explicit + inferred)
// - Business rules and calculations
// - Enumerations and lookup data
// - Lifecycle states and transitions
// - Stored procedures and their logic
// ============================================================================

// === CONSTRAINTS (Memgraph syntax) ===

CREATE CONSTRAINT ON (g:KnowledgeGraph) ASSERT g.id IS UNIQUE;
CREATE CONSTRAINT ON (e:BusinessEntity) ASSERT e.id IS UNIQUE;
CREATE CONSTRAINT ON (a:EntityAttribute) ASSERT a.id IS UNIQUE;
CREATE CONSTRAINT ON (r:BusinessRelationship) ASSERT r.id IS UNIQUE;
CREATE CONSTRAINT ON (r:BusinessRule) ASSERT r.id IS UNIQUE;
CREATE CONSTRAINT ON (c:Calculation) ASSERT c.id IS UNIQUE;
CREATE CONSTRAINT ON (e:Enumeration) ASSERT e.id IS UNIQUE;
CREATE CONSTRAINT ON (v:EnumValue) ASSERT v.id IS UNIQUE;
CREATE CONSTRAINT ON (s:LifecycleState) ASSERT s.id IS UNIQUE;
CREATE CONSTRAINT ON (p:StoredProcedureKG) ASSERT p.id IS UNIQUE;
CREATE CONSTRAINT ON (t:DatabaseTable) ASSERT t.id IS UNIQUE;

// === INDEXES ===

CREATE INDEX ON :KnowledgeGraph(sessionId);
CREATE INDEX ON :KnowledgeGraph(graphType);
CREATE INDEX ON :BusinessEntity(entityType);
CREATE INDEX ON :BusinessEntity(sourceTable);
CREATE INDEX ON :BusinessRule(ruleType);
CREATE INDEX ON :StoredProcedureKG(category);
CREATE INDEX ON :DatabaseTable(schemaName);

// === NODE TYPES ===
//
// KnowledgeGraph — graph container
//   id: string (UUID)
//   sessionId: string (FK to IngestionSession)
//   graphType: 'structure' | 'entities' | 'relationships' | 'businessLogic' | 'lifecycle' | 'anomalies'
//   createdAt: string
//   nodeCount: int
//   edgeCount: int
//   namespace: 'Core'
//   label: 'INGESTION'
//
// BusinessEntity — business entity
//   id: string (UUID)
//   graphId: string (FK)
//   entityName: string
//   entityType: string (Person, Organization, Product, Transaction, Asset, Account, etc)
//   description: string
//   sourceTable: string (schema.table)
//   naturalKey: string (JSON array of columns)
//   confidence: float
//   namespace: 'Core'
//   label: 'INGESTION'
//
// EntityAttribute — entity attribute
//   id: string (UUID)
//   entityId: string (FK)
//   attributeName: string
//   semanticName: string
//   dataType: string
//   sourceColumn: string
//   isRequired: boolean
//   description: string
//   isEnumerated: boolean
//   enumerationId: string (FK if enumerated)
//
// BusinessRelationship — relationship between entities
//   id: string (UUID)
//   graphId: string (FK)
//   fromEntityId: string
//   toEntityId: string
//   relationshipType: 'references' | 'contains' | 'manages' | 'triggers' | 'derived_from'
//   cardinality: '1:1' | '1:N' | 'N:1' | 'M:N'
//   isExplicit: boolean (FK vs inferred)
//   sourceConstraint: string (FK name if explicit)
//   semanticLabel: string
//   confidence: float
//
// BusinessRule — business rule
//   id: string (UUID)
//   graphId: string (FK)
//   ruleName: string
//   ruleType: 'validation' | 'constraint' | 'invariant' | 'calculation' | 'workflow'
//   description: string
//   formalExpression: string (SQL/pseudo-code)
//   sourceType: 'constraint' | 'procedure' | 'trigger' | 'inferred'
//   sourceName: string
//   affectedEntities: string (JSON array)
//   confidence: float
//
// Calculation — formula/computation
//   id: string (UUID)
//   graphId: string (FK)
//   calculationName: string
//   formula: string
//   inputs: string (JSON array)
//   output: string
//   sourceType: 'procedure' | 'view' | 'computed_column'
//   sourceName: string
//   description: string
//
// Enumeration — lookup/dictionary
//   id: string (UUID)
//   graphId: string (FK)
//   enumerationName: string
//   sourceTable: string
//   codeColumn: string
//   descriptionColumn: string
//   domain: string (what it represents)
//
// EnumValue — enumeration value
//   id: string (UUID)
//   enumerationId: string (FK)
//   code: string
//   description: string
//   sortOrder: int
//
// LifecycleState — lifecycle state
//   id: string (UUID)
//   graphId: string (FK)
//   entityId: string (FK)
//   stateName: string
//   stateCode: string
//   description: string
//   isInitial: boolean
//   isTerminal: boolean
//
// StoredProcedureKG — stored procedure in knowledge graph
//   id: string (UUID)
//   graphId: string (FK)
//   procedureName: string
//   schemaName: string
//   category: 'CRUD' | 'Workflow' | 'Validation' | 'Calculation' | 'Orchestration'
//   purpose: string
//   complexity: 'low' | 'medium' | 'high'
//   businessValue: 'low' | 'medium' | 'high' | 'critical'
//   astParsed: boolean
//   tablesRead: string (JSON array)
//   tablesWritten: string (JSON array)
//
// DatabaseTable — table in structure graph
//   id: string (UUID)
//   graphId: string (FK)
//   schemaName: string
//   tableName: string
//   tableType: string (reference, master, transaction, log, junction, unknown)
//   rowCount: int
//   columnCount: int
//   confidence: float

// === RELATIONSHIPS ===
//
// (KnowledgeGraph)-[:CONTAINS]->(BusinessEntity)
// (KnowledgeGraph)-[:CONTAINS]->(BusinessRelationship)
// (KnowledgeGraph)-[:CONTAINS]->(BusinessRule)
// (KnowledgeGraph)-[:CONTAINS]->(Calculation)
// (KnowledgeGraph)-[:CONTAINS]->(Enumeration)
// (KnowledgeGraph)-[:CONTAINS]->(StoredProcedureKG)
// (KnowledgeGraph)-[:CONTAINS]->(DatabaseTable)
// (KnowledgeGraph)-[:CONTAINS]->(LifecycleState)
//
// (BusinessEntity)-[:HAS_ATTRIBUTE]->(EntityAttribute)
// (BusinessEntity)-[:RELATES_TO {relationshipId: string}]->(BusinessEntity)
// (EntityAttribute)-[:USES_ENUMERATION]->(Enumeration)
// (Enumeration)-[:HAS_VALUE]->(EnumValue)
// (BusinessEntity)-[:HAS_LIFECYCLE]->(LifecycleState)
// (LifecycleState)-[:TRANSITIONS_TO {trigger: string, frequency: int}]->(LifecycleState)
// (StoredProcedureKG)-[:READS]->(BusinessEntity)
// (StoredProcedureKG)-[:WRITES]->(BusinessEntity)
// (StoredProcedureKG)-[:ENFORCES]->(BusinessRule)
// (StoredProcedureKG)-[:CONTAINS_CALC]->(Calculation)
// (DatabaseTable)-[:FK_REFERENCES]->(DatabaseTable)
// (DatabaseTable)-[:SOFT_FK]->(DatabaseTable)
