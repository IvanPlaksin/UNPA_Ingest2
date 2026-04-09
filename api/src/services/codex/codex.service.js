/**
 * Codex Service - CRUD operations for Codex namespace
 *
 * Implements:
 * - Information Contract validation
 * - Hash chain integrity (contentHash, chainHash)
 * - Admin-only write enforcement
 * - Proposal lifecycle support
 *
 * @see docs/codex/standards/CODEX-CRUD.md
 */

const crypto = require('crypto');
const { v7: uuidv7 } = require('uuid');
const { CODEX_NODE_TYPES, CODEX_STATUSES } = require('../../validation/codex-schemas');
const { getSchemaRegistry } = require('../../validation/schema-registry');

// Lazy-load memgraph to avoid circular dependency at import time
let _memgraph = null;
function getMemgraph() {
  if (!_memgraph) {
    _memgraph = require('../memgraph.service');
  }
  return _memgraph;
}

class CodexService {
  constructor() {
    this.namespace = 'Codex';
  }

  // ============================================================
  // HASH CHAIN UTILITIES
  // ============================================================

  /**
   * Canonicalize node properties for hashing.
   * Removes volatile fields, sorts keys alphabetically.
   */
  canonicalize(properties) {
    const volatileFields = ['createdAt', 'updatedAt', 'vectorId', 'contentHash', 'chainHash', 'previousHash'];
    const filtered = {};

    Object.keys(properties)
      .filter(k => !volatileFields.includes(k))
      .sort()
      .forEach(k => {
        filtered[k] = properties[k];
      });

    return JSON.stringify(filtered);
  }

  /** Generate SHA-256 hash */
  hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /** Compute content hash for node properties */
  computeContentHash(properties) {
    return this.hash(this.canonicalize(properties));
  }

  /** Compute chain hash: SHA256(previousHash + contentHash) */
  computeChainHash(previousHash, contentHash) {
    return this.hash(previousHash + contentHash);
  }

  // ============================================================
  // CODEX ID GENERATION
  // ============================================================

  /**
   * Generate next codexId for a given node type.
   * Format: CODEX-{TYPE_PREFIX}-{SEQUENCE}
   */
  async generateCodexId(nodeType) {
    const prefixMap = {
      CodexPrinciple: 'PRINCIPLE',
      CodexRule: 'RULE',
      CodexDefinition: 'DEF',
      CodexConstraint: 'CONSTRAINT',
      CodexPattern: 'PATTERN',
      CodexSection: 'SECTION',
      CodexVersion: 'VERSION',
      CodexProposal: 'PROPOSAL',
      CodexDecision: 'DECISION',
      CodexStakeholder: 'STAKEHOLDER'
    };

    const prefix = prefixMap[nodeType];
    if (!prefix) {
      throw new Error(`Unknown Codex node type: ${nodeType}`);
    }

    const mg = getMemgraph();
    const query = `
      MATCH (n:${nodeType})
      WHERE n.codexId STARTS WITH 'CODEX-${prefix}-'
      RETURN n.codexId AS codexId
      ORDER BY n.codexId DESC
      LIMIT 1
    `;

    const result = await mg.runQuery(query);

    let nextSeq = 1;
    if (result.length > 0) {
      const lastId = result[0].codexId;
      const lastSeq = parseInt(lastId.split('-').pop(), 10);
      nextSeq = lastSeq + 1;
    }

    return `CODEX-${prefix}-${String(nextSeq).padStart(3, '0')}`;
  }

  // ============================================================
  // CREATE OPERATIONS
  // ============================================================

  /**
   * Create a new Codex node with full Information Contract.
   *
   * @param {string} nodeType - One of CODEX_NODE_TYPES
   * @param {object} properties - Node properties (without id, codexId, hashes)
   * @param {object} context - { isAdmin: boolean, createdBy: string }
   * @returns {object} Created node
   */
  async createNode(nodeType, properties, context = {}) {
    if (!CODEX_NODE_TYPES.includes(nodeType)) {
      throw new Error(`Invalid Codex node type: ${nodeType}`);
    }

    // Check write permissions
    if (!context.isAdmin && nodeType !== 'CodexProposal') {
      throw new Error(
        'Codex namespace requires admin privileges for direct writes. ' +
        'Use CodexProposal for agent-submitted changes.'
      );
    }

    // Generate IDs
    const id = uuidv7();
    const codexId = await this.generateCodexId(nodeType);

    // Build full node
    const now = new Date().toISOString();
    const node = {
      ...properties,
      id,
      codexId,
      namespace: this.namespace,
      nodeType,
      status: properties.status || 'ACTIVE',
      version: properties.version || '1.0.0',
      createdAt: now,
      createdBy: context.createdBy || 'admin',
      changeabilityTier: properties.changeabilityTier || 'ADMIN_ONLY'
    };

    // Compute hash chain
    node.contentHash = this.computeContentHash(node);
    node.previousHash = 'GENESIS';
    node.chainHash = this.computeChainHash(node.previousHash, node.contentHash);

    // Serialize array/object properties for Memgraph storage
    const props = this._serializeForMemgraph(node);

    // Create in Memgraph
    const mg = getMemgraph();
    const query = `
      CREATE (n:${nodeType} $props)
      SET n.namespace = 'Codex'
      RETURN n
    `;

    const result = await mg.runQuery(query, { props });

    return result[0]?.n || node;
  }

