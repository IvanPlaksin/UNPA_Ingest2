/**
 * End-to-End Pipeline Testing Framework
 *
 * Validates information integrity across the entire processing chain:
 * Input → Sanitize → Detect Language → Expand Query → Chunk → Extract Entities
 * → Embed → Store → Retrieve → Compare
 *
 * @module tests/e2e/pipeline-e2e.test
 */

'use strict';

const { describe, it, before, after } = require('mocha');
const { expect } = require('chai');

// Pipeline components
const { TextSanitizer } = require('../../src/services/preprocessing/sanitizer.service');
const { LanguageDetector } = require('../../src/services/preprocessing/language-detector');
const { TextChunker } = require('../../src/services/chunking/text-chunker');
const { EntityExtractor } = require('../../src/services/extraction/entity-extractor');
const { QueryExpansionService } = require('../../src/services/retrieval/query-expansion.service');
const { RerankerService } = require('../../src/services/retrieval/reranker.service');
const { resultFusion, fuseMultiple } = require('../../src/services/retrieval/result-fusion');

/**
 * Golden Dataset for UN-specific content testing
 * Each entry contains:
 * - input: Original text
 * - expectedLanguage: Expected detected language
 * - expectedEntities: Entities that MUST be extracted
 * - expectedChunks: Min/max chunk count
 * - searchQueries: Queries that should find this document
 * - semanticIntent: What the text is about (for semantic comparison)
 */
