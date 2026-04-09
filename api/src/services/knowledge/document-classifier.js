/**
 * Document Classifier — classifies documents by type and retrieves extraction prompts.
 *
 * Scores document against ClassifierRule nodes in Memgraph.
 * Returns document_type_id, confidence, and recommended prompts.
 */

'use strict';

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../memgraph.service');
  return _mg;
}

class DocumentClassifier {

  /**
   * Classify a document based on text content and metadata
   */
  async classify(documentText, metadata = {}) {
    const rules = await this.loadClassifierRules();
    if (!rules.length) return { document_type_id: 'unknown', confidence: 0, alternatives: [], requires_llm_classification: true };

    const scores = [];
    for (const rule of rules) {
      const score = this.scoreDocument(documentText, metadata, rule);
      scores.push({ document_type_id: rule.document_type_id, document_type_name: rule.document_type_name, score, threshold: rule.threshold });
    }

    scores.sort((a, b) => b.score - a.score);
    const top = scores[0];
    const isClassified = top.score >= top.threshold;

    // Get available prompts for top match
    let recommendedPrompts = [];
    if (isClassified) {
      recommendedPrompts = await this.getAvailablePromptTypes(top.document_type_id);
    }

    return {
      document_type_id: isClassified ? top.document_type_id : 'unknown',
      document_type_name: isClassified ? top.document_type_name : 'Unknown',
      confidence: Math.round(top.score * 100) / 100,
      confidence_level: top.score >= 0.85 ? 'HIGH' : top.score >= 0.6 ? 'MEDIUM' : 'LOW',
      alternatives: scores.slice(1, 4).map(s => ({ document_type_id: s.document_type_id, document_type_name: s.document_type_name, confidence: Math.round(s.score * 100) / 100 })),
      requires_llm_classification: !isClassified,
      recommended_prompts: recommendedPrompts
    };
  }

  /**
   * Score document against a classifier rule
   */
  scoreDocument(text, metadata, rule) {
    let rules;
    try { rules = typeof rule.rules === 'string' ? JSON.parse(rule.rules) : rule.rules; }
    catch { return 0; }

    const textLower = (text || '').toLowerCase();
    const textUpper = (text || '').toUpperCase();
    let totalScore = 0;

    for (const r of rules) {
      if (r.signal === 'keyword_match' && r.keywords) {
        const matches = r.keywords.filter(kw => textLower.includes(kw.toLowerCase())).length;
        totalScore += (matches / Math.max(r.keywords.length, 1)) * (r.weight || 0);
      }

      if (r.signal === 'section_match' && r.sections) {
        const matches = r.sections.filter(s => textUpper.includes(s.toUpperCase())).length;
        totalScore += (matches / Math.max(r.sections.length, 1)) * (r.weight || 0);
      }

      if (r.signal === 'structure_match') {
        if (r.pattern === 'numbered_paragraphs') {
          const matches = text.match(/^\d+\./gm) || [];
          totalScore += Math.min(matches.length / 10, 1) * (r.weight || 0);
        }
        if (r.pattern === 'lettered_sections') {
          const matches = text.match(/^[A-Z]\.\s+[A-Z]/gm) || [];
          totalScore += Math.min(matches.length / 5, 1) * (r.weight || 0);
        }
      }

      if (r.signal === 'header_match' && r.pattern) {
        try {
          if (new RegExp(r.pattern, 'i').test(text)) totalScore += (r.weight || 0);
        } catch { /* invalid regex */ }
      }

      if (r.signal === 'title_match' && r.keywords && metadata.document_title) {
        const titleLower = metadata.document_title.toLowerCase();
        const matches = r.keywords.filter(kw => titleLower.includes(kw.toLowerCase())).length;
        totalScore += (matches / Math.max(r.keywords.length, 1)) * (r.weight || 0);
      }
    }

    return Math.min(totalScore, 1.0);
  }

  /**
   * Get extraction prompt for a document type
   */
  async getExtractionPrompt(documentTypeId, promptType, version) {
    const versionFilter = version ? `AND p.version = $version` : '';
    const result = await mg().runQuery(`
      MATCH (dt:DocumentType {id: $documentTypeId})-[:HAS_PROMPT]->(p:ExtractionPrompt)
      WHERE p.is_active = true AND p.prompt_type = $promptType ${versionFilter}
      RETURN p
      ORDER BY p.version DESC
      LIMIT 1
    `, { documentTypeId, promptType, version: version || '' });

    if (!result.length) return null;
    const props = result[0].p?.properties || result[0].p;
    return props;
  }

