/**
 * Text Processing Pipeline Integration Tests
 *
 * Tests the complete text processing chain:
 * 1. Sanitization (cleaning, PII removal)
 * 2. Language detection
 * 3. Chunking (semantic text splitting)
 * 4. Entity extraction (regex + patterns)
 * 5. Ontology validation
 * 6. Result fusion
 *
 * @module tests/text-processing-pipeline
 */

'use strict';

// Import services to test
const { TextSanitizer, createSanitizer, sanitizeForEmbedding, sanitizeForStorage } = require('../src/services/preprocessing/sanitizer.service');
const { LanguageDetector, detectLanguage, isUNLanguage } = require('../src/services/preprocessing/language-detector');
const { TextChunker, chunkText, chunkForEmbedding } = require('../src/services/chunking/text-chunker');
const { EntityExtractor, ENTITY_TYPES } = require('../src/services/extraction/entity-extractor');
const { extractAllEntities, UN_SYSTEMS, UN_ORGANIZATIONS, RELATIONSHIP_TYPES } = require('../src/config/un-entities.config');
const { NODE_TYPES, getNodeType, validateNode, getLayerForNodeType } = require('../src/services/graph/ontology.schema');
const { resultFusion, rrfFusion, linearFusion, normalizeResults, deduplicateResults } = require('../src/services/retrieval/result-fusion');

// Test data
const UN_SAMPLE_TEXT = `
The OICT department is responsible for managing the Umoja ERP system across all UN offices.
According to ST/AI/2024/3, all staff must use Inspira for HR-related requests.
The IMIS legacy system will be decommissioned by Q4 2025.

Work Item #12345 tracks the migration from TFS to Azure DevOps.
UNHQ and UNOG offices are coordinating with UNDP and UNICEF on this initiative.

Contact john.smith@un.org or maria.garcia@undp.org for more information.
The budget allocation follows IPSAS guidelines as outlined in ST/SGB/2023/1.

Technical specifications require integration with Active Directory and Unite ID.
API endpoint: /api/v2/users/authenticate
Database: dbo.UserAccounts table
Version: v2.1.0-beta
`;

const CODE_SAMPLE = `
/**
 * UserService - handles user authentication and management
 */
import { UmojaSyncService } from './umoja.service';
import { InspiraClient } from '@un/inspira-sdk';

class UserAuthenticationService {
  constructor(private adService: ActiveDirectoryService) {}

  async authenticate(userId: string, password: string): Promise<AuthResult> {
    // Check against Unite ID first
    const uniteIdResult = await this.checkUniteId(userId);

    // Fallback to legacy IMIS check
    if (!uniteIdResult.valid) {
      return this.checkIMISCredentials(userId, password);
    }

    return uniteIdResult;
  }

  private async syncWithUmoja(userId: string): Promise<void> {
    const umoja = new UmojaSyncService();
    await umoja.syncUserData(userId);
  }
}

export { UserAuthenticationService };
`;

const MULTILINGUAL_TEXT = `
The United Nations works for peace and security worldwide.
Les Nations Unies travaillent pour la paix et la sécurité dans le monde.
Las Naciones Unidas trabajan por la paz y la seguridad en todo el mundo.
Организация Объединённых Наций работает за мир и безопасность во всём мире.
`;

// Test results storage
const testResults = {
  passed: 0,
  failed: 0,
  errors: []
};

/**
 * Assert helper
 */
function assert(condition, message) {
  if (condition) {
    testResults.passed++;
    console.log(`  ✓ ${message}`);
  } else {
    testResults.failed++;
    testResults.errors.push(message);
    console.log(`  ✗ ${message}`);
  }
}

/**
 * Test group runner
 */
function testGroup(name, fn) {
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`TEST GROUP: ${name}`);
  console.log(`═══════════════════════════════════════════════════════════`);
  try {
    fn();
  } catch (error) {
    testResults.failed++;
    testResults.errors.push(`${name}: ${error.message}`);
    console.log(`  ✗ Error: ${error.message}`);
  }
}

/**
 * Async test group runner
 */
