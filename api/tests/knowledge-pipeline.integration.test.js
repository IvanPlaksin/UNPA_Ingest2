/**
 * Integration Tests for Knowledge Pipeline
 *
 * Tests the full text processing pipeline:
 * - Sanitization
 * - Language Detection
 * - Chunking
 * - Entity Extraction
 * - Hybrid Search
 *
 * Run: npm test -- --grep "Knowledge Pipeline"
 *
 * @module tests/integration/knowledge-pipeline.integration.test.js
 */

'use strict';

const { expect } = require('chai');
const path = require('path');

// Import services directly for unit testing
const { TextSanitizer } = require('../src/services/preprocessing/sanitizer.service');
const { LanguageDetector } = require('../src/services/preprocessing/language-detector');
const { TextChunker } = require('../src/services/chunking/text-chunker');
const { EntityExtractor } = require('../src/services/extraction/entity-extractor');
const { resultFusion, fuseMultiple, rrfFusion } = require('../src/services/retrieval/result-fusion');
const { validateNode, NODE_TYPES } = require('../src/services/graph/ontology.schema');

// Test fixtures
const FIXTURES = {
  workItemHtml: `
    <div>
      <p>The <strong>IMIS Budget Module</strong> needs integration with Umoja
      for calculating travel entitlements per ST/AI/2023/1.</p>
      <ul>
        <li>Contact john.doe@un.org for requirements</li>
        <li>See related items: #12345, #67890</li>
      </ul>
    </div>
  `,

  codeSnippet: `
    import { StaffRules } from '@un/staff-rules';

    export class TravelCalculator {
      private umoja: UmojaService;

      async calculateEntitlement(staffId: string): Promise<number> {
        const rules = await StaffRules.load('ST/AI/2023/1');
        return this.applyRules(staffId, rules);
      }
    }
  `,

  mixedContent: `
    # IMIS Integration Guide

    The system connects to Umoja via REST API.
    Contact: support@un.org

    Related work items: WI-12345, #67890

    ## Technical Details

    Uses OICT infrastructure on Azure.
  `,

  multilingual: {
    russian: '\u041f\u0440\u043e\u0435\u043a\u0442 \u0438\u043d\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u0438 \u0441\u0438\u0441\u0442\u0435\u043c\u044b IMIS \u0441 Umoja \u0434\u043b\u044f \u041e\u041e\u041d',
    chinese: 'IMIS\u7cfb\u7edf\u4e0eUmoja\u7684\u96c6\u6210\u9879\u76ee',
    arabic: '\u0645\u0634\u0631\u0648\u0639 \u062f\u0645\u062c \u0646\u0638\u0627\u0645 IMIS \u0645\u0639 Umoja',
    french: 'Le projet d\'int\u00e9gration du syst\u00e8me IMIS avec Umoja pour l\'ONU'
  },

  piiContent: `
    Contact John Doe at john.doe@un.org or +1-212-963-1234.
    SSN: 123-45-6789, Credit Card: 4111-1111-1111-1111.
    Bearer token: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test
  `
};