  /**
   * List available prompt types for a document type
   */
  async getAvailablePromptTypes(documentTypeId) {
    const result = await mg().runQuery(`
      MATCH (dt:DocumentType {id: $documentTypeId})-[:HAS_PROMPT]->(p:ExtractionPrompt)
      WHERE p.is_active = true
      RETURN DISTINCT p.prompt_type as promptType, p.version as version, p.id as promptId
      ORDER BY p.prompt_type
    `, { documentTypeId });

    return result.map(r => ({ promptType: r.promptType, version: r.version, promptId: r.promptId }));
  }

  /**
   * List all document types
   */
  async listDocumentTypes() {
    const result = await mg().runQuery(`
      MATCH (r:DocumentTypeRegistry)-[:HAS_TYPE]->(dt:DocumentType)
      OPTIONAL MATCH (dt)-[:HAS_PROMPT]->(p:ExtractionPrompt {is_active: true})
      RETURN dt.id as id, dt.name as name, dt.description as description,
             collect(DISTINCT p.prompt_type) as availablePrompts
      ORDER BY dt.name
    `);

    return result.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      availablePrompts: r.availablePrompts || []
    }));
  }

  /**
   * Register a new extraction prompt (creates version, preserves history)
   */
  async registerExtractionPrompt({ document_type_id, prompt_type, system_prompt, extraction_prompt, output_format, validation_rules, change_log }) {
    const { v4: uuidv4 } = require('uuid');

    // Deactivate old version
    await mg().runQuery(`
      MATCH (dt:DocumentType {id: $dtId})-[:HAS_PROMPT]->(p:ExtractionPrompt {prompt_type: $pt, is_active: true})
      SET p.is_active = false
      RETURN p.id as oldId, p.version as oldVersion
    `, { dtId: document_type_id, pt: prompt_type });

    // Get next version
    const versionResult = await mg().runQuery(`
      MATCH (dt:DocumentType {id: $dtId})-[:HAS_PROMPT]->(p:ExtractionPrompt {prompt_type: $pt})
      RETURN p.version as v ORDER BY p.version DESC LIMIT 1
    `, { dtId: document_type_id, pt: prompt_type });

    const lastVersion = versionResult[0]?.v || '0.0.0';
    const parts = lastVersion.split('.').map(Number);
    parts[2] = (parts[2] || 0) + 1;
    const newVersion = parts.join('.');

    const id = `${document_type_id}-${prompt_type}-v${newVersion.replace(/\./g, '')}`;

    const prompt = {
      id,
      document_type_id,
      prompt_type,
      version: newVersion,
      is_active: true,
      language: 'en',
      system_prompt,
      extraction_prompt,
      output_format: output_format || '',
      validation_rules: validation_rules || '[]',
      change_log: change_log || '',
      created_at: new Date().toISOString(),
      created_by: 'system'
    };

    await mg().runQuery(`
      MATCH (dt:DocumentType {id: $dtId})
      CREATE (p:ExtractionPrompt $props)
      CREATE (dt)-[:HAS_PROMPT]->(p)
      RETURN p
    `, { dtId: document_type_id, props: prompt });

    // Link SUPERSEDES to old version
    await mg().runQuery(`
      MATCH (newP:ExtractionPrompt {id: $newId})
      MATCH (oldP:ExtractionPrompt {document_type_id: $dtId, prompt_type: $pt, is_active: false})
      WHERE oldP.id <> $newId
      CREATE (newP)-[:SUPERSEDES]->(oldP)
    `, { newId: id, dtId: document_type_id, pt: prompt_type }).catch(() => {});

    return { id, version: newVersion, supersedes: lastVersion !== '0.0.0' ? lastVersion : null };
  }

  /**
   * Load all active classifier rules
   */
  async loadClassifierRules() {
    const result = await mg().runQuery(`
      MATCH (dt:DocumentType)-[:HAS_CLASSIFIER]->(cr:ClassifierRule {is_active: true})
      RETURN dt.id as document_type_id, dt.name as document_type_name, cr.rules as rules, cr.threshold as threshold
    `);

    return result.map(r => ({
      document_type_id: r.document_type_id,
      document_type_name: r.document_type_name,
      rules: r.rules,
      threshold: r.threshold || 0.6
    }));
  }
}

module.exports = new DocumentClassifier();