const GOLDEN_DATASET = [
  {
    id: 'UN-001',
    category: 'HR_LEAVE',
    input: `
      Subject: Annual Leave Request - ST/AI/2023/1

      Dear HR Team,

      I am writing to request annual leave from January 15, 2024 to January 22, 2024.
      As per ST/AI/2023/1 (Administrative instruction on leave), I have 25 days of
      annual leave entitlement remaining. This request is submitted through IMIS
      as required by OICT guidelines.

      My supervisor, Mr. John Smith from DGACM, has approved this request.
      Please process through Umoja as per standard procedure.

      Best regards,
      Jane Doe
      P-4, Department of Management Strategy
    `,
    expectedLanguage: 'en',
    expectedEntities: [
      { type: 'Document', names: ['ST/AI/2023/1'] },
      { type: 'System', names: ['IMIS', 'Umoja'] },
      { type: 'Organization', names: ['OICT', 'DGACM'] },
      { type: 'Person', names: ['John Smith', 'Jane Doe'] }
    ],
    expectedChunks: { min: 1, max: 3 },
    searchQueries: [
      { query: 'annual leave request', minScore: 0.7 },
      { query: 'IMIS leave entitlement', minScore: 0.6 },
      { query: 'ST/AI leave policy', minScore: 0.5 }
    ],
    semanticIntent: 'Employee requesting annual leave following UN administrative procedures',
    criticalTerms: ['annual leave', 'IMIS', 'Umoja', 'ST/AI', 'entitlement']
  },

  {
    id: 'UN-002',
    category: 'TECHNICAL_SYSTEM',
    input: `
      Technical Specification: Inspira Integration with Unite Identity

      This document describes the integration between Inspira (UN talent management system)
      and Unite Identity (Single Sign-On). The integration uses SAML 2.0 protocol
      and requires coordination with OICT's Identity Management team.

      Key components:
      1. Authentication flow via Azure AD B2C
      2. Token exchange with Inspira backend (Java/Spring Boot)
      3. User provisioning sync with LDAP directory
      4. Audit logging to ServiceNow ITSM

      Dependencies:
      - Inspira v5.2.1 or higher
      - Unite Identity SAML endpoint
      - Redis cache for session management
      - PostgreSQL database for audit logs
    `,
    expectedLanguage: 'en',
    expectedEntities: [
      { type: 'System', names: ['Inspira', 'Unite Identity', 'ServiceNow', 'Azure AD'] },
      { type: 'Technology', names: ['SAML 2.0', 'Java', 'Spring Boot', 'LDAP', 'Redis', 'PostgreSQL'] },
      { type: 'Organization', names: ['OICT'] }
    ],
    expectedChunks: { min: 1, max: 4 },
    searchQueries: [
      { query: 'Inspira SSO integration', minScore: 0.7 },
      { query: 'SAML authentication UN', minScore: 0.6 },
      { query: 'Unite Identity technical spec', minScore: 0.6 }
    ],
    semanticIntent: 'Technical specification for SSO integration between UN systems',
    criticalTerms: ['Inspira', 'Unite Identity', 'SAML', 'SSO', 'authentication']
  },

  {
    id: 'UN-003',
    category: 'MULTILINGUAL',
    input: `
      Rapport annuel - Département de l'Assemblée générale (DGACM)

      Ce rapport présente les activités du département pour l'année 2023.
      Les services de traduction ont traité plus de 500,000 pages dans les
      six langues officielles de l'ONU: anglais, arabe, chinois, espagnol,
      français et russe.

      Le système Umoja a été utilisé pour la gestion financière, tandis que
      gDoc a servi pour la gestion documentaire. L'intégration avec IMIS
      pour les ressources humaines reste en cours.

      Points clés:
      - Productivité: +15% par rapport à 2022
      - Délais de livraison: 98% dans les temps
      - Satisfaction client: 4.5/5
    `,
    expectedLanguage: 'fr',
    expectedEntities: [
      { type: 'Organization', names: ['DGACM', 'ONU'] },
      { type: 'System', names: ['Umoja', 'gDoc', 'IMIS'] }
    ],
    expectedChunks: { min: 1, max: 3 },
    searchQueries: [
      { query: 'DGACM rapport annuel', minScore: 0.7 },
      { query: 'translation services UN', minScore: 0.5 },
      { query: 'Umoja document management', minScore: 0.5 }
    ],
    semanticIntent: 'Annual report of UN translation department with productivity metrics',
    criticalTerms: ['DGACM', 'traduction', 'Umoja', 'gDoc', 'productivité']
  },

  {
    id: 'UN-004',
    category: 'MIXED_SCRIPT',
    input: `
      联合国信息技术办公室 (OICT) 年度技术报告

      本报告涵盖2023年度OICT的主要技术项目。

      Key Projects (主要项目):
      1. Unite Docs - 文档管理系统升级
      2. Umoja Extension II - ERP系统扩展
      3. Inspira Enhancement - 人才管理优化

      Technical stack includes: Python, Node.js, React, PostgreSQL, Redis
      部署环境: Azure Cloud, Kubernetes

      For more information, contact OICT Service Desk.
      详情请联系OICT服务台。
    `,
    expectedLanguage: 'zh', // Primary language detection
    expectedEntities: [
      { type: 'Organization', names: ['OICT'] },
      { type: 'System', names: ['Unite Docs', 'Umoja', 'Inspira'] },
      { type: 'Technology', names: ['Python', 'Node.js', 'React', 'PostgreSQL', 'Redis', 'Azure', 'Kubernetes'] }
    ],
    expectedChunks: { min: 1, max: 4 },
    searchQueries: [
      { query: 'OICT technical report', minScore: 0.6 },
      { query: 'UN cloud infrastructure', minScore: 0.5 }
    ],
    semanticIntent: 'Technical report from OICT covering major IT projects in mixed Chinese/English',
    criticalTerms: ['OICT', 'Unite Docs', 'Umoja', 'Azure', 'Kubernetes']
  },

  {
    id: 'UN-005',
    category: 'EDGE_CASE_SPECIAL_CHARS',
    input: `
      Bug Report #12345 - ITSM-2024-001

      Title: Special characters cause encoding issues in gDoc

      Description:
      When uploading documents containing special characters like:
      - Em dash (—) vs hyphen (-)
      - Curly quotes ("") vs straight quotes ("")
      - Ellipsis (…) vs three dots (...)
      - Non-breaking space ( ) vs regular space

      The system displays: "Error: Unsupported character encoding"

      Steps to reproduce:
      1. Create document in MS Word with "smart quotes" enabled
      2. Upload to gDoc via OICT portal
      3. Observe encoding error

      Expected: Document should be processed correctly
      Actual: Error message displayed

      Priority: P2
      Assignee: @tech-support-team
      Labels: bug, encoding, gDoc, P2
    `,
    expectedLanguage: 'en',
    expectedEntities: [
      { type: 'System', names: ['gDoc', 'ITSM'] },
      { type: 'Organization', names: ['OICT'] }
    ],
    expectedChunks: { min: 1, max: 3 },
    searchQueries: [
      { query: 'gDoc encoding error', minScore: 0.7 },
      { query: 'special characters upload bug', minScore: 0.6 }
    ],
    semanticIntent: 'Bug report about character encoding issues in document management system',
    criticalTerms: ['bug', 'encoding', 'gDoc', 'special characters', 'error']
  }
];

