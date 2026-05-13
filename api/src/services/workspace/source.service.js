/**
 * Source Service — Extended source management for WorkSpace
 *
 * Handles file upload, URL fetching, text sources, analysis,
 * rich metadata collection, duplicate detection, and extraction orchestration.
 *
 * Storage: Artefacts/Sources/{workspaceId}/DOCS/
 *
 * @module services/workspace/source.service
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOG_PREFIX = '[SourceService]';

// Source types
const SOURCE_TYPES = {
  FILE: 'FILE',
  URL: 'URL',
  TEXT: 'TEXT',
  DATABASE: 'DATABASE',
  API: 'API',
  FILESYSTEM: 'FILESYSTEM'
};

// Document types (UN context)
const DOCUMENT_TYPES = [
  'SOP',              // Standard Operating Procedure
  'POLICY',           // Policy document
  'REGULATION',       // Regulatory document
  'TECHNICAL_SPEC',   // Technical specification
  'API_SPEC',         // API specification (OpenAPI, etc.)
  'USER_GUIDE',       // User manual / guide
  'REPORT',           // Report / analysis
  'FORM',             // Form template
  'CORRESPONDENCE',   // Email / memo / letter
  'CONTRACT',         // Contract / agreement
  'DATABASE_SCHEMA',  // Database schema export
  'CODE',             // Source code
  'SPREADSHEET',      // Data in tabular format
  'PRESENTATION',     // Slides / presentation
  'MEETING_NOTES',    // Meeting notes / minutes
  'UNKNOWN'           // Not yet classified
];

// File storage root
const ARTEFACTS_ROOT = path.resolve(process.cwd(), 'Artefacts', 'Sources');

// Lazy deps
let _memgraph = null;
let _llm = null;
let _tei = null;
let _qdrant = null;

function mg() {
  if (!_memgraph) _memgraph = require('../memgraph.service');
  return _memgraph;
}

function llm() {
  if (!_llm) {
    const { getInstance: getLLMProvider } = require('../llm/LLMProviderService');
    _llm = getLLMProvider();
  }
  return _llm;
}

function tei() {
  if (!_tei) _tei = require('../tei.service');
  return _tei;
}

function qdrant() {
  if (!_qdrant) _qdrant = require('../qdrant.service');
  return _qdrant;
}

class SourceService {

  // ==================== CREATE SOURCES ====================

  /**
   * Create a source from file upload
   * @param {string} workspaceId
   * @param {Object} file - Multer file object {originalname, mimetype, size, buffer/path}
   * @param {Object} meta - Additional metadata
   * @returns {Promise<Object>}
   */
  async createFileSource(workspaceId, file, meta = {}) {
    const sourceId = uuidv4();

    // Save file to storage
    const storagePath = this._getStoragePath(workspaceId);
    this._ensureDir(storagePath);
    const safeFilename = `${sourceId}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(storagePath, safeFilename);

    if (file.buffer) {
      fs.writeFileSync(filePath, file.buffer);
    } else if (file.path) {
      fs.copyFileSync(file.path, filePath);
    }

    // Compute content hash for duplicate detection
    const fileBuffer = fs.readFileSync(filePath);
    const contentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    const sizeBytes = file.size || fileBuffer.length;

    return this._createSourceNode(workspaceId, {
      id: sourceId,
      sourceType: SOURCE_TYPES.FILE,
      filename: file.originalname,
      mimeType: file.mimetype || 'application/octet-stream',
      sizeBytes,
      uri: '',
      storagePath: filePath,
      contentHash,
      textContent: '',
      url: '',
      ...meta
    });
  }

  /**
   * Create a source from URL
   * @param {string} workspaceId
   * @param {Object} params
   * @param {string} params.url
   * @param {string} [params.title]
   * @param {string} [params.description]
   * @returns {Promise<Object>}
   */
  async createUrlSource(workspaceId, { url, title = '', description = '' }) {
    if (!url) throw new Error('URL is required');

    const sourceId = uuidv4();
    const contentHash = crypto.createHash('sha256').update(url).digest('hex');

    return this._createSourceNode(workspaceId, {
      id: sourceId,
      sourceType: SOURCE_TYPES.URL,
      filename: title || url,
      mimeType: 'text/html',
      sizeBytes: 0,
      uri: url,
      url,
      storagePath: '',
      contentHash,
      textContent: '',
      description
    });
  }

  /**
   * Create a source from raw text
   * @param {string} workspaceId
   * @param {Object} params
   * @param {string} params.text
   * @param {string} [params.title]
   * @param {string} [params.description]
   * @returns {Promise<Object>}
   */
  async createTextSource(workspaceId, { text, title = 'Text Input', description = '' }) {
    if (!text || !text.trim()) throw new Error('Text content is required');

    const sourceId = uuidv4();
    const contentHash = crypto.createHash('sha256').update(text).digest('hex');

    // Save text to file for consistency
    const storagePath = this._getStoragePath(workspaceId);
    this._ensureDir(storagePath);
    const filePath = path.join(storagePath, `${sourceId}_text.txt`);
    fs.writeFileSync(filePath, text, 'utf-8');

    return this._createSourceNode(workspaceId, {
      id: sourceId,
      sourceType: SOURCE_TYPES.TEXT,
      filename: title,
      mimeType: 'text/plain',
      sizeBytes: Buffer.byteLength(text, 'utf-8'),
      uri: '',
      url: '',
      storagePath: filePath,
      contentHash,
      textContent: text.substring(0, 5000), // Store first 5000 chars in node
      description
    });
  }

  // ==================== ANALYSIS ====================

  /**
   * Analyze source — generate description, detect document type, check duplicates
   * @param {string} workspaceId
   * @param {string} sourceId
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeSource(workspaceId, sourceId) {
    const source = await this.getSource(workspaceId, sourceId);
    if (!source) throw new Error(`Source not found: ${sourceId}`);

    const analysisLog = [];
    const now = new Date().toISOString();
    analysisLog.push({ timestamp: now, step: 'ANALYSIS_START', message: 'Starting source analysis' });

    // 1. Get text content
    let textContent = '';
    try {
      textContent = await this._extractText(source);
      analysisLog.push({ timestamp: new Date().toISOString(), step: 'TEXT_EXTRACTED', message: `Extracted ${textContent.length} chars` });
    } catch (err) {
      analysisLog.push({ timestamp: new Date().toISOString(), step: 'TEXT_EXTRACT_ERROR', message: err.message });
    }

    // 2. Generate summary via LLM
    let summary = '';
    let documentType = 'UNKNOWN';
    let language = 'en';
    let keywords = [];

    if (textContent.length > 50) {
      try {
        const analysisPrompt = `Analyze this document and respond in JSON format:
{
  "summary": "2-3 sentence description of what this document contains",
  "documentType": "one of: SOP, POLICY, REGULATION, TECHNICAL_SPEC, API_SPEC, USER_GUIDE, REPORT, FORM, CORRESPONDENCE, CONTRACT, DATABASE_SCHEMA, CODE, SPREADSHEET, PRESENTATION, MEETING_NOTES, UNKNOWN",
  "language": "ISO 639-1 code (e.g., en, fr, es, ru, ar, zh)",
  "keywords": ["up to 10 key terms from the document"],
  "domain": "primary knowledge domain (e.g., HR, IT, FINANCE, LEGAL, PROCUREMENT)",
  "complexity": "LOW, MEDIUM, or HIGH based on document structure and content"
}

Document content (first 3000 characters):
${textContent.substring(0, 3000)}`;

        const llmResponse = await llm().chat([{ role: 'user', content: analysisPrompt }], {
          temperature: 0.1,
          maxTokens: 500
        });

        const rawLlmContent = llmResponse?.content;
        const responseText = typeof llmResponse === 'string'
          ? llmResponse
          : Array.isArray(rawLlmContent)
            ? rawLlmContent.filter(b => b.type === 'text').map(b => b.text).join('')
            : (rawLlmContent || llmResponse?.text || '');
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          summary = parsed.summary || '';
          documentType = DOCUMENT_TYPES.includes(parsed.documentType) ? parsed.documentType : 'UNKNOWN';
          language = parsed.language || 'en';
          keywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];

          analysisLog.push({
            timestamp: new Date().toISOString(),
            step: 'LLM_ANALYSIS',
            message: `Type: ${documentType}, Language: ${language}, Keywords: ${keywords.length}`
          });

          // Update additional fields from analysis
          if (parsed.domain || parsed.complexity) {
            await this._updateSourceFields(workspaceId, sourceId, {
              domain: parsed.domain || '',
              complexity: parsed.complexity || 'MEDIUM'
            });
          }
        }
      } catch (err) {
        analysisLog.push({ timestamp: new Date().toISOString(), step: 'LLM_ERROR', message: err.message });
      }
    }

    // 3. Check for duplicates via content hash
    let duplicateOf = null;
    try {
      const dupes = await mg().runQuery(
        `MATCH (s:SourceReference)
         WHERE s.contentHash = $hash AND s.id <> $sourceId
         RETURN s.id as id, s.filename as filename, s.workspaceId as workspaceId
         LIMIT 5`,
        { hash: source.contentHash, sourceId }
      );
      if (dupes.length > 0) {
        duplicateOf = dupes.map(d => ({ id: d.id, filename: d.filename, workspaceId: d.workspaceId }));
        analysisLog.push({
          timestamp: new Date().toISOString(),
          step: 'DUPLICATE_CHECK',
          message: `Found ${dupes.length} potential duplicate(s)`
        });
      } else {
        analysisLog.push({ timestamp: new Date().toISOString(), step: 'DUPLICATE_CHECK', message: 'No duplicates found' });
      }
    } catch (err) {
      analysisLog.push({ timestamp: new Date().toISOString(), step: 'DUPLICATE_ERROR', message: err.message });
    }

    // 4. Generate embedding for semantic duplicate detection
    try {
      if (textContent.length > 20) {
        const embedding = await tei().getEmbedding(textContent.substring(0, 2000));
        await qdrant().workspaceUpsert(workspaceId, [{
          id: sourceId,
          vector: embedding,
          payload: {
            type: 'source',
            sourceId,
            filename: source.filename,
            documentType,
            status: 'ANALYZED'
          }
        }]);
        analysisLog.push({ timestamp: new Date().toISOString(), step: 'EMBEDDING', message: 'Source embedded in Qdrant' });
      }
    } catch (err) {
      analysisLog.push({ timestamp: new Date().toISOString(), step: 'EMBEDDING_ERROR', message: err.message });
    }

    analysisLog.push({ timestamp: new Date().toISOString(), step: 'ANALYSIS_COMPLETE', message: 'Analysis finished' });

    // 5. Update source with analysis results
    const updateParams = {
      summary,
      documentType,
      language,
      keywords: JSON.stringify(keywords),
      duplicateOf: duplicateOf ? JSON.stringify(duplicateOf) : '',
      analysisLog: JSON.stringify(analysisLog),
      status: 'ANALYZED',
      analyzedAt: new Date().toISOString()
    };

    await this._updateSourceFields(workspaceId, sourceId, updateParams);

    console.log(`${LOG_PREFIX} Analyzed source ${sourceId}: type=${documentType}, summary=${summary.substring(0, 50)}...`);

    return {
      sourceId,
      summary,
      documentType,
      language,
      keywords,
      duplicateOf,
      analysisLog
    };
  }

  // ==================== QUERIES ====================

  /**
   * Get source with full details
   */
  async getSource(workspaceId, sourceId) {
    const result = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:HAS_SOURCE]->(s:SourceReference {id: $sourceId})
       RETURN s`,
      { wsId: workspaceId, sourceId }
    );
    if (!result || result.length === 0) return null;
    return this._nodeToSource(result[0]);
  }

  /**
   * Get source with extraction results (entities, graphs found)
   */
  async getSourceWithResults(workspaceId, sourceId) {
    const source = await this.getSource(workspaceId, sourceId);
    if (!source) return null;

    // Get drafts extracted from this source
    const drafts = await mg().runQuery(
      `MATCH (d)-[:EXTRACTED_FROM]->(s:SourceReference {id: $sourceId})
       WHERE d.workspaceId = $wsId
       RETURN d ORDER BY d.extractedAt DESC`,
      { sourceId, wsId: workspaceId }
    );

    // Get extraction log and chat history
    const extractionData = await mg().runQuery(
      `MATCH (s:SourceReference {id: $sourceId})
       RETURN s.extractionLog as extractionLog, s.chatHistory as chatHistory`,
      { sourceId }
    );

    return {
      ...source,
      extractedEntities: drafts.map(r => {
        const d = r.d?.properties || r.d || r;
        return { id: d.id, type: d.type, name: d.name, status: d.status, confidence: d.confidence };
      }),
      extractionLog: this._parseJson(extractionData[0]?.extractionLog),
      chatHistory: this._parseJson(extractionData[0]?.chatHistory)
    };
  }

  /**
   * List sources with richer data
   */
  async listSources(workspaceId) {
    const result = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $id})-[:HAS_SOURCE]->(s:SourceReference)
       RETURN s ORDER BY s.uploadedAt DESC`,
      { id: workspaceId }
    );
    return result.map(r => this._nodeToSource(r));
  }

  /**
   * Update source status
   */
  async updateSourceStatus(workspaceId, sourceId, status) {
    await this._updateSourceFields(workspaceId, sourceId, {
      status,
      updatedAt: new Date().toISOString()
    });
    return this.getSource(workspaceId, sourceId);
  }

  /**
   * Append to extraction log
   */
  async appendExtractionLog(workspaceId, sourceId, entry) {
    const source = await this.getSource(workspaceId, sourceId);
    if (!source) throw new Error(`Source not found: ${sourceId}`);

    const currentLog = this._parseJson(source.extractionLog) || [];
    currentLog.push({ timestamp: new Date().toISOString(), ...entry });

    await this._updateSourceFields(workspaceId, sourceId, {
      extractionLog: JSON.stringify(currentLog)
    });
  }

  /**
   * Append to chat history
   */
  async appendChatHistory(workspaceId, sourceId, message) {
    const source = await this.getSource(workspaceId, sourceId);
    if (!source) throw new Error(`Source not found: ${sourceId}`);

    const currentHistory = this._parseJson(source.chatHistory) || [];
    currentHistory.push({ timestamp: new Date().toISOString(), ...message });

    await this._updateSourceFields(workspaceId, sourceId, {
      chatHistory: JSON.stringify(currentHistory)
    });
  }

  /**
   * Delete source + file
   */
  async deleteSource(workspaceId, sourceId) {
    const source = await this.getSource(workspaceId, sourceId);

    // Delete file if exists
    if (source?.storagePath && fs.existsSync(source.storagePath)) {
      fs.unlinkSync(source.storagePath);
    }

    // Drop linked v2 DataSource record (best-effort, non-blocking)
    if (source?.dataSourceGraphId) {
      try {
        const wsDsService = require('./workspace-datasource.service');
        await wsDsService.unregisterSourceDataSource(workspaceId, sourceId);
      } catch (err) {
        console.warn(`${LOG_PREFIX} unregister DataSource failed for ${sourceId}: ${err.message}`);
      }
    }

    await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[r:HAS_SOURCE]->(s:SourceReference {id: $sourceId})
       OPTIONAL MATCH (d)-[r2:EXTRACTED_FROM]->(s)
       DELETE r2, r, s
       WITH w
       SET w.sourceCount = CASE WHEN w.sourceCount > 0 THEN w.sourceCount - 1 ELSE 0 END`,
      { wsId: workspaceId, sourceId }
    );
  }

  // ==================== PRIVATE ====================

  /**
   * Create SourceReference node with full metadata
   * @private
   */
  async _createSourceNode(workspaceId, fields) {
    const now = new Date().toISOString();

    const params = {
      wsId: workspaceId,
      id: fields.id,
      workspaceId,
      sourceType: fields.sourceType,
      filename: fields.filename,
      mimeType: fields.mimeType,
      sizeBytes: fields.sizeBytes || 0,
      uri: fields.uri || '',
      url: fields.url || '',
      storagePath: fields.storagePath || '',
      contentHash: fields.contentHash || '',
      textContent: fields.textContent || '',
      summary: fields.summary || '',
      description: fields.description || '',
      documentType: fields.documentType || 'UNKNOWN',
      language: '',
      domain: '',
      complexity: '',
      keywords: '[]',
      duplicateOf: '',
      analysisLog: '[]',
      extractionLog: '[]',
      chatHistory: '[]',
      status: 'PENDING',
      uploadedAt: now,
      analyzedAt: '',
      extractedAt: '',
      updatedAt: now
    };

    await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})
       CREATE (s:SourceReference {
         id: $id,
         workspaceId: $workspaceId,
         sourceType: $sourceType,
         filename: $filename,
         mimeType: $mimeType,
         sizeBytes: $sizeBytes,
         uri: $uri,
         url: $url,
         storagePath: $storagePath,
         contentHash: $contentHash,
         textContent: $textContent,
         summary: $summary,
         description: $description,
         documentType: $documentType,
         language: $language,
         domain: $domain,
         complexity: $complexity,
         keywords: $keywords,
         duplicateOf: $duplicateOf,
         analysisLog: $analysisLog,
         extractionLog: $extractionLog,
         chatHistory: $chatHistory,
         status: $status,
         uploadedAt: $uploadedAt,
         analyzedAt: $analyzedAt,
         extractedAt: $extractedAt,
         updatedAt: $updatedAt
       })
       CREATE (w)-[:HAS_SOURCE]->(s)
       SET w.sourceCount = w.sourceCount + 1, w.updatedAt = $uploadedAt
       RETURN s`,
      params
    );

    // Check for auto-transition CREATED → PROFILING
    const workspace = await mg().runQuery(
      'MATCH (w:WorkSpace {id: $id}) RETURN w.status as status',
      { id: workspaceId }
    );
    if (workspace[0]?.status === 'CREATED') {
      try {
        const wsService = require('./workspace.service');
        await wsService.updateStatus(workspaceId, 'PROFILING');
      } catch (err) {
        console.warn(`${LOG_PREFIX} Auto-transition to PROFILING failed: ${err.message}`);
      }
    }

    // Check duplicate
    const dupes = await mg().runQuery(
      `MATCH (s:SourceReference)
       WHERE s.contentHash = $hash AND s.id <> $id
       RETURN s.id as id, s.filename as filename LIMIT 3`,
      { hash: params.contentHash, id: params.id }
    );

    const result = { ...params, keywords: [], duplicateOf: null, analysisLog: [], extractionLog: [], chatHistory: [] };
    if (dupes.length > 0) {
      result.duplicateWarning = `Potential duplicate of: ${dupes.map(d => d.filename).join(', ')}`;
    }

    console.log(`${LOG_PREFIX} Created ${params.sourceType} source "${params.filename}" in workspace ${workspaceId}`);
    return result;
  }

  /**
   * Update specific fields on source node
   * @private
   */
  async _updateSourceFields(workspaceId, sourceId, fields) {
    const setClauses = [];
    const params = { wsId: workspaceId, sourceId };

    for (const [key, value] of Object.entries(fields)) {
      setClauses.push(`s.${key} = $f_${key}`);
      params[`f_${key}`] = value;
    }

    if (setClauses.length === 0) return;

    await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:HAS_SOURCE]->(s:SourceReference {id: $sourceId})
       SET ${setClauses.join(', ')}`,
      params
    );
  }

  /**
   * Extract text content from source using format-specific extractors
   * Supports: PDF, DOCX, XLSX/XLS/CSV, TXT/MD/JSON/XML, HTML, code files
   * @private
   */
  async _extractText(source) {
    // If text content was provided directly (TEXT source type)
    if (source.textContent && source.textContent.length > 0) {
      return source.textContent;
    }

    // File-based extraction using unified extractor
    if (source.storagePath && fs.existsSync(source.storagePath)) {
      const { extractText } = require('./extractors');
      const result = await extractText(source.storagePath, source.mimeType);

      if (result.success) {
        // Store extraction metadata on source
        if (result.metadata || result.structure) {
          try {
            await this._updateSourceFields(source.workspaceId, source.id, {
              extractionMetadata: JSON.stringify({
                charCount: result.charCount,
                wordCount: result.wordCount,
                format: result.metadata?.format,
                pageCount: result.metadata?.pageCount,
                sheetCount: result.metadata?.sheetCount,
                headingCount: result.structure?.headings?.length || 0,
                sectionCount: result.structure?.sections?.length || 0
              })
            });
          } catch { /* best-effort metadata save */ }
        }
        return result.text;
      } else {
        console.warn(`${LOG_PREFIX} Extraction failed for ${source.storagePath}: ${result.error}`);
        return '';
      }
    }

    // URL source — placeholder for future web scraping
    if (source.url) {
      return `URL source: ${source.url}`;
    }

    return '';
  }

  /**
   * Get storage path for workspace files
   * @private
   */
  _getStoragePath(workspaceId) {
    return path.join(ARTEFACTS_ROOT, workspaceId, 'DOCS');
  }

  /**
   * Ensure directory exists
   * @private
   */
  _ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Parse JSON safely
   * @private
   */
  _parseJson(str) {
    if (!str) return null;
    if (typeof str !== 'string') return str;
    try { return JSON.parse(str); } catch { return null; }
  }

  /**
   * Convert Memgraph node to source object
   * @private
   */
  _nodeToSource(record) {
    const props = record.s?.properties || record.s || record;
    return {
      ...props,
      keywords: this._parseJson(props.keywords) || [],
      duplicateOf: this._parseJson(props.duplicateOf) || null,
      analysisLog: this._parseJson(props.analysisLog) || [],
      extractionLog: this._parseJson(props.extractionLog) || [],
      chatHistory: this._parseJson(props.chatHistory) || []
    };
  }
}

// Singleton
let _instance = null;
function getSourceService() {
  if (!_instance) _instance = new SourceService();
  return _instance;
}

module.exports = getSourceService();
module.exports.getSourceService = getSourceService;
module.exports.SourceService = SourceService;
module.exports.SOURCE_TYPES = SOURCE_TYPES;
module.exports.DOCUMENT_TYPES = DOCUMENT_TYPES;
