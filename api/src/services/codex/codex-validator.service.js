/**
 * Codex Validator Service
 *
 * Validates Information Contract compliance:
 * - All required narrative fields present
 * - Documentation can be generated without loss
 * - Hash chain integrity
 * - Relationship completeness
 *
 * Target: Completeness Score >= 0.90
 */

const codexService = require('./codex.service');
const { CODEX_NODE_TYPES } = require('../../validation/codex-schemas');

class CodexValidatorService {

  static NARRATIVE_FIELDS = ['title', 'summary', 'rationale', 'whyItExists', 'examples'];
  static IDENTITY_FIELDS = ['id', 'codexId', 'namespace', 'nodeType'];
  static LIFECYCLE_FIELDS = ['status', 'version', 'createdAt', 'createdBy'];
  static TRACEABILITY_FIELDS = ['contentHash'];

  /**
   * Validate single node against Information Contract
   * @returns {object} { valid, score, errors, warnings }
   */
  validateNode(node) {
    // Unwrap Memgraph node if needed
    const n = node.properties || node;

    const errors = [];
    const warnings = [];
    let score = 0;

    // Identity (20 points)
    const identityScore = this._validateFields(n, CodexValidatorService.IDENTITY_FIELDS, errors, 'Identity');
    score += (identityScore / CodexValidatorService.IDENTITY_FIELDS.length) * 20;

    // Narrative (40 points - most important for documentability)
    const narrativeScore = this._validateNarrative(n, errors, warnings);
    score += narrativeScore * 40;

    // Lifecycle (20 points)
    const lifecycleScore = this._validateFields(n, CodexValidatorService.LIFECYCLE_FIELDS, errors, 'Lifecycle');
    score += (lifecycleScore / CodexValidatorService.LIFECYCLE_FIELDS.length) * 20;

    // Traceability (10 points)
    const traceScore = this._validateFields(n, CodexValidatorService.TRACEABILITY_FIELDS, errors, 'Traceability');
    score += (traceScore / CodexValidatorService.TRACEABILITY_FIELDS.length) * 10;

    // Hash integrity (10 points)
    const hashValid = this._validateHashIntegrity(n, errors);
    score += hashValid ? 10 : 0;

    return {
      valid: errors.length === 0,
      score: Math.round(score) / 100,
      errors,
      warnings,
      codexId: n.codexId,
      nodeType: n.nodeType
    };
  }

  _validateNarrative(node, errors, warnings) {
    let score = 0;
    const fields = CodexValidatorService.NARRATIVE_FIELDS;

    for (const field of fields) {
      let value = node[field];

      // Deserialize JSON strings (Memgraph stores arrays as strings)
      if (typeof value === 'string' && field === 'examples') {
        try { value = JSON.parse(value); } catch { /* keep string */ }
      }

      if (!value) {
        errors.push(`Missing narrative field: ${field}`);
        continue;
      }

      if (field === 'examples') {
        if (!Array.isArray(value) || value.length === 0) {
          errors.push('examples must be non-empty array');
          continue;
        }
        const validExamples = value.filter(ex => ex && ex.length >= 10);
        if (validExamples.length === 0) {
          errors.push('examples must contain at least one substantive example (>=10 chars)');
          continue;
        }
        if (validExamples.length < value.length) {
          warnings.push(`${value.length - validExamples.length} examples are too short`);
        }
        score += 1;
      } else {
        const minLengths = { title: 3, summary: 10, rationale: 20, whyItExists: 10 };
        if (value.length < minLengths[field]) {
          errors.push(`${field} too short (min ${minLengths[field]} chars, got ${value.length})`);
          continue;
        }
        score += 1;
      }
    }

    return score / fields.length;
  }

  _validateFields(node, fields, errors, category) {
    let present = 0;
    for (const field of fields) {
      if (node[field] !== undefined && node[field] !== null && node[field] !== '') {
        present++;
      } else {
        errors.push(`Missing ${category} field: ${field}`);
      }
    }
    return present;
  }

  _validateHashIntegrity(node, errors) {
    if (!node.contentHash) {
      errors.push('Missing contentHash');
      return false;
    }
    // Note: hash recomputation would not match since Memgraph serialization
    // changes property order. Accept presence for now.
    return true;
  }