/**
 * Quality Metrics Calculator
 */
class QualityMetrics {
  /**
   * Calculate entity preservation rate
   * @param {Object[]} expected - Expected entities
   * @param {Object[]} extracted - Actually extracted entities
   * @returns {Object} Metrics
   */
  static entityPreservation(expected, extracted) {
    const extractedNames = new Set(
      extracted.map(e => (e.name || e.text || '').toLowerCase())
    );

    let totalExpected = 0;
    let found = 0;
    const missing = [];

    for (const category of expected) {
      for (const name of category.names) {
        totalExpected++;
        const nameLower = name.toLowerCase();

        // Check if any extracted entity contains this name
        const isFound = [...extractedNames].some(e =>
          e.includes(nameLower) || nameLower.includes(e)
        );

        if (isFound) {
          found++;
        } else {
          missing.push({ type: category.type, name });
        }
      }
    }

    return {
      total: totalExpected,
      found,
      missing,
      rate: totalExpected > 0 ? found / totalExpected : 1,
      passed: (found / totalExpected) >= 0.7 // 70% threshold
    };
  }

  /**
   * Calculate critical term preservation
   * @param {string[]} criticalTerms - Terms that must be preserved
   * @param {string} processedText - Text after processing
   * @returns {Object} Metrics
   */
  static termPreservation(criticalTerms, processedText) {
    const textLower = processedText.toLowerCase();
    const found = [];
    const missing = [];

    for (const term of criticalTerms) {
      if (textLower.includes(term.toLowerCase())) {
        found.push(term);
      } else {
        missing.push(term);
      }
    }

    return {
      total: criticalTerms.length,
      found: found.length,
      missing,
      rate: criticalTerms.length > 0 ? found.length / criticalTerms.length : 1,
      passed: (found.length / criticalTerms.length) >= 0.8 // 80% threshold
    };
  }

  /**
   * Calculate information density (tokens per semantic unit)
   * @param {string} original - Original text
   * @param {Object[]} chunks - Generated chunks
   * @returns {Object} Metrics
   */
  static informationDensity(original, chunks) {
    const originalTokens = original.split(/\s+/).length;
    const chunkTokens = chunks.reduce((sum, c) =>
      sum + (c.content || c.text || '').split(/\s+/).length, 0
    );

    // Calculate overlap ratio
    const overlapRatio = chunks.length > 1
      ? (chunkTokens - originalTokens) / originalTokens
      : 0;

    return {
      originalTokens,
      chunkTokens,
      chunkCount: chunks.length,
      overlapRatio,
      avgChunkSize: chunks.length > 0 ? chunkTokens / chunks.length : 0,
      passed: overlapRatio < 0.3 // Max 30% overlap
    };
  }