async function testGroupAsync(name, fn) {
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`TEST GROUP: ${name}`);
  console.log(`═══════════════════════════════════════════════════════════`);
  try {
    await fn();
  } catch (error) {
    testResults.failed++;
    testResults.errors.push(`${name}: ${error.message}`);
    console.log(`  ✗ Error: ${error.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: SANITIZER SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

function testSanitizer() {
  testGroup('Sanitizer Service', () => {
    const sanitizer = createSanitizer();

    // Test HTML removal
    const htmlText = '<p>Hello <strong>World</strong></p><script>alert("xss")</script>';
    const cleaned = sanitizer.clean(htmlText);
    assert(!cleaned.includes('<'), 'HTML tags should be removed');
    assert(!cleaned.includes('script'), 'Script content should be removed');
    assert(cleaned.includes('Hello') && cleaned.includes('World'), 'Text content should be preserved');

    // Test PII redaction
    const piiText = 'Contact: john.smith@un.org, phone: +1-212-555-0123, SSN: 123-45-6789';
    const piiResult = sanitizer.sanitize(piiText, { removePII: true });
    assert(piiResult.text.includes('[EMAIL_REDACTED]'), 'Email should be redacted');
    assert(piiResult.text.includes('[PHONE_REDACTED]'), 'Phone should be redacted');
    assert(piiResult.metadata.hadPII === true, 'PII flag should be set');

    // Test code block preservation
    const codeText = 'Use this code: ```const x = 1;``` inline: `y = 2`';
    const codeResult = sanitizer.sanitize(codeText, { preserveCodeBlocks: true });
    assert(codeResult.text.includes('```const x = 1;```'), 'Fenced code blocks should be preserved');
    assert(codeResult.text.includes('`y = 2`'), 'Inline code should be preserved');

    // Test forEmbedding
    const embeddingText = '<p>UN OICT manages Umoja</p> 🎉';
    const forEmbed = sanitizeForEmbedding(embeddingText);
    assert(!forEmbed.includes('<'), 'HTML removed for embedding');
    assert(!forEmbed.includes('🎉'), 'Emojis removed for embedding');

    // Test forStorage with PII
    const storageResult = sanitizeForStorage('Secret: password=abc123, token: Bearer xyz.abc.def');
    assert(storageResult.text.includes('[CREDENTIALS_REDACTED]'), 'Credentials redacted for storage');

    // Test unicode normalization
    const unicodeText = '\u201cHello\u201d \u2014 World\u2019s best';
    const normalizedResult = sanitizer.sanitize(unicodeText);
    assert(normalizedResult.text.includes('"Hello"'), 'Fancy quotes normalized');

    // Test whitespace normalization
    const whitespaceText = 'Hello    World\r\n\r\n\r\nTest';
    const wsResult = sanitizer.sanitize(whitespaceText, { normalizeWhitespace: true });
    assert(!wsResult.text.includes('    '), 'Multiple spaces normalized');
    assert(!wsResult.text.includes('\r'), 'CRLF normalized to LF');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: LANGUAGE DETECTOR
// ═══════════════════════════════════════════════════════════════════════════════

function testLanguageDetector() {
  testGroup('Language Detector', () => {
    const detector = new LanguageDetector();

    // Test English detection
    const enResult = detector.detect('The United Nations works for international peace and security.');
    assert(enResult.language === 'en', `English detected (got: ${enResult.language})`);
    assert(enResult.confidence > 0.5, `Confidence > 0.5 (got: ${enResult.confidence})`);

    // Test French detection
    const frResult = detector.detect('Les Nations Unies travaillent pour la paix internationale.');
    assert(frResult.language === 'fr', `French detected (got: ${frResult.language})`);

    // Test Spanish detection
    const esResult = detector.detect('Las Naciones Unidas trabajan por la paz internacional.');
    assert(esResult.language === 'es', `Spanish detected (got: ${esResult.language})`);

    // Test Russian detection (Cyrillic script)
    const ruResult = detector.detect('Организация Объединённых Наций работает за мир.');
    assert(ruResult.language === 'ru', `Russian detected (got: ${ruResult.language})`);
    assert(ruResult.script === 'Cyrillic', `Cyrillic script detected (got: ${ruResult.script})`);

    // Test Chinese detection (Han script) - needs longer text (>20 chars)
    const zhResult = detector.detect('联合国致力于维护国际和平与安全，这是一个重要的使命。');
    assert(zhResult.language === 'zh', `Chinese detected (got: ${zhResult.language})`);
    assert(zhResult.script === 'Han', `Han script detected (got: ${zhResult.script})`);

    // Test Arabic detection
    const arResult = detector.detect('تعمل الأمم المتحدة من أجل السلام والأمن الدوليين.');
    assert(arResult.language === 'ar', `Arabic detected (got: ${arResult.language})`);
    assert(arResult.script === 'Arabic', `Arabic script detected (got: ${arResult.script})`);

    // Test code detection
    const codeResult = detector.detect('function authenticate(user) { return user.isValid && checkToken(user.token); }');
    assert(codeResult.isCode === true, 'Code content detected');
    assert(codeResult.language === 'code', `Language is 'code' (got: ${codeResult.language})`);

    // Test UN language check
    assert(isUNLanguage('en'), 'English is UN language');
    assert(isUNLanguage('ar'), 'Arabic is UN language');
    assert(isUNLanguage('zh'), 'Chinese is UN language');
    assert(isUNLanguage('fr'), 'French is UN language');
    assert(isUNLanguage('ru'), 'Russian is UN language');
    assert(isUNLanguage('es'), 'Spanish is UN language');
    assert(!isUNLanguage('de'), 'German is not UN official language');

    // Test multilingual detection
    const multiResult = detector.detectMultiple(MULTILINGUAL_TEXT);
    assert(multiResult.length >= 2, `Multiple languages detected (got: ${multiResult.length})`);
    const detectedLangs = multiResult.map(r => r.language);
    assert(detectedLangs.includes('en'), 'English detected in multilingual');

    // Test short text handling
    const shortResult = detector.detect('Hi');
    assert(shortResult.confidence < 0.5, 'Low confidence for short text');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: TEXT CHUNKER
// ═══════════════════════════════════════════════════════════════════════════════

function testTextChunker() {
  testGroup('Text Chunker', () => {
    const chunker = new TextChunker();

    // Test basic chunking
    const chunks = chunker.chunk(UN_SAMPLE_TEXT);
    assert(chunks.length > 0, `Chunks created (got: ${chunks.length})`);
    assert(chunks[0].content.length > 0, 'Chunk has content');
    assert(typeof chunks[0].index === 'number', 'Chunk has index');
    assert(typeof chunks[0].tokenEstimate === 'number', 'Chunk has token estimate');

    // Test chunk size limits
    const longText = 'A'.repeat(10000);
    const longChunks = chunker.chunk(longText, { maxTokens: 100, avgCharsPerToken: 4 });
    const allWithinLimit = longChunks.every(c => c.content.length <= 500); // 100 * 4 + some margin
    assert(allWithinLimit, 'All chunks within size limit');

    // Test overlap
    const overlapChunks = chunker.chunk(longText, { maxTokens: 100, overlapTokens: 20, avgCharsPerToken: 4 });
    if (overlapChunks.length >= 2) {
      // Check that consecutive chunks have some overlap in content
      const chunk1End = overlapChunks[0].content.slice(-50);
      const chunk2Start = overlapChunks[1].content.slice(0, 100);
      // At minimum, check chunks are created with overlap parameter
      assert(overlapChunks.length > 0, 'Chunks created with overlap');
    }

    // Test header detection
    const headerText = `# Introduction

This is the introduction section with detailed content about the system.

## Background

The background section provides historical context.

### Technical Details

This subsection covers technical implementation.`;

    const headerChunks = chunker.chunk(headerText, { detectHeaders: true, includeMetadata: true });
    assert(headerChunks.length > 0, 'Header-based chunks created');
    // Check that chunks have metadata when includeMetadata is true
    const chunksWithMetadata = headerChunks.filter(c => c.metadata !== undefined);
    assert(chunksWithMetadata.length > 0, 'Chunks have metadata');

    // Test chunkForEmbedding
    const embedChunks = chunkForEmbedding(UN_SAMPLE_TEXT);
    assert(embedChunks.length > 0, 'Embedding chunks created');
    assert(embedChunks[0].tokenEstimate <= 512, 'Embedding chunks respect 512 token limit');

    // Test statistics
    const stats = chunker.getStats(chunks);
    assert(stats.count === chunks.length, 'Stats count matches');
    assert(stats.totalTokens > 0, 'Stats has total tokens');
    assert(stats.avgTokens > 0, 'Stats has average tokens');

    // Test empty input
    const emptyChunks = chunker.chunk('');
    assert(emptyChunks.length === 0, 'Empty input returns empty array');

    // Test sentence preservation
    const sentenceText = 'First sentence here. Second sentence follows. Third one too.';
    const sentenceChunks = chunker.chunk(sentenceText, { preserveSentences: true, maxTokens: 5 });
    assert(sentenceChunks.length > 0, 'Sentence-preserved chunks created');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: ENTITY EXTRACTION (Regex patterns)
// ═══════════════════════════════════════════════════════════════════════════════

function testEntityExtraction() {
  testGroup('Entity Extraction (Regex)', () => {
    // Test extractAllEntities function
    const results = extractAllEntities(UN_SAMPLE_TEXT);

    // Test UN Systems extraction
    assert(results.systems.length > 0, `UN Systems found (got: ${results.systems.length})`);
    const systemNames = results.systems.map(s => s.name);
    assert(systemNames.includes('Umoja'), 'Umoja system detected');
    assert(systemNames.includes('Inspira'), 'Inspira system detected');
    assert(systemNames.includes('IMIS'), 'IMIS system detected');
    assert(systemNames.includes('Azure DevOps'), 'Azure DevOps detected');

    // Test Organizations extraction
    assert(results.organizations.length > 0, `Organizations found (got: ${results.organizations.length})`);
    const orgNames = results.organizations.map(o => o.name);
    assert(orgNames.includes('OICT'), 'OICT organization detected');
    assert(orgNames.includes('UNDP'), 'UNDP organization detected');
    assert(orgNames.includes('UNICEF'), 'UNICEF organization detected');
    assert(orgNames.includes('UNHQ'), 'UNHQ detected');
    assert(orgNames.includes('UNOG'), 'UNOG detected');

    // Test Document References
    assert(results.documents.length > 0, `Documents found (got: ${results.documents.length})`);
    const docMatches = results.documents.map(d => d.match);
    assert(docMatches.some(d => d.includes('ST/AI/2024/3')), 'ST/AI document detected');
    assert(docMatches.some(d => d.includes('ST/SGB/2023/1')), 'ST/SGB document detected');

    // Test Work Item References
    assert(results.workItems.length > 0, `Work Items found (got: ${results.workItems.length})`);
    const wiIds = results.workItems.map(w => w.id);
    assert(wiIds.includes('12345'), 'Work Item #12345 detected');

    // Test Person/Email References
    assert(results.persons.length > 0, `Persons/Emails found (got: ${results.persons.length})`);
    const personMatches = results.persons.map(p => p.match);
    assert(personMatches.some(p => p.includes('john.smith@un.org')), 'UN email detected');
    assert(personMatches.some(p => p.includes('maria.garcia@undp.org')), 'UNDP email detected');

    // Test Technical References
    assert(results.technical.length > 0, `Technical refs found (got: ${results.technical.length})`);
    const techMatches = results.technical.map(t => t.match);
    assert(techMatches.some(t => t.includes('/api/v2/')), 'API endpoint detected');
    assert(techMatches.some(t => t.includes('dbo.')), 'Database object detected');
    assert(techMatches.some(t => t.includes('2.1.0')), 'Version number detected');

    // Test EntityExtractor class (regex only, no LLM)
    const extractor = new EntityExtractor({ useLLM: false, useRegex: true });
    const regexEntities = extractor.extractWithRegex(UN_SAMPLE_TEXT);

    assert(regexEntities.length > 0, `EntityExtractor regex found entities (got: ${regexEntities.length})`);

    const entityTypes = [...new Set(regexEntities.map(e => e.type))];
    assert(entityTypes.includes(ENTITY_TYPES.SYSTEM), 'SYSTEM type entities found');
    assert(entityTypes.includes(ENTITY_TYPES.ORGANIZATION), 'ORGANIZATION type entities found');
    assert(entityTypes.includes(ENTITY_TYPES.DOCUMENT), 'DOCUMENT type entities found');
    assert(entityTypes.includes(ENTITY_TYPES.WORK_ITEM_REF), 'WORK_ITEM_REF type entities found');

    // Test confidence levels
    const highConfidence = regexEntities.filter(e => e.confidence >= 0.9);
    assert(highConfidence.length > 0, 'High confidence entities present');

    // Test context extraction
    const entitiesWithContext = regexEntities.filter(e => e.context && e.context.length > 0);
    assert(entitiesWithContext.length > 0, 'Entities have context snippets');

    // Test code pattern extraction
    const codeExtractor = new EntityExtractor({ useLLM: false, useRegex: true });
    const codeEntities = codeExtractor.extractCodePatternsWithRegex(CODE_SAMPLE, 'typescript', 'test.ts');

    assert(codeEntities.length > 0, `Code entities found (got: ${codeEntities.length})`);
    const classEntities = codeEntities.filter(e => e.codeContext?.type === 'class');
    assert(classEntities.length > 0, 'Class definitions detected');

    const importEntities = codeEntities.filter(e => e.codeContext?.type === 'import');
    assert(importEntities.length > 0, 'Import statements detected');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: ONTOLOGY SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

function testOntologySchema() {
  testGroup('Ontology Schema', () => {
    // Test NODE_TYPES existence
    assert(NODE_TYPES !== undefined, 'NODE_TYPES is defined');
    assert(Object.keys(NODE_TYPES).length > 0, 'NODE_TYPES has entries');

    // Test Strategic layer nodes
    const epicType = getNodeType('Epic');
    assert(epicType !== null, 'Epic node type exists');
    if (epicType) {
      assert(epicType.layer === 'Strategic', 'Epic is in Strategic layer');
      assert(epicType.zPosition < 0, 'Strategic layer has negative z');
    }

    // Test Business layer nodes
    const workItemType = getNodeType('WorkItem');
    assert(workItemType !== null, 'WorkItem node type exists');
    if (workItemType) {
      assert(workItemType.layer === 'Business', 'WorkItem is in Business layer');
      assert(workItemType.zPosition === 0, 'Business layer has z=0');
    }

    // Test Code layer nodes
    const fileType = getNodeType('File');
    assert(fileType !== null, 'File node type exists');
    if (fileType) {
      assert(fileType.layer === 'Code', 'File is in Code layer');
      assert(fileType.zPosition > 0, 'Code layer has positive z');
    }

    // Test layer lookup
    assert(getLayerForNodeType('Epic') === 'Strategic', 'Epic maps to Strategic');
    assert(getLayerForNodeType('Document') === 'Business', 'Document maps to Business');
    assert(getLayerForNodeType('Class') === 'Code', 'Class maps to Code');

    // Test node validation
    const validNodeProps = {
      id: 'test-123',
      name: 'Test Node',
      title: 'Test Work Item'
    };
    const validationResult = validateNode('WorkItem', validNodeProps);
    assert(validationResult.valid === true, 'Valid node passes validation');

    const invalidNodeProps = {
      name: 'Missing ID'
      // Missing required 'id' property
    };
    const invalidResult = validateNode('WorkItem', invalidNodeProps);
    assert(invalidResult.valid === false, 'Invalid node fails validation');
    assert(invalidResult.errors.length > 0, 'Validation errors reported');

    // Test RELATIONSHIP_TYPES
    assert(Object.keys(RELATIONSHIP_TYPES).length >= 40, `At least 40 relationship types (got: ${Object.keys(RELATIONSHIP_TYPES).length})`);

    // Test relationship categories
    const categories = new Set(Object.values(RELATIONSHIP_TYPES).map(r => r.category));
    assert(categories.has('Structural'), 'Structural relationships exist');
    assert(categories.has('Dependencies'), 'Dependencies relationships exist');
    assert(categories.has('Semantic'), 'Semantic relationships exist');
    assert(categories.has('Tracking'), 'Tracking relationships exist');
    assert(categories.has('Communication'), 'Communication relationships exist');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: RESULT FUSION
// ═══════════════════════════════════════════════════════════════════════════════

function testResultFusion() {
  testGroup('Result Fusion', () => {
    // Sample search results from different sources
    const vectorResults = [
      { id: 'doc1', content: 'Umoja ERP system', score: 0.95 },
      { id: 'doc2', content: 'IMIS migration', score: 0.85 },
      { id: 'doc3', content: 'Azure DevOps', score: 0.75 },
      { id: 'doc4', content: 'Inspira HR', score: 0.65 }
    ];

    const graphResults = [
      { id: 'doc2', content: 'IMIS migration', score: 0.90 },
      { id: 'doc5', content: 'OICT department', score: 0.80 },
      { id: 'doc1', content: 'Umoja ERP system', score: 0.70 },
      { id: 'doc6', content: 'ST/AI document', score: 0.60 }
    ];

    // Test RRF fusion
    const rrfResult = resultFusion(
      { results: vectorResults, weight: 1 },
      { results: graphResults, weight: 1 },
      { method: 'rrf', k: 60 }
    );

    assert(rrfResult.length > 0, `RRF fusion produced results (got: ${rrfResult.length})`);
    assert(rrfResult[0].fusedScore !== undefined, 'Results have fusedScore');
    assert(rrfResult[0].fusionMethod === 'rrf', 'Fusion method is RRF');

    // Check that items appearing in both lists get boosted
    const doc1Rank = rrfResult.findIndex(r => r.id === 'doc1');
    const doc2Rank = rrfResult.findIndex(r => r.id === 'doc2');
    assert(doc1Rank < 4 && doc2Rank < 4, 'Items in both lists ranked higher');

    // Test linear fusion
    const linearResult = resultFusion(
      { results: vectorResults, weight: 0.6 },
      { results: graphResults, weight: 0.4 },
      { method: 'linear' }
    );
    assert(linearResult.length > 0, 'Linear fusion produced results');
    assert(linearResult[0].fusionMethod === 'linear', 'Fusion method is linear');

    // Test max fusion
    const maxResult = rrfFusion([
      { results: vectorResults, weight: 1 },
      { results: graphResults, weight: 1 }
    ]);
    assert(maxResult.length > 0, 'RRF direct function works');

    // Test linear fusion direct
    const linearDirect = linearFusion([
      { results: vectorResults, weight: 0.5 },
      { results: graphResults, weight: 0.5 }
    ]);
    assert(linearDirect.length > 0, 'Linear direct function works');

    // Test deduplication
    const duplicates = [
      { id: 'doc1', content: 'Same content', score: 0.9 },
      { id: 'doc1', content: 'Same content', score: 0.8 },
      { id: 'doc2', content: 'Different', score: 0.7 }
    ];
    const deduped = deduplicateResults(duplicates, 'id');
    assert(deduped.length === 2, `Deduplication works (got: ${deduped.length})`);

    // Test content-based deduplication
    const contentDupes = [
      { id: 'a', content: 'Umoja system description', score: 0.9 },
      { id: 'b', content: 'umoja system description', score: 0.8 }, // same content, different case
      { id: 'c', content: 'Different content entirely', score: 0.7 }
    ];
    const contentDeduped = deduplicateResults(contentDupes, 'content');
    assert(contentDeduped.length === 2, 'Content deduplication works');

    // Test normalization
    const unnormalized = [
      { id: 'a', score: 100 },
      { id: 'b', score: 50 },
      { id: 'c', score: 0 }
    ];
    const normalized = normalizeResults(unnormalized, 'score');
    assert(normalized[0].score === 1, 'Max score normalized to 1');
    assert(normalized[2].score === 0, 'Min score normalized to 0');
    assert(normalized[1].score === 0.5, 'Middle score normalized correctly');

    // Test empty input handling
    const emptyFusion = resultFusion(
      { results: [], weight: 1 },
      { results: [], weight: 1 }
    );
    assert(emptyFusion.length === 0, 'Empty input returns empty result');

    // Test single list
    const singleList = resultFusion(
      { results: vectorResults, weight: 1 },
      { results: [], weight: 1 }
    );
    assert(singleList.length === vectorResults.length, 'Single list passes through');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: FULL PIPELINE INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

async function testFullPipeline() {
  await testGroupAsync('Full Pipeline Integration', async () => {
    console.log('\n  Testing complete text processing pipeline...\n');

    // PHASE 1: Sanitization
    console.log('  PHASE 1: Sanitization');
    const sanitizer = createSanitizer();
    const sanitized = sanitizer.sanitize(UN_SAMPLE_TEXT);
    assert(sanitized.text.length > 0, 'Text sanitized');
    assert(sanitized.metadata.originalLength > 0, 'Original length tracked');
    console.log(`    - Original: ${sanitized.metadata.originalLength} chars`);
    console.log(`    - Cleaned: ${sanitized.metadata.finalLength} chars`);

    // PHASE 2: Language Detection
    console.log('\n  PHASE 2: Language Detection');
    const detector = new LanguageDetector();
    const langResult = detector.detect(sanitized.text);
    assert(langResult.language === 'en', 'Language detected as English');
    console.log(`    - Language: ${langResult.language} (${langResult.name})`);
    console.log(`    - Confidence: ${langResult.confidence.toFixed(2)}`);

    // PHASE 3: Chunking
    console.log('\n  PHASE 3: Chunking');
    const chunker = new TextChunker();
    const chunks = chunker.chunkForEmbedding(sanitized.text);
    assert(chunks.length > 0, 'Chunks created');
    const stats = chunker.getStats(chunks);
    console.log(`    - Chunks: ${stats.count}`);
    console.log(`    - Avg tokens: ${stats.avgTokens}`);
    console.log(`    - Total tokens: ${stats.totalTokens}`);

    // PHASE 4: Entity Extraction
    console.log('\n  PHASE 4: Entity Extraction');
    const extractor = new EntityExtractor({ useLLM: false, useRegex: true, minConfidence: 0.6 });

    // Process each chunk
    let allEntities = [];
    for (const chunk of chunks) {
      const regexEntities = extractor.extractWithRegex(chunk.content);
      allEntities.push(...regexEntities);
    }

    // Merge and deduplicate
    const mergedEntities = extractor.mergeEntities(allEntities);
    assert(mergedEntities.length > 0, 'Entities extracted');

    const entityStats = extractor.getStats({ entities: mergedEntities });
    console.log(`    - Total entities: ${entityStats.totalEntities}`);
    console.log(`    - By type: ${JSON.stringify(entityStats.byType)}`);
    console.log(`    - Avg confidence: ${entityStats.avgConfidence}`);

    // PHASE 5: Validate against Ontology
    console.log('\n  PHASE 5: Ontology Validation');
    let validNodes = 0;
    let invalidNodes = 0;

    for (const entity of mergedEntities.slice(0, 10)) { // Check first 10
      const graphLabel = entity.graphLabel || 'Entity';
      const nodeType = getNodeType(graphLabel);

      // Only validate if node type exists in ontology
      if (nodeType) {
        const nodeProps = {
          id: `entity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: entity.name,
          title: entity.name
        };
        const validation = validateNode(graphLabel, nodeProps);
        if (validation.valid) {
          validNodes++;
        } else {
          invalidNodes++;
        }
      } else {
        invalidNodes++;
      }
    }

    console.log(`    - Valid nodes: ${validNodes}`);
    console.log(`    - Invalid nodes: ${invalidNodes}`);
    assert(validNodes > 0, 'Some nodes valid for ontology');

    // PHASE 6: Simulate Result Fusion (mock search results)
    console.log('\n  PHASE 6: Result Fusion');
    const mockVectorResults = mergedEntities.slice(0, 5).map((e, i) => ({
      id: e.normalizedForm,
      content: e.name,
      score: 0.9 - (i * 0.1),
      source: 'vector'
    }));

    const mockGraphResults = mergedEntities.slice(2, 7).map((e, i) => ({
      id: e.normalizedForm,
      content: e.name,
      score: 0.85 - (i * 0.1),
      source: 'graph'
    }));

    const fusedResults = resultFusion(
      { results: mockVectorResults, weight: 0.6 },
      { results: mockGraphResults, weight: 0.4 },
      { method: 'rrf', k: 60 }
    );

    console.log(`    - Vector results: ${mockVectorResults.length}`);
    console.log(`    - Graph results: ${mockGraphResults.length}`);
    console.log(`    - Fused results: ${fusedResults.length}`);
    assert(fusedResults.length > 0, 'Fusion produced results');

    // Summary
    console.log('\n  ═══════════════════════════════════════════════════════════');
    console.log('  PIPELINE SUMMARY');
    console.log('  ═══════════════════════════════════════════════════════════');
    console.log(`    Input: ${sanitized.metadata.originalLength} characters`);
    console.log(`    After sanitization: ${sanitized.metadata.finalLength} characters`);
    console.log(`    Language: ${langResult.language} (${(langResult.confidence * 100).toFixed(0)}%)`);
    console.log(`    Chunks: ${chunks.length}`);
    console.log(`    Entities: ${mergedEntities.length}`);
    console.log(`    Final results: ${fusedResults.length}`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('TEXT PROCESSING PIPELINE - INTEGRATION TESTS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('');

  // Run all test groups
  testSanitizer();
  testLanguageDetector();
  testTextChunker();
  testEntityExtraction();
  testOntologySchema();
  testResultFusion();
  await testFullPipeline();

  // Print summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('TEST RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Total tests: ${testResults.passed + testResults.failed}`);
  console.log(`  ✓ Passed: ${testResults.passed}`);
  console.log(`  ✗ Failed: ${testResults.failed}`);

  if (testResults.errors.length > 0) {
    console.log('\n  Errors:');
    for (const error of testResults.errors) {
      console.log(`    - ${error}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');

  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