  /**
   * Serialize complex properties (arrays, objects) to JSON strings for Memgraph.
   * Memgraph does not natively support nested objects.
   */
  _serializeForMemgraph(node) {
    const props = {};
    for (const [key, value] of Object.entries(node)) {
      if (value === null || value === undefined) continue;
      if (Array.isArray(value)) {
        props[key] = JSON.stringify(value);
      } else if (typeof value === 'object') {
        props[key] = JSON.stringify(value);
      } else {
        props[key] = value;
      }
    }
    return props;
  }

  /**
   * Deserialize JSON-encoded properties from Memgraph back to objects/arrays.
   */
  _deserializeFromMemgraph(node) {
    if (!node || !node.properties) return node;
    const result = { ...node.properties };
    const arrayFields = ['tags', 'applicableLabels', 'examples', 'scope', 'relatedTerms', 'permittedScopes'];
    const objectFields = ['proposedChanges', 'autonomyCertificate'];
    for (const field of arrayFields) {
      if (typeof result[field] === 'string') {
        try { result[field] = JSON.parse(result[field]); } catch { /* keep string */ }
      }
    }
    for (const field of objectFields) {
      if (typeof result[field] === 'string') {
        try { result[field] = JSON.parse(result[field]); } catch { /* keep string */ }
      }
    }
    return result;
  }

  // ============================================================
  // READ OPERATIONS
  // ============================================================

  /** Get Codex node by codexId */
  async getByCodexId(codexId) {
    const mg = getMemgraph();
    const query = `
      MATCH (n {codexId: $codexId, namespace: 'Codex'})
      RETURN n
    `;
    const result = await mg.runQuery(query, { codexId });
    return result[0]?.n || null;
  }

  /** Get all nodes of a specific type */
  async getByType(nodeType, options = {}) {
    const { status = 'ACTIVE', limit = 100 } = options;
    const mg = getMemgraph();

    // Memgraph requires LIMIT to be a literal integer, not a parameter
    const safeLimit = Math.floor(Number(limit)) || 100;
    const query = `
      MATCH (n:${nodeType} {namespace: 'Codex'})
      ${status ? 'WHERE n.status = $status' : ''}
      RETURN n
      ORDER BY n.codexId
      LIMIT ${safeLimit}
    `;

    const result = await mg.runQuery(query, { status });
    return result.map(r => r.n);
  }

  /** Get all principles (M3 level) */
  async getPrinciples() {
    return this.getByType('CodexPrinciple');
  }

  /** Get all rules derived from a principle */
  async getRulesByPrinciple(principleCodexId) {
    const mg = getMemgraph();
    const query = `
      MATCH (p:CodexPrinciple {codexId: $principleCodexId})<-[:DERIVES_FROM]-(r:CodexRule)
      WHERE r.status = 'ACTIVE'
      RETURN r
      ORDER BY r.codexId
    `;
    const result = await mg.runQuery(query, { principleCodexId });
    return result.map(r => r.r);
  }

  // ============================================================
  // RELATIONSHIP OPERATIONS
  // ============================================================

  /** Create relationship between Codex nodes */
  async createRelationship(fromCodexId, toCodexId, relType, properties = {}) {
    const mg = getMemgraph();
    const query = `
      MATCH (from {codexId: $fromCodexId, namespace: 'Codex'})
      MATCH (to {codexId: $toCodexId, namespace: 'Codex'})
      CREATE (from)-[r:${relType} $props]->(to)
      RETURN r
    `;

    const result = await mg.runQuery(query, {
      fromCodexId,
      toCodexId,
      props: {
        ...properties,
        createdAt: new Date().toISOString()
      }
    });

    return result[0]?.r || null;
  }

  /** Link rule to principle (DERIVES_FROM) */
  async linkRuleToPrinciple(ruleCodexId, principleCodexId, strength = 1.0) {
    return this.createRelationship(ruleCodexId, principleCodexId, 'DERIVES_FROM', { strength });
  }

  /** Link constraint to rule (ENFORCES) */
  async linkConstraintToRule(constraintCodexId, ruleCodexId) {
    return this.createRelationship(constraintCodexId, ruleCodexId, 'ENFORCES', {});
  }