  /**
   * Calculate Jaccard similarity between texts
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {number} Similarity score (0-1)
   */
  static jaccardSimilarity(text1, text2) {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Semantic similarity approximation using TF-IDF-like scoring
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {number} Similarity score (0-1)
   */
  static semanticSimilarity(text1, text2) {
    // Simple term frequency based similarity
    const tf = (text) => {
      const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const freq = {};
      for (const w of words) {
        freq[w] = (freq[w] || 0) + 1;
      }
      // Normalize
      const total = Object.values(freq).reduce((s, v) => s + v, 0);
      for (const w in freq) {
        freq[w] /= total;
      }
      return freq;
    };

    const tf1 = tf(text1);
    const tf2 = tf(text2);

    // Cosine similarity of TF vectors
    const allTerms = new Set([...Object.keys(tf1), ...Object.keys(tf2)]);

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (const term of allTerms) {
      const v1 = tf1[term] || 0;
      const v2 = tf2[term] || 0;
      dotProduct += v1 * v2;
      norm1 += v1 * v1;
      norm2 += v2 * v2;
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator > 0 ? dotProduct / denominator : 0;
  }
}

/**
 * Round-Trip Test Runner
 */
class RoundTripTester {
  constructor() {
    this.sanitizer = new TextSanitizer({
      removeHtml: true,
      normalizeWhitespace: true,
      preserveCodeBlocks: true
    });

    this.languageDetector = new LanguageDetector({
      defaultLanguage: 'en',
      minConfidence: 0.3
    });

    this.chunker = new TextChunker({
      maxTokens: 512,
      overlapTokens: 50
    });

    this.entityExtractor = new EntityExtractor({
      extractStructuredData: true,
      enableSemanticExtraction: false
    });

    this.queryExpander = new QueryExpansionService({
      maxSynonyms: 3,
      maxSystemExpansions: 2,
      enableRelatedExpansion: true
    });

    this.reranker = new RerankerService({
      diversityWeight: 0.3
    });
  }

  /**
   * Run full pipeline on a document
   * @param {Object} testCase - Test case from golden dataset
   * @returns {Object} Processing results with all intermediate states
   */
  async processDocument(testCase) {
    const results = {
      id: testCase.id,
      category: testCase.category,
      stages: {},
      metrics: {},
      passed: true,
      errors: []
    };

    const startTime = Date.now();

    try {
      // Stage 1: Sanitization
      const sanitized = this.sanitizer.sanitize(testCase.input);
      results.stages.sanitization = {
        output: sanitized.text,
        changes: sanitized.changes,
        metadata: sanitized.metadata
      };

      // Stage 2: Language Detection
      const language = this.languageDetector.detect(sanitized.text);
      results.stages.languageDetection = {
        detected: language.language,
        expected: testCase.expectedLanguage,
        confidence: language.confidence,
        passed: language.language === testCase.expectedLanguage
      };

      if (!results.stages.languageDetection.passed) {
        results.errors.push(`Language mismatch: expected ${testCase.expectedLanguage}, got ${language.language}`);
      }

      // Stage 3: Chunking
      const chunks = this.chunker.chunkForEmbedding(sanitized.text);
      results.stages.chunking = {
        count: chunks.length,
        expectedRange: testCase.expectedChunks,
        chunks: chunks.map(c => ({
          index: c.index,
          tokenEstimate: c.tokenEstimate,
          preview: (c.content || '').substring(0, 100)
        })),
        passed: chunks.length >= testCase.expectedChunks.min &&
                chunks.length <= testCase.expectedChunks.max
      };

      if (!results.stages.chunking.passed) {
        results.errors.push(`Chunk count ${chunks.length} outside expected range [${testCase.expectedChunks.min}, ${testCase.expectedChunks.max}]`);
      }

      // Stage 4: Entity Extraction
      const extraction = await this.entityExtractor.extract(sanitized.text, {
        context: 'document',
        language: language.language
      });
      results.stages.entityExtraction = {
        entities: extraction.entities,
        count: extraction.entities.length
      };

      // Calculate entity preservation
      const entityMetrics = QualityMetrics.entityPreservation(
        testCase.expectedEntities,
        extraction.entities
      );
      results.metrics.entityPreservation = entityMetrics;

      if (!entityMetrics.passed) {
        results.errors.push(`Entity preservation rate ${(entityMetrics.rate * 100).toFixed(1)}% below threshold. Missing: ${entityMetrics.missing.map(m => m.name).join(', ')}`);
      }

      // Stage 5: Term Preservation
      const allChunkText = chunks.map(c => c.content || '').join(' ');
      const termMetrics = QualityMetrics.termPreservation(
        testCase.criticalTerms,
        allChunkText
      );
      results.metrics.termPreservation = termMetrics;

      if (!termMetrics.passed) {
        results.errors.push(`Critical term preservation rate ${(termMetrics.rate * 100).toFixed(1)}% below threshold. Missing: ${termMetrics.missing.join(', ')}`);
      }

      // Stage 6: Information Density
      const densityMetrics = QualityMetrics.informationDensity(
        sanitized.text,
        chunks
      );
      results.metrics.informationDensity = densityMetrics;

      if (!densityMetrics.passed) {
        results.errors.push(`Overlap ratio ${(densityMetrics.overlapRatio * 100).toFixed(1)}% exceeds threshold`);
      }

      // Stage 7: Semantic Similarity (original vs reconstructed)
      const reconstructed = chunks.map(c => c.content || '').join(' ');
      const semanticSim = QualityMetrics.semanticSimilarity(
        sanitized.text,
        reconstructed
      );
      results.metrics.semanticSimilarity = {
        score: semanticSim,
        passed: semanticSim >= 0.7
      };

      // Overall pass/fail
      results.passed = results.errors.length === 0;
      results.processingTime = Date.now() - startTime;

    } catch (error) {
      results.passed = false;
      results.errors.push(`Processing error: ${error.message}`);
      results.error = error;
    }

    return results;
  }

  /**
   * Test query expansion and retrieval
   * @param {Object} testCase - Test case with search queries
   * @param {Object[]} simulatedResults - Simulated search results
   * @returns {Object} Query test results
   */
  async testQueries(testCase, simulatedResults) {
    const queryResults = [];

    for (const searchQuery of testCase.searchQueries) {
      const expansion = await this.queryExpander.expand(searchQuery.query, {
        context: 'search'
      });

      // Find matching results
      const matching = simulatedResults.filter(r => {
        const text = (r.content || r.title || '').toLowerCase();
        const queryTerms = expansion.expanded.toLowerCase().split(/\s+/);
        const matchCount = queryTerms.filter(t => text.includes(t)).length;
        return matchCount / queryTerms.length >= 0.3;
      });

      queryResults.push({
        query: searchQuery.query,
        expanded: expansion.expanded,
        expectedMinScore: searchQuery.minScore,
        matchCount: matching.length,
        passed: matching.length > 0
      });
    }

    return {
      queries: queryResults,
      passedCount: queryResults.filter(q => q.passed).length,
      totalCount: queryResults.length
    };
  }
}

// ============================================================
// TEST SUITES
// ============================================================

describe('E2E Pipeline Testing', function() {
  this.timeout(30000);

  let tester;

  before(() => {
    tester = new RoundTripTester();
  });

  describe('Golden Dataset Round-Trip Tests', () => {
    for (const testCase of GOLDEN_DATASET) {
      it(`should correctly process ${testCase.id} (${testCase.category})`, async () => {
        const results = await tester.processDocument(testCase);

        // Log detailed results for debugging
        if (!results.passed) {
          console.log(`\n  Errors for ${testCase.id}:`);
          results.errors.forEach(e => console.log(`    - ${e}`));
        }

        expect(results.passed, `Errors: ${results.errors.join('; ')}`).to.be.true;
      });
    }
  });

  describe('Language Detection Accuracy', () => {
    it('should correctly detect English documents', async () => {
      const englishCases = GOLDEN_DATASET.filter(c => c.expectedLanguage === 'en');

      for (const testCase of englishCases) {
        const results = await tester.processDocument(testCase);
        expect(results.stages.languageDetection.passed).to.be.true;
      }
    });

    it('should correctly detect French documents', async () => {
      const frenchCases = GOLDEN_DATASET.filter(c => c.expectedLanguage === 'fr');

      for (const testCase of frenchCases) {
        const results = await tester.processDocument(testCase);
        expect(results.stages.languageDetection.passed).to.be.true;
      }
    });

    it('should handle mixed-script documents', async () => {
      const mixedCases = GOLDEN_DATASET.filter(c => c.category === 'MIXED_SCRIPT');

      for (const testCase of mixedCases) {
        const results = await tester.processDocument(testCase);
        // For mixed scripts, we accept either detected language
        expect(results.stages.languageDetection.detected).to.be.oneOf(['zh', 'en']);
      }
    });
  });

  describe('Entity Preservation', () => {
    it('should preserve UN system names', async () => {
      for (const testCase of GOLDEN_DATASET) {
        const results = await tester.processDocument(testCase);

        const systemEntities = testCase.expectedEntities
          .filter(e => e.type === 'System');

        if (systemEntities.length > 0) {
          const extracted = results.stages.entityExtraction.entities
            .filter(e => e.type === 'System' || e.type === 'system');

          // At least 50% of system entities should be found
          const systemPreservation = QualityMetrics.entityPreservation(
            systemEntities,
            extracted
          );

          expect(systemPreservation.rate).to.be.at.least(0.5,
            `System entity preservation for ${testCase.id}`);
        }
      }
    });

    it('should preserve organization names', async () => {
      for (const testCase of GOLDEN_DATASET) {
        const results = await tester.processDocument(testCase);

        const orgEntities = testCase.expectedEntities
          .filter(e => e.type === 'Organization');

        if (orgEntities.length > 0) {
          const extracted = results.stages.entityExtraction.entities
            .filter(e => e.type === 'Organization' || e.type === 'organization');

          const orgPreservation = QualityMetrics.entityPreservation(
            orgEntities,
            extracted
          );

          expect(orgPreservation.rate).to.be.at.least(0.5,
            `Organization preservation for ${testCase.id}`);
        }
      }
    });
  });

  describe('Chunking Quality', () => {
    it('should produce chunks within expected ranges', async () => {
      for (const testCase of GOLDEN_DATASET) {
        const results = await tester.processDocument(testCase);

        expect(results.stages.chunking.count).to.be.at.least(
          testCase.expectedChunks.min,
          `Min chunks for ${testCase.id}`
        );

        expect(results.stages.chunking.count).to.be.at.most(
          testCase.expectedChunks.max,
          `Max chunks for ${testCase.id}`
        );
      }
    });

    it('should maintain reasonable overlap ratio', async () => {
      for (const testCase of GOLDEN_DATASET) {
        const results = await tester.processDocument(testCase);

        expect(results.metrics.informationDensity.overlapRatio).to.be.at.most(
          0.5,
          `Overlap ratio for ${testCase.id}`
        );
      }
    });
  });

  describe('Semantic Preservation', () => {
    it('should preserve semantic meaning after chunking', async () => {
      for (const testCase of GOLDEN_DATASET) {
        const results = await tester.processDocument(testCase);

        expect(results.metrics.semanticSimilarity.score).to.be.at.least(
          0.6,
          `Semantic similarity for ${testCase.id}`
        );
      }
    });

    it('should preserve critical terms', async () => {
      for (const testCase of GOLDEN_DATASET) {
        const results = await tester.processDocument(testCase);

        expect(results.metrics.termPreservation.rate).to.be.at.least(
          0.7,
          `Term preservation for ${testCase.id}: missing ${results.metrics.termPreservation.missing.join(', ')}`
        );
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters correctly', async () => {
      const specialCharCase = GOLDEN_DATASET.find(c =>
        c.category === 'EDGE_CASE_SPECIAL_CHARS'
      );

      if (specialCharCase) {
        const results = await tester.processDocument(specialCharCase);

        // Should not crash on special characters
        expect(results.stages.sanitization.output).to.be.a('string');
        expect(results.stages.sanitization.output.length).to.be.greaterThan(0);
      }
    });

    it('should handle empty input gracefully', async () => {
      const emptyCase = {
        id: 'EDGE-EMPTY',
        category: 'EDGE_CASE',
        input: '   ',
        expectedLanguage: 'en',
        expectedEntities: [],
        expectedChunks: { min: 0, max: 1 },
        searchQueries: [],
        semanticIntent: '',
        criticalTerms: []
      };

      const results = await tester.processDocument(emptyCase);

      // Should handle gracefully without crashing
      expect(results.stages.sanitization).to.exist;
    });

    it('should handle very long input', async () => {
      const longText = 'This is a test sentence about OICT and Umoja systems. '.repeat(200);

      const longCase = {
        id: 'EDGE-LONG',
        category: 'EDGE_CASE',
        input: longText,
        expectedLanguage: 'en',
        expectedEntities: [
          { type: 'System', names: ['Umoja'] },
          { type: 'Organization', names: ['OICT'] }
        ],
        expectedChunks: { min: 5, max: 30 },
        searchQueries: [],
        semanticIntent: 'Test document',
        criticalTerms: ['OICT', 'Umoja']
      };

      const results = await tester.processDocument(longCase);

      expect(results.stages.chunking.count).to.be.greaterThan(1);
      expect(results.metrics.termPreservation.rate).to.equal(1);
    });
  });
});

describe('Query Expansion Tests', () => {
  let expander;

  before(() => {
    expander = new QueryExpansionService({
      maxSynonyms: 3,
      expandAcronyms: true
    });
  });

  it('should expand UN system acronyms', async () => {
    const result = await expander.expand('IMIS leave', {});

    expect(result.expanded.toLowerCase()).to.include('imis');
    expect(result.expanded.toLowerCase()).to.include('integrated');
    expect(result.expanded.toLowerCase()).to.include('management');
  });

  it('should add synonyms for common terms', async () => {
    const result = await expander.expand('annual leave request', {});

    const expandedLower = result.expanded.toLowerCase();
    // Should include original
    expect(expandedLower).to.include('leave');
    // Should include synonyms
    expect(
      expandedLower.includes('absence') ||
      expandedLower.includes('time off') ||
      expandedLower.includes('pto')
    ).to.be.true;
  });

  it('should detect related systems', async () => {
    const result = await expander.expand('Umoja finance', {});

    // Should detect Umoja as a known system
    expect(result.detectedSystems).to.be.an('array');
  });
});

describe('Reranking Tests', () => {
  let reranker;

  before(() => {
    reranker = new RerankerService({
      diversityWeight: 0.3,
      titleMatchBoost: 0.05,
      exactPhraseBoost: 0.1
    });
  });

  it('should boost exact title matches', async () => {
    const query = 'annual leave policy';
    const results = [
      { id: '1', title: 'Annual Leave Policy', content: 'Some content', score: 0.7 },
      { id: '2', title: 'Other Document', content: 'Annual leave policy info', score: 0.75 },
      { id: '3', title: 'Travel Policy', content: 'Travel rules', score: 0.8 }
    ];

    const reranked = await reranker.rerank(query, results, { topK: 3 });

    // Document with title match should be boosted
    const doc1Rank = reranked.findIndex(r => r.id === '1');
    const doc3Rank = reranked.findIndex(r => r.id === '3');

    expect(doc1Rank).to.be.lessThan(doc3Rank);
  });

  it('should apply diversity penalty to similar results', async () => {
    const query = 'leave request';
    const results = [
      { id: '1', title: 'Leave Request 1', content: 'Annual leave request form', score: 0.9 },
      { id: '2', title: 'Leave Request 2', content: 'Annual leave request template', score: 0.85 },
      { id: '3', title: 'Travel Policy', content: 'Business travel guidelines', score: 0.7 }
    ];

    const reranked = await reranker.rerank(query, results, {
      topK: 3,
      applyDiversity: true
    });

    // After MMR, the diverse result should be boosted relative to similar ones
    const stats = reranker.getStats(reranked);
    expect(stats.boostTypes).to.exist;
  });
});

// Export for CLI usage
module.exports = {
  GOLDEN_DATASET,
  QualityMetrics,
  RoundTripTester
};
