/**
 * CodexRuleRegistry — maps CodexRule IDs to executable validation checks
 *
 * Check types: cypher (graph queries), schema (JSON Schema), custom (code)
 * Scopes: namespace, validation, catalog, naming, versioning, general
 */

class CodexRuleRegistry {
  constructor() {
    this.checks = new Map();
    this._registerBuiltInChecks();
  }

  register(id, check) {
    this.checks.set(id, { ...check, checkId: id });
  }

  getAll() {
    return Array.from(this.checks.values());
  }

  getByScope(scope) {
    return this.getAll().filter(c => c.scope === scope);
  }

  _registerBuiltInChecks() {
    // ── NAMESPACE (CODEX-NS) ─────────────────────────────────
    this.register('ns-valid', {
      name: 'Valid Namespace',
      scope: 'namespace',
      severity: 'error',
      type: 'cypher',
      query: `
        MATCH (n)
        WHERE n.namespace IS NOT NULL
          AND NOT n.namespace IN ['CORE','PROJECT','META','GXE','FLOWDESK','Codex','COMMON']
        RETURN id(n) as nodeId, labels(n)[0] as label, n.namespace as namespace
        LIMIT 100
      `,
      messageTemplate: '{label} node {nodeId} has invalid namespace: {namespace}'
    });

    this.register('ns-required', {
      name: 'Namespace Required for Domain Nodes',
      scope: 'namespace',
      severity: 'warning',
      type: 'cypher',
      query: `
        MATCH (n)
        WHERE n.namespace IS NULL
          AND NOT n:CodexMetadata AND NOT n:ToolCatalog AND NOT n:ValidationReport
          AND size(labels(n)) > 0
          AND labels(n)[0] IN ['Tool','CatalogEntry','ExecutionRecord','FlowDeskTicket','BusinessRule','Method','Service']
        RETURN id(n) as nodeId, labels(n)[0] as label
        LIMIT 100
      `,
      messageTemplate: '{label} node {nodeId} is missing namespace field'
    });

    // ── SCHEMA / REQUIRED FIELDS (CODEX-VALID) ──────────────
    this.register('schema-tool', {
      name: 'Tool Required Fields',
      scope: 'validation',
      severity: 'error',
      type: 'cypher',
      query: `
        MATCH (t:Tool)
        WHERE t.name IS NULL OR t.executorId IS NULL OR t.toolNamespace IS NULL
        RETURN t.id as nodeId, 'Tool' as label,
          CASE WHEN t.name IS NULL THEN 'name' WHEN t.executorId IS NULL THEN 'executorId' ELSE 'toolNamespace' END as missingField
        LIMIT 50
      `,
      messageTemplate: 'Tool {nodeId} missing required field: {missingField}'
    });

    this.register('schema-catalog-entry', {
      name: 'CatalogEntry Required Fields',
      scope: 'validation',
      severity: 'error',
      type: 'cypher',
      query: `
        MATCH (e:CatalogEntry)
        WHERE e.entryId IS NULL OR e.name IS NULL OR e.type IS NULL
        RETURN e.entryId as nodeId, 'CatalogEntry' as label,
          CASE WHEN e.entryId IS NULL THEN 'entryId' WHEN e.name IS NULL THEN 'name' ELSE 'type' END as missingField
        LIMIT 50
      `,
      messageTemplate: 'CatalogEntry {nodeId} missing required field: {missingField}'
    });

    this.register('schema-codex-rule', {
      name: 'CodexRule Required Fields',
      scope: 'validation',
      severity: 'error',
      type: 'cypher',
      query: `
        MATCH (r:CodexRule)
        WHERE r.ruleId IS NULL OR r.title IS NULL OR r.partId IS NULL
        RETURN r.ruleId as nodeId, 'CodexRule' as label
        LIMIT 50
      `,
      messageTemplate: 'CodexRule {nodeId} missing required field (ruleId/title/partId)'
    });

    // ── RELATIONSHIP INTEGRITY (CODEX-CATALOG) ──────────────
    this.register('rel-section-orphan', {
      name: 'Orphan CodexSection',
      scope: 'catalog',
      severity: 'warning',
      type: 'cypher',
      query: `
        MATCH (s:CodexSection)
        WHERE NOT (s)<-[:HAS_SECTION]-(:CodexPart)
        RETURN s.sectionId as nodeId, 'CodexSection' as label
        LIMIT 50
      `,
      messageTemplate: 'CodexSection {nodeId} not linked to any Part'
    });

    this.register('rel-rule-orphan', {
      name: 'Orphan CodexRule',
      scope: 'catalog',
      severity: 'warning',
      type: 'cypher',
      query: `
        MATCH (r:CodexRule)
        WHERE NOT (r)<-[:CONTAINS_RULE]-(:CodexSection)
        RETURN r.ruleId as nodeId, 'CodexRule' as label
        LIMIT 50
      `,
      messageTemplate: 'CodexRule {nodeId} not linked to any Section'
    });

    this.register('rel-tool-category', {
      name: 'Tool without Category',
      scope: 'catalog',
      severity: 'info',
      type: 'cypher',
      query: `
        MATCH (t:Tool)
        WHERE NOT (t)<-[:HAS_TOOL]-(:ToolCategory)
        RETURN t.id as nodeId, 'Tool' as label
        LIMIT 50
      `,
      messageTemplate: 'Tool {nodeId} not linked to any ToolCategory'
    });

    // ── TIMESTAMP CHECKS ────────────────────────────────────
    this.register('ts-created', {
      name: 'Missing createdAt',
      scope: 'general',
      severity: 'info',
      type: 'cypher',
      query: `
        MATCH (n)
        WHERE n.namespace IS NOT NULL AND n.createdAt IS NULL
          AND NOT n:CodexMetadata AND NOT n:ValidationReport
        RETURN id(n) as nodeId, labels(n)[0] as label
        LIMIT 100
      `,
      messageTemplate: '{label} node {nodeId} missing createdAt timestamp'
    });

    // ── ORPHAN DETECTION ────────────────────────────────────
    this.register('orphan-nodes', {
      name: 'Orphan Nodes (no relationships)',
      scope: 'general',
      severity: 'info',
      type: 'cypher',
      query: `
        MATCH (n)
        WHERE size(labels(n)) > 0
          AND NOT (n)-[]-()
          AND NOT n:CodexMetadata AND NOT n:ValidationReport AND NOT n:ToolCatalog
        RETURN id(n) as nodeId, labels(n)[0] as label
        LIMIT 50
      `,
      messageTemplate: '{label} node {nodeId} is orphaned (no relationships)'
    });

    // ── DUPLICATE DETECTION ─────────────────────────────────
    this.register('dup-tool-id', {
      name: 'Duplicate Tool executorId',
      scope: 'validation',
      severity: 'warning',
      type: 'cypher',
      query: `
        MATCH (t:Tool)
        WITH t.executorId as eid, collect(t.id) as ids, count(t) as cnt
        WHERE cnt > 1
        RETURN eid as nodeId, 'Tool' as label, cnt as duplicateCount
        LIMIT 20
      `,
      messageTemplate: 'Tool executorId "{nodeId}" has {duplicateCount} duplicates'
    });

    this.register('dup-catalog-name', {
      name: 'Duplicate CatalogEntry name',
      scope: 'validation',
      severity: 'info',
      type: 'cypher',
      query: `
        MATCH (e:CatalogEntry)
        WITH e.name as name, collect(e.entryId) as ids, count(e) as cnt
        WHERE cnt > 1
        RETURN name as nodeId, 'CatalogEntry' as label, cnt as duplicateCount
        LIMIT 20
      `,
      messageTemplate: 'CatalogEntry name "{nodeId}" has {duplicateCount} duplicates'
    });

    // ── ADR STATUS ──────────────────────────────────────────
    this.register('adr-status', {
      name: 'ADR Valid Status',
      scope: 'validation',
      severity: 'warning',
      type: 'cypher',
      query: `
        MATCH (a:CodexADR)
        WHERE a.status IS NULL
          OR NOT toLower(a.status) IN ['accepted','proposed','deprecated','superseded']
        RETURN a.adrId as nodeId, 'CodexADR' as label, a.status as currentStatus
        LIMIT 20
      `,
      messageTemplate: 'ADR {nodeId} has invalid status: {currentStatus}'
    });
  }
}

module.exports = { CodexRuleRegistry };