  /** Link pattern to rule (IMPLEMENTS) */
  async linkPatternToRule(patternCodexId, ruleCodexId) {
    return this.createRelationship(patternCodexId, ruleCodexId, 'IMPLEMENTS', {});
  }

  // ============================================================
  // TRAVERSAL FOR DOCUMENTATION GENERATION
  // ============================================================

  /**
   * Get full Codex graph for agent bootstrap.
   * Returns principles with their derived rules, constraints, patterns.
   */
  async getCodexGraph() {
    const mg = getMemgraph();
    const query = `
      MATCH (p:CodexPrinciple {namespace: 'Codex', status: 'ACTIVE'})
      OPTIONAL MATCH (p)<-[:DERIVES_FROM]-(r:CodexRule {status: 'ACTIVE'})
      OPTIONAL MATCH (r)<-[:ENFORCES]-(c:CodexConstraint {status: 'ACTIVE'})
      OPTIONAL MATCH (r)<-[:IMPLEMENTS]-(pat:CodexPattern {status: 'ACTIVE'})
      RETURN p, collect(DISTINCT r) as rules,
             collect(DISTINCT c) as constraints,
             collect(DISTINCT pat) as patterns
      ORDER BY p.codexId
    `;

    const result = await mg.runQuery(query);

    return result.map(row => ({
      principle: row.p,
      rules: row.rules || [],
      constraints: row.constraints || [],
      patterns: row.patterns || []
    }));
  }

  /**
   * Generate documentation from Codex graph.
   * Proves the Information Contract requirement:
   * "Agent reading graph can generate complete human-readable documentation"
   */
  async generateDocumentation() {
    const graph = await this.getCodexGraph();

    let doc = '# UN ProjectAdvisor Codex\n\n';
    doc += '> Auto-generated from Codex namespace graph\n\n';

    for (const { principle, rules, constraints, patterns } of graph) {
      const p = principle?.properties || principle || {};

      doc += `## ${p.title}\n\n`;
      doc += `**ID:** ${p.codexId}\n\n`;
      doc += `${p.summary}\n\n`;
      doc += `### Rationale\n\n${p.rationale}\n\n`;
      doc += `### Origin\n\n${p.whyItExists}\n\n`;

      let examples = p.examples;
      if (typeof examples === 'string') {
        try { examples = JSON.parse(examples); } catch { examples = []; }
      }
      if (examples?.length) {
        doc += `### Examples\n\n`;
        examples.forEach(ex => {
          doc += `- ${ex}\n`;
        });
        doc += '\n';
      }

      if (rules.length > 0) {
        doc += `### Derived Rules\n\n`;
        for (const ruleNode of rules) {
          const rule = ruleNode?.properties || ruleNode || {};
          doc += `#### ${rule.codexId}: ${rule.title}\n\n`;
          doc += `**Modality:** ${rule.modality} | **Kind:** ${rule.ruleKind}\n\n`;
          doc += `${rule.summary}\n\n`;

          let scope = rule.scope;
          if (typeof scope === 'string') {
            try { scope = JSON.parse(scope); } catch { scope = []; }
          }
          if (scope?.length) {
            doc += `**Applies to:** ${scope.join(', ')}\n\n`;
          }
        }
      }

      doc += '---\n\n';
    }

    return doc;
  }
  // ============================================================
  // CODEX DOCUMENT HIERARCHY (seeded from docs/codex/)
  // ============================================================

  /**
   * Get full Codex document hierarchy:
   * CodexPart → CodexSection → CodexRule (via CONTAINS_RULE)
   */
  async getCodexHierarchy() {
    const mg = getMemgraph();
    const result = await mg.runQuery(`
      MATCH (p:CodexPart)
      OPTIONAL MATCH (p)-[:HAS_SECTION]->(s:CodexSection)
      OPTIONAL MATCH (s)-[:CONTAINS_RULE]->(r:CodexRule)
      WITH p, s, collect(r) as rules
      RETURN p, s, rules
      ORDER BY p.order, s.order
    `);

    // Group rows by part (one row per section)
    const partsMap = new Map();
    for (const row of result) {
      const partId = row.p?.properties?.partId ?? row.p?.partId;
      if (!partsMap.has(partId)) {
        partsMap.set(partId, { part: row.p, sections: [] });
      }
      if (row.s) {
        partsMap.get(partId).sections.push({
          ...(row.s?.properties || row.s),
          rules: (row.rules || []).map(r => r?.properties || r)
        });
      }
    }

    return Array.from(partsMap.values());
  }

  /**
   * Get rules for a specific section
   */
  async getRulesBySection(sectionId) {
    const mg = getMemgraph();
    const result = await mg.runQuery(`
      MATCH (s:CodexSection {sectionId: $sectionId})-[:CONTAINS_RULE]->(r:CodexRule)
      RETURN r
      ORDER BY r.ruleId
    `, { sectionId });

    return result.map(r => r.r);
  }