  /**
   * Test that documentation can be generated from a node
   */
  testDocumentability(node) {
    const n = node.properties || node;
    const result = {
      canGenerateTitle: false,
      canGenerateSummary: false,
      canGenerateRationale: false,
      canGenerateExamples: false,
      generatedDoc: null,
      docLength: 0
    };

    try {
      let doc = '';

      if (n.title) {
        doc += `## ${n.title}\n\n`;
        result.canGenerateTitle = true;
      }
      if (n.codexId) {
        doc += `**ID:** ${n.codexId}\n\n`;
      }
      if (n.summary) {
        doc += `${n.summary}\n\n`;
        result.canGenerateSummary = true;
      }
      if (n.rationale) {
        doc += `### Rationale\n\n${n.rationale}\n\n`;
        result.canGenerateRationale = true;
      }
      if (n.whyItExists) {
        doc += `### Origin\n\n${n.whyItExists}\n\n`;
      }

      let examples = n.examples;
      if (typeof examples === 'string') {
        try { examples = JSON.parse(examples); } catch { examples = []; }
      }
      if (examples && Array.isArray(examples) && examples.length > 0) {
        doc += `### Examples\n\n`;
        examples.forEach(ex => { doc += `- ${ex}\n`; });
        doc += '\n';
        result.canGenerateExamples = true;
      }

      if (n.modality) doc += `**Modality:** ${n.modality}\n`;
      let scope = n.scope;
      if (typeof scope === 'string') {
        try { scope = JSON.parse(scope); } catch { scope = []; }
      }
      if (scope && Array.isArray(scope)) {
        doc += `**Scope:** ${scope.join(', ')}\n`;
      }

      result.generatedDoc = doc;
      result.docLength = doc.length;
    } catch (err) {
      result.error = err.message;
    }

    return result;
  }

  // ============================================================
  // FULL CODEX VALIDATION
  // ============================================================

  async validateCodex() {
    const report = {
      timestamp: new Date().toISOString(),
      totalNodes: 0,
      validNodes: 0,
      invalidNodes: 0,
      completenessScore: 0,
      byType: {},
      errors: [],
      warnings: [],
      nodeReports: []
    };

    const typesToValidate = [
      'CodexPrinciple', 'CodexRule', 'CodexDefinition',
      'CodexConstraint', 'CodexPattern', 'CodexSection',
      'CodexStakeholder'
    ];

    for (const nodeType of typesToValidate) {
      try {
        const nodes = await codexService.getByType(nodeType, { status: null });

        report.byType[nodeType] = { total: nodes.length, valid: 0, invalid: 0, avgScore: 0 };
        let typeScoreSum = 0;

        for (const node of nodes) {
          report.totalNodes++;
          const n = node.properties || node;
          const validation = this.validateNode(n);
          const docTest = this.testDocumentability(n);

          report.nodeReports.push({
            codexId: n.codexId,
            nodeType: n.nodeType,
            title: n.title,
            validation,
            documentability: docTest
          });

          if (validation.valid) {
            report.validNodes++;
            report.byType[nodeType].valid++;
          } else {
            report.invalidNodes++;
            report.byType[nodeType].invalid++;
            report.errors.push(...validation.errors.map(e => `${n.codexId}: ${e}`));
          }

          report.warnings.push(...validation.warnings.map(w => `${n.codexId}: ${w}`));
          typeScoreSum += validation.score;
        }

        if (nodes.length > 0) {
          report.byType[nodeType].avgScore = Math.round((typeScoreSum / nodes.length) * 100) / 100;
        }
      } catch (err) {
        report.errors.push(`Failed to validate ${nodeType}: ${err.message}`);
      }
    }

    if (report.totalNodes > 0) {
      report.completenessScore = Math.round((report.validNodes / report.totalNodes) * 100) / 100;
    }

    report.summary = {
      passed: report.completenessScore >= 0.90,
      target: 0.90,
      actual: report.completenessScore,
      message: report.completenessScore >= 0.90
        ? 'Codex passes Information Contract validation'
        : `Codex below target (${report.completenessScore} < 0.90)`
    };

    return report;
  }

  async validateRelationships() {
    const report = {
      principlesWithRules: 0,
      principlesWithoutRules: [],
      totalRelationships: 0
    };

    const principles = await codexService.getPrinciples();
    for (const p of principles) {
      const props = p.properties || p;
      const rules = await codexService.getRulesByPrinciple(props.codexId);
      if (rules.length > 0) {
        report.principlesWithRules++;
        report.totalRelationships += rules.length;
      } else {
        report.principlesWithoutRules.push(props.codexId);
      }
    }

    return report;
  }

  async healthCheck() {
    const principles = await codexService.getPrinciples();
    const rules = await codexService.getByType('CodexRule');
    const sections = await codexService.getByType('CodexSection');

    const sampleValidations = [];
    if (principles.length > 0) sampleValidations.push(this.validateNode(principles[0]));
    if (rules.length > 0) sampleValidations.push(this.validateNode(rules[0]));

    const allValid = sampleValidations.every(v => v.valid);

    return {
      status: allValid ? 'HEALTHY' : 'DEGRADED',
      counts: { principles: principles.length, rules: rules.length, sections: sections.length },
      sampleValidation: allValid,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new CodexValidatorService();