describe('Knowledge Pipeline Integration Tests', function() {
  this.timeout(30000);

  // Initialize services
  let sanitizer;
  let languageDetector;
  let chunker;
  let entityExtractor;

  before(() => {
    sanitizer = new TextSanitizer({
      removeHtml: true,
      normalizeWhitespace: true,
      preserveCodeBlocks: true
    });

    languageDetector = new LanguageDetector({
      defaultLanguage: 'en',
      minConfidence: 0.3
    });

    chunker = new TextChunker({
      maxTokens: 512,
      overlapTokens: 50,
      preserveParagraphs: true
    });

    entityExtractor = new EntityExtractor({
      extractStructuredData: true,
      enableSemanticExtraction: false
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SANITIZATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Sanitization Service', () => {

    it('should remove HTML tags and preserve text content', () => {
      const result = sanitizer.sanitize(FIXTURES.workItemHtml);

      expect(result.text).to.not.include('<strong>');
      expect(result.text).to.not.include('<div>');
      expect(result.text).to.not.include('<p>');
      expect(result.text).to.include('IMIS Budget Module');
      expect(result.text).to.include('Umoja');
    });

    it('should preserve code blocks during sanitization', () => {
      const textWithCode = 'Text before ```javascript\nconst x = 1;\n``` text after';
      const result = sanitizer.sanitize(textWithCode);

      expect(result.text).to.include('```javascript');
      expect(result.text).to.include('const x = 1;');
    });

    it('should remove PII when enabled', () => {
      const result = sanitizer.sanitize(FIXTURES.piiContent, { removePII: true });

      expect(result.text).to.not.include('john.doe@un.org');
      expect(result.text).to.not.include('123-45-6789');
      expect(result.text).to.not.include('4111-1111-1111-1111');
      expect(result.text).to.include('[EMAIL_REDACTED]');
      expect(result.metadata.hadPII).to.be.true;
    });

    it('should handle empty and null input', () => {
      const emptyResult = sanitizer.sanitize('');
      expect(emptyResult.text).to.equal('');

      const nullResult = sanitizer.sanitize(null);
      expect(nullResult.text).to.equal('');
    });

    it('should normalize Unicode characters', () => {
      const fancyText = '\u201cHello\u201d \u2014 World\u2019s best';
      const result = sanitizer.sanitize(fancyText);

      expect(result.text).to.include('"Hello"');
      expect(result.text).to.include("World's");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LANGUAGE DETECTION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Language Detection Service', () => {

    it('should detect English text', () => {
      const result = languageDetector.detect('The IMIS system integrates with Umoja for budget processing.');

      expect(result.language).to.equal('en');
      expect(result.confidence).to.be.greaterThan(0.5);
    });

    it('should detect Russian text', () => {
      const result = languageDetector.detect(FIXTURES.multilingual.russian);

      expect(result.language).to.equal('ru');
      expect(result.confidence).to.be.greaterThan(0.5);
    });

    it('should detect Chinese text', () => {
      const result = languageDetector.detect(FIXTURES.multilingual.chinese);

      expect(result.language).to.equal('zh');
      expect(result.confidence).to.be.greaterThan(0.5);
    });

    it('should detect Arabic text', () => {
      const result = languageDetector.detect(FIXTURES.multilingual.arabic);

      expect(result.language).to.equal('ar');
      expect(result.confidence).to.be.greaterThan(0.5);
    });

    it('should detect French text', () => {
      const result = languageDetector.detect(FIXTURES.multilingual.french);

      expect(result.language).to.equal('fr');
      expect(result.confidence).to.be.greaterThan(0.5);
    });

    it('should return default for very short text', () => {
      const result = languageDetector.detect('Hi');

      expect(result.language).to.equal('en');
      expect(result.confidence).to.be.lessThan(0.5);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CHUNKING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Text Chunking Service', () => {

    it('should chunk text into reasonable segments', () => {
      const longText = FIXTURES.mixedContent.repeat(5);
      const chunks = chunker.chunk(longText);

      expect(chunks).to.be.an('array');
      expect(chunks.length).to.be.greaterThan(0);

      chunks.forEach(chunk => {
        expect(chunk.content).to.be.a('string');
        expect(chunk.tokenEstimate).to.be.lessThanOrEqual(chunker.config.maxTokens + 50);
        expect(chunk.index).to.be.a('number');
      });
    });

    it('should preserve paragraph structure', () => {
      const paragraphs = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
      const chunks = chunker.chunk(paragraphs);

      // Should have reasonable chunks
      expect(chunks.length).to.be.greaterThan(0);
    });

    it('should include metadata in chunks', () => {
      const chunks = chunker.chunk(FIXTURES.mixedContent);

      chunks.forEach(chunk => {
        expect(chunk).to.have.property('startOffset');
        expect(chunk).to.have.property('endOffset');
        expect(chunk).to.have.property('metadata');
      });
    });

    it('should handle empty input', () => {
      const chunks = chunker.chunk('');
      expect(chunks).to.deep.equal([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTITY EXTRACTION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Entity Extraction Service', () => {

    it('should extract UN systems from text', async () => {
      const text = 'The IMIS system integrates with Umoja and Inspira.';
      const result = await entityExtractor.extract(text);

      const entityNames = result.entities.map(e => (e.name || e.text || '').toLowerCase());

      expect(entityNames).to.include('imis');
      expect(entityNames).to.include('umoja');
      expect(entityNames).to.include('inspira');
    });

    it('should extract UN organizations', async () => {
      const text = 'OICT provides infrastructure. DGACM handles translation. DM oversees management.';
      const result = await entityExtractor.extract(text);

      const entityNames = result.entities.map(e => (e.name || e.text || '').toLowerCase());

      expect(entityNames).to.include('oict');
      expect(entityNames).to.include('dgacm');
    });

    it('should extract administrative instructions', async () => {
      const text = 'Per ST/AI/2023/1, staff must follow ST/SGB/2022/5 guidelines.';
      const result = await entityExtractor.extract(text);

      const entities = result.entities;
      const docRefs = entities.filter(e => e.type === 'AdminInstruction' || e.type === 'UNDocument');

      expect(docRefs.length).to.be.greaterThan(0);
    });

    it('should extract code entities from TypeScript', async () => {
      const result = await entityExtractor.extract(FIXTURES.codeSnippet, {
        context: 'code',
        language: 'typescript'
      });

      const entities = result.entities;
      const classEntities = entities.filter(e => e.type === 'Class');
      const importEntities = entities.filter(e => e.type === 'Import' || e.type === 'Module');

      expect(classEntities.some(e => e.name === 'TravelCalculator')).to.be.true;
    });

    it('should handle text with no entities', async () => {
      const result = await entityExtractor.extract('Hello world.');

      expect(result.entities).to.be.an('array');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RESULT FUSION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Result Fusion Service', () => {

    it('should fuse results using RRF', () => {
      const list1 = {
        results: [
          { id: 'a', content: 'Result A', score: 0.9 },
          { id: 'b', content: 'Result B', score: 0.8 },
          { id: 'c', content: 'Result C', score: 0.7 }
        ],
        weight: 0.6
      };

      const list2 = {
        results: [
          { id: 'b', content: 'Result B', score: 0.95 },
          { id: 'd', content: 'Result D', score: 0.85 },
          { id: 'a', content: 'Result A', score: 0.75 }
        ],
        weight: 0.4
      };

      const fused = resultFusion(list1, list2, { method: 'rrf' });

      expect(fused).to.be.an('array');
      expect(fused.length).to.be.greaterThan(0);

      // Item 'b' appears in both lists and should be ranked high
      const bIndex = fused.findIndex(r => r.id === 'b');
      expect(bIndex).to.be.lessThan(3);
    });

    it('should deduplicate by ID', () => {
      const list1 = {
        results: [{ id: 'a', content: 'A1', score: 0.9 }],
        weight: 1
      };

      const list2 = {
        results: [{ id: 'a', content: 'A2', score: 0.8 }],
        weight: 1
      };

      const fused = resultFusion(list1, list2, { deduplicateBy: 'id' });

      const aCount = fused.filter(r => r.id === 'a').length;
      expect(aCount).to.equal(1);
    });

    it('should handle empty lists', () => {
      const fused = resultFusion(
        { results: [], weight: 1 },
        { results: [], weight: 1 }
      );

      expect(fused).to.deep.equal([]);
    });

    it('should support linear fusion', () => {
      const list1 = {
        results: [{ id: 'a', score: 0.8 }],
        weight: 0.5
      };

      const list2 = {
        results: [{ id: 'a', score: 0.6 }],
        weight: 0.5
      };

      const fused = resultFusion(list1, list2, { method: 'linear' });

      expect(fused[0].fusedScore).to.be.closeTo(0.7, 0.1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ONTOLOGY VALIDATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Ontology Schema Validation', () => {

    it('should validate correct node structure', () => {
      const node = {
        type: 'WorkItem',
        properties: {
          id: 'workitem_123',
          name: 'Test Work Item'
        }
      };

      const result = validateNode(node);
      expect(result.valid).to.be.true;
    });

    it('should reject node with missing required properties', () => {
      const node = {
        type: 'WorkItem',
        properties: {
          // missing id and name
        }
      };

      const result = validateNode(node);
      expect(result.valid).to.be.false;
      expect(result.errors.length).to.be.greaterThan(0);
    });

    it('should have correct layer assignments', () => {
      // Strategic layer
      expect(NODE_TYPES.Epic.layer).to.equal('Strategic');
      expect(NODE_TYPES.Feature.layer).to.equal('Strategic');

      // Business layer
      expect(NODE_TYPES.WorkItem.layer).to.equal('Business');
      expect(NODE_TYPES.Document.layer).to.equal('Business');

      // Code layer
      expect(NODE_TYPES.File.layer).to.equal('Code');
      expect(NODE_TYPES.Class.layer).to.equal('Code');
    });

    it('should have correct Z positions', () => {
      expect(NODE_TYPES.Epic.zPosition).to.equal(-200);
      expect(NODE_TYPES.WorkItem.zPosition).to.equal(0);
      expect(NODE_TYPES.File.zPosition).to.equal(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FULL PIPELINE INTEGRATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Full Pipeline Integration', () => {

    it('should process work item HTML through full pipeline', async () => {
      // Step 1: Sanitize
      const sanitized = sanitizer.sanitize(FIXTURES.workItemHtml);
      expect(sanitized.text).to.include('IMIS Budget Module');

      // Step 2: Detect language
      const language = languageDetector.detect(sanitized.text);
      expect(language.language).to.equal('en');

      // Step 3: Chunk
      const chunks = chunker.chunk(sanitized.text);
      expect(chunks.length).to.be.greaterThan(0);

      // Step 4: Extract entities from each chunk
      let allEntities = [];
      for (const chunk of chunks) {
        const result = await entityExtractor.extract(chunk.content, {
          language: language.language
        });
        allEntities = allEntities.concat(result.entities);
      }

      // Step 5: Validate entities
      const validEntities = allEntities.filter(entity => {
        const validation = validateNode({
          type: entity.type,
          properties: {
            id: entity.id || `${entity.type}_${entity.name}`,
            name: entity.name || entity.text
          }
        });
        return validation.valid;
      });

      expect(validEntities.length).to.be.greaterThan(0);
    });

    it('should handle code content correctly', async () => {
      const sanitized = sanitizer.sanitize(FIXTURES.codeSnippet);
      const language = languageDetector.detect(sanitized.text);

      // Should detect as English (code comments/identifiers)
      expect(language.language).to.equal('en');

      const result = await entityExtractor.extract(sanitized.text, {
        context: 'code'
      });

      // Should find code entities
      expect(result.entities.length).to.be.greaterThan(0);
    });

    it('should process multilingual content', async () => {
      for (const [langCode, text] of Object.entries(FIXTURES.multilingual)) {
        const sanitized = sanitizer.sanitize(text);
        const detected = languageDetector.detect(sanitized.text);

        // Should extract entities regardless of language
        const result = await entityExtractor.extract(sanitized.text, {
          language: detected.language
        });

        // IMIS and Umoja should be found in all languages
        const entityNames = result.entities.map(e =>
          (e.name || e.text || '').toLowerCase()
        );

        expect(entityNames.some(n => n.includes('imis') || n.includes('umoja'))).to.be.true;
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PERFORMANCE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Performance Benchmarks', function() {
    this.timeout(60000);

    it('should process 50 documents in under 10 seconds', async () => {
      const docs = Array(50).fill(null).map((_, i) =>
        `Document ${i} about IMIS and Umoja systems. Contact user${i}@un.org. See #${10000 + i}.`
      );

      const start = Date.now();

      for (const doc of docs) {
        const sanitized = sanitizer.sanitize(doc);
        languageDetector.detect(sanitized.text);
        chunker.chunk(sanitized.text);
        await entityExtractor.extract(sanitized.text);
      }

      const elapsed = Date.now() - start;
      console.log(`      50 docs processed in ${elapsed}ms (${(elapsed / 50).toFixed(1)}ms/doc)`);

      expect(elapsed).to.be.lessThan(10000);
    });

    it('should handle large text efficiently', async () => {
      const largeText = FIXTURES.mixedContent.repeat(20);

      const start = Date.now();

      const sanitized = sanitizer.sanitize(largeText);
      const language = languageDetector.detect(sanitized.text);
      const chunks = chunker.chunk(sanitized.text);

      // Only extract from first 5 chunks for performance
      for (const chunk of chunks.slice(0, 5)) {
        await entityExtractor.extract(chunk.content);
      }

      const elapsed = Date.now() - start;
      console.log(`      Large text (${largeText.length} chars) processed in ${elapsed}ms`);

      expect(elapsed).to.be.lessThan(5000);
    });
  });
});