  /**
   * Get Codex metadata (version, counts)
   */
  async getCodexMetadata() {
    const mg = getMemgraph();
    const result = await mg.runQuery(`
      MATCH (m:CodexMetadata {id: 'codex-metadata'})
      RETURN m
    `);
    return result[0]?.m || null;
  }

  /**
   * Full-text search across all Codex document nodes
   */
  async searchCodexDocuments(query) {
    const mg = getMemgraph();
    const lowerQuery = query.toLowerCase();

    const result = await mg.runQuery(`
      MATCH (n)
      WHERE (n:CodexPart OR n:CodexSection OR n:CodexRule OR n:CodexPrinciple OR n:CodexADR)
        AND (toLower(n.title) CONTAINS $query
             OR toLower(coalesce(n.description, '')) CONTAINS $query)
      RETURN labels(n)[0] as type, n
      LIMIT 30
    `, { query: lowerQuery });

    return result.map(r => ({ type: r.type, node: r.n }));
  }

  /**
   * Get all ADRs with linked parts
   */
  async getADRs() {
    const mg = getMemgraph();
    const result = await mg.runQuery(`
      MATCH (a:CodexADR)
      OPTIONAL MATCH (a)-[:IMPLEMENTS]->(p:CodexPart)
      RETURN a, collect(p.partId) as linkedParts
      ORDER BY a.adrId
    `);

    return result.map(r => ({
      ...r.a,
      linkedParts: r.linkedParts || []
    }));
  }
  /**
   * Get Codex graph data for visualization (Parts + cross-references)
   */
  async getCodexGraphData() {
    const mg = getMemgraph();

    // Parts with section counts
    const parts = await mg.runQuery(`
      MATCH (p:CodexPart)
      OPTIONAL MATCH (p)-[:HAS_SECTION]->(s:CodexSection)
      WITH p, count(s) as sectionCount
      OPTIONAL MATCH (p)<-[:HAS_SECTION]-(s2:CodexSection)-[:CONTAINS_RULE]->(r:CodexRule)
      WITH p, sectionCount, count(r) as ruleCount
      RETURN p, sectionCount, ruleCount
      ORDER BY p.order
    `);

    // Cross-references between parts
    const crossRefs = await mg.runQuery(`
      MATCH (p1:CodexPart)-[r:RELATED_TO]->(p2:CodexPart)
      RETURN p1.partId as source, p2.partId as target, r.reason as reason
    `);

    // ADR → Part links
    const adrLinks = await mg.runQuery(`
      MATCH (a:CodexADR)-[:IMPLEMENTS]->(p:CodexPart)
      RETURN a.adrId as adrId, a.title as adrTitle, p.partId as partId
    `);

    return {
      parts: parts.map(r => ({
        ...(r.p?.properties || r.p),
        sectionCount: r.sectionCount,
        ruleCount: r.ruleCount
      })),
      crossRefs: crossRefs.map(r => ({
        source: r.source,
        target: r.target,
        reason: r.reason
      })),
      adrLinks: adrLinks.map(r => ({
        adrId: r.adrId,
        adrTitle: r.adrTitle,
        partId: r.partId
      }))
    };
  }

  /**
   * Get children of a Codex node for lazy graph expansion.
   * Part  → returns its Sections (with ruleCount)
   * Section → returns its Rules
   */
  async getGraphChildren(nodeId) {
    const mg = getMemgraph();

    // Try Part → Sections
    const sections = await mg.runQuery(`
      MATCH (p:CodexPart {partId: $nodeId})-[:HAS_SECTION]->(s:CodexSection)
      OPTIONAL MATCH (s)-[:CONTAINS_RULE]->(r:CodexRule)
      WITH s, count(r) as ruleCount
      RETURN s, ruleCount
      ORDER BY s.order
    `, { nodeId });

    if (sections.length > 0) {
      return {
        parentId: nodeId,
        parentType: 'part',
        childType: 'section',
        edgeLabel: 'HAS_SECTION',
        children: sections.map(r => ({
          ...(r.s?.properties || r.s),
          ruleCount: r.ruleCount
        }))
      };
    }

    // Try Section → Rules
    const rules = await mg.runQuery(`
      MATCH (s:CodexSection {sectionId: $nodeId})-[:CONTAINS_RULE]->(r:CodexRule)
      RETURN r
      ORDER BY r.ruleId
    `, { nodeId });

    if (rules.length > 0) {
      return {
        parentId: nodeId,
        parentType: 'section',
        childType: 'rule',
        edgeLabel: 'CONTAINS_RULE',
        children: rules.map(r => r.r?.properties || r.r)
      };
    }

    return { parentId: nodeId, parentType: 'unknown', childType: null, edgeLabel: null, children: [] };
  }
}

module.exports = new CodexService();
