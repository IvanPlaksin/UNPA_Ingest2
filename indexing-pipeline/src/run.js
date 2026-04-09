/**
 * Enhanced Indexing Pipeline Worker
 *
 * Integrates the full text processing pipeline:
 * - Sanitization (HTML, PII removal, normalization)
 * - Language Detection (multi-script support)
 * - Semantic Chunking (paragraphs, headers, sentences)
 * - Entity Extraction (hybrid regex + LLM)
 * - Graph Building (ontology-based)
 * - Vector Storage (Qdrant)
 * - Graph Storage (Memgraph)
 *
 * @module indexing-pipeline/run
 */

require('dotenv').config();
const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Core Services
const adoFetcher = require('./ado.fetcher');
const teiService = require('./services/tei.service');
const qdrantService = require('./services/qdrant.service');
const memgraphService = require('./services/memgraph.service');
const { getAIProvider } = require('./services/llm/ai.factory');

// Parsers
const pdfParser = require('./services/parsers/pdf.parser');
const msgParser = require('./services/parsers/msg.parser');
const enrichmentService = require('./services/enrichment.service');

// Text Processing Pipeline (new imports from api/src/services)
const { TextSanitizer, sanitizeForEmbedding, sanitizeForGraphExtraction } = require('../../api/src/services/preprocessing/sanitizer.service');
const { LanguageDetector, detectLanguage } = require('../../api/src/services/preprocessing/language-detector');
const { TextChunker, chunkForEmbedding, chunkForRAG } = require('../../api/src/services/chunking/text-chunker');
const { EntityExtractor, extractEntities } = require('../../api/src/services/extraction/entity-extractor');
const { validateNode, validateRelationship, NODE_TYPES, EDGE_TYPES } = require('../../api/src/services/graph/ontology.schema');
const { resultFusion, fuseMultiple, rrfFusion } = require('../../api/src/services/retrieval/result-fusion');

// Initialize pipeline services
const sanitizer = new TextSanitizer({
  removeHtml: true,
  normalizeWhitespace: true,
  removePII: process.env.REMOVE_PII === 'true',
  preserveCodeBlocks: true,
  decodeHtmlEntities: true,
  normalizeUnicode: true
});

const languageDetector = new LanguageDetector({
  defaultLanguage: 'en',
  minConfidence: 0.3
});

const chunker = new TextChunker({
  maxTokens: parseInt(process.env.CHUNK_MAX_TOKENS) || 512,
  overlapTokens: parseInt(process.env.CHUNK_OVERLAP_TOKENS) || 50,
  preserveParagraphs: true,
  preserveSentences: true,
  detectHeaders: true
});

const entityExtractor = new EntityExtractor({
  extractStructuredData: true,
  enableSemanticExtraction: process.env.ENABLE_SEMANTIC_EXTRACTION === 'true',
  minConfidence: parseFloat(process.env.ENTITY_MIN_CONFIDENCE) || 0.5
});

// Redis Config
const redisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null
};

const redisConnection = new IORedis(redisOptions);
const redisPublisher = new IORedis(redisOptions);

/**
 * Publish event to Redis for UI updates
 */
async function publishEvent(jobId, type, status, data = null) {
  const channel = `job_updates:${jobId}`;
  const message = {
    type: type,
    timestamp: new Date().toISOString(),
    payload: {
      status: status,
      data: data
    }
  };
  await redisPublisher.publish(channel, JSON.stringify(message));
}

/**
 * Process text through the full pipeline
 *
 * @param {string} text - Raw input text
 * @param {Object} context - Processing context (source, type, etc.)
 * @returns {Object} Processed result with chunks, entities, metadata
 */
async function processTextPipeline(text, context = {}) {
  const pipelineStart = Date.now();
  const metrics = {};

  // Step 1: Sanitization
  const sanitizeStart = Date.now();
  const sanitized = sanitizer.sanitize(text, {
    removePII: context.removePII || false
  });
  metrics.sanitization = Date.now() - sanitizeStart;

  // Step 2: Language Detection
  const langStart = Date.now();
  const language = languageDetector.detect(sanitized.text);
  metrics.languageDetection = Date.now() - langStart;

  // Step 3: Chunking (use RAG chunking for better context)
  const chunkStart = Date.now();
  const chunks = chunker.chunkForEmbedding(sanitized.text);
  metrics.chunking = Date.now() - chunkStart;

  // Step 4: Entity Extraction (per chunk)
  const extractStart = Date.now();
  const allEntities = [];
  const entitiesPerChunk = [];

  for (const chunk of chunks) {
    const extracted = await entityExtractor.extract(chunk.content, {
      context: context.type,
      language: language.language
    });
    entitiesPerChunk.push(extracted);
    allEntities.push(...extracted.entities);
  }
  metrics.entityExtraction = Date.now() - extractStart;

  // Step 5: Deduplicate and merge entities
  const mergedEntities = deduplicateEntities(allEntities);

  // Step 6: Validate against ontology
  const validatedEntities = mergedEntities.filter(entity => {
    const validation = validateNode({
      type: entity.type,
      properties: {
        id: entity.id || generateEntityId(entity),
        name: entity.name || entity.text,
        ...entity.properties
      }
    });
    return validation.valid;
  });

  metrics.totalPipeline = Date.now() - pipelineStart;

  return {
    originalText: text,
    sanitizedText: sanitized.text,
    language: language,
    chunks: chunks,
    entities: validatedEntities,
    rawEntities: allEntities,
    metadata: {
      sanitizationChanges: sanitized.changes,
      compressionRatio: sanitized.metadata.compressionRatio,
      hadPII: sanitized.metadata.hadPII,
      hadHtml: sanitized.metadata.hadHtml,
      chunkCount: chunks.length,
      entityCount: validatedEntities.length,
      rawEntityCount: allEntities.length
    },
    metrics: metrics
  };
}

/**
 * Deduplicate entities by ID or name
 */
function deduplicateEntities(entities) {
  const seen = new Map();

  for (const entity of entities) {
    const key = entity.id || `${entity.type}:${(entity.name || entity.text || '').toLowerCase()}`;

    if (seen.has(key)) {
      // Merge confidence scores
      const existing = seen.get(key);
      existing.confidence = Math.max(existing.confidence || 0, entity.confidence || 0);
      existing.occurrences = (existing.occurrences || 1) + 1;
    } else {
      seen.set(key, { ...entity, occurrences: 1 });
    }
  }

  return [...seen.values()];
}

/**
 * Generate entity ID from entity data
 */
function generateEntityId(entity) {
  const base = `${entity.type}_${entity.name || entity.text || 'unknown'}`;
  return base.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 100);
}

/**
 * Map entity type to ontology layer
 */
function getLayerForEntityType(type) {
  const nodeType = NODE_TYPES[type];
  if (nodeType) {
    return nodeType.layer;
  }

  // Fallback mapping
  const strategicTypes = ['Epic', 'Feature', 'Strategy', 'Goal', 'KPI', 'Concept'];
  const codeTypes = ['File', 'Class', 'Function', 'Method', 'Module', 'Interface', 'Variable', 'API', 'Database'];

  if (strategicTypes.includes(type)) return 'Strategic';
  if (codeTypes.includes(type)) return 'Code';
  return 'Business';
}

/**
 * Get Z position for 3D visualization
 */
function getZPositionForType(type) {
  const nodeType = NODE_TYPES[type];
  return nodeType ? nodeType.zPosition : 0;
}

/**
 * Process Work Items from ADO
 */
async function processWorkItems(job, ai, ids) {
  const jobId = job.id;

  // --- STEP 1: EXTRACTION ---
  await publishEvent(jobId, 'step_extraction', 'running');

  let items;
  try {
    items = await adoFetcher.getWorkItemsData(ids);

    if (!items || items.length === 0) {
      throw new Error('Extraction returned no items. Check IDs or permissions.');
    }

    await publishEvent(jobId, 'step_extraction', 'completed', { count: items.length, sample: items[0]?.title });
  } catch (e) {
    await publishEvent(jobId, 'step_extraction', 'error', e.message);
    throw e;
  }

  const documentsToSave = [];
  const allGraphNodes = [];
  const allGraphEdges = [];

  // --- STEP 2: TEXT PROCESSING PIPELINE ---
  await publishEvent(jobId, 'step_pipeline', 'running');

  try {
    for (const item of items) {
      const rawText = `Task #${item.id}: ${item.title}. ${item.description || ''}`;

      if (!rawText.trim() || rawText.length < 10) {
        console.warn(`Task ${item.id} is empty or too short, skipping.`);
        continue;
      }

      // Process through full pipeline
      const pipelineResult = await processTextPipeline(rawText, {
        type: 'WorkItem',
        source: 'ADO',
        removePII: process.env.REMOVE_PII === 'true'
      });

      // Prepare document for each chunk
      for (let i = 0; i < pipelineResult.chunks.length; i++) {
        const chunk = pipelineResult.chunks[i];
        const chunkId = `workitem_${item.id}_chunk_${i}`;

        documentsToSave.push({
          id: chunkId,
          text: chunk.content,
          metadata: {
            type: 'WorkItem',
            adoId: item.id,
            title: item.title,
            status: 'GENERATED',
            language: pipelineResult.language.language,
            languageConfidence: pipelineResult.language.confidence,
            chunkIndex: i,
            totalChunks: pipelineResult.chunks.length,
            tokenEstimate: chunk.tokenEstimate
          }
        });
      }

      // Create WorkItem node
      const workItemNode = {
        type: 'WorkItem',
        id: `workitem_${item.id}`,
        name: item.title,
        properties: {
          adoId: item.id,
          language: pipelineResult.language.language,
          entityCount: pipelineResult.entities.length,
          chunkCount: pipelineResult.chunks.length
        },
        layer: 'Business',
        zPosition: 0
      };
      allGraphNodes.push(workItemNode);

      // Add extracted entities as nodes
      for (const entity of pipelineResult.entities) {
        const entityId = entity.id || generateEntityId(entity);
        const layer = getLayerForEntityType(entity.type);

        allGraphNodes.push({
          type: entity.type,
          id: entityId,
          name: entity.name || entity.text,
          properties: {
            confidence: entity.confidence,
            occurrences: entity.occurrences,
            source: 'extraction'
          },
          layer: layer,
          zPosition: getZPositionForType(entity.type)
        });

        // Create relationship: WorkItem -> MENTIONS -> Entity
        allGraphEdges.push({
          source: workItemNode.id,
          target: entityId,
          type: 'MENTIONS',
          properties: {
            confidence: entity.confidence
          }
        });
      }
    }

    if (documentsToSave.length === 0) {
      throw new Error('Pipeline resulted in 0 documents.');
    }

    await publishEvent(jobId, 'step_pipeline', 'completed', {
      documents: documentsToSave.length,
      nodes: allGraphNodes.length,
      edges: allGraphEdges.length
    });
  } catch (e) {
    await publishEvent(jobId, 'step_pipeline', 'error', e.message);
    throw e;
  }

  // --- STEP 3: VECTORIZATION (TEI - Batch) ---
  await publishEvent(jobId, 'step_vectorization', 'running');

  let vectors = [];
  try {
    const textsToEmbed = documentsToSave.map(doc => doc.text);
    vectors = await teiService.getEmbeddings(textsToEmbed);

    if (!vectors || vectors.length !== documentsToSave.length) {
      throw new Error('Vectorization mismatch or failure.');
    }

    await publishEvent(jobId, 'step_vectorization', 'completed', { vectorSize: vectors[0]?.length, count: vectors.length });
  } catch (e) {
    await publishEvent(jobId, 'step_vectorization', 'error', e.message);
    throw e;
  }

  // --- STEP 4: DUAL STORAGE (Qdrant + Memgraph) ---
  await publishEvent(jobId, 'step_storage', 'running');

  try {
    const qdrantPoints = [];

    for (let i = 0; i < documentsToSave.length; i++) {
      const doc = documentsToSave[i];
      const vector = vectors[i];
      const pointId = uuidv4();

      // Prepare for Qdrant
      qdrantPoints.push({
        id: pointId,
        vector: vector,
        payload: {
          original_id: doc.id,
          text: doc.text,
          ...doc.metadata
        }
      });

      // Update document with Qdrant reference
      doc.qdrant_id = pointId;
    }

    // Batch write to Qdrant
    await qdrantService.upsertPoints(qdrantPoints);

    // Write graph nodes to Memgraph
    for (const node of allGraphNodes) {
      await memgraphService.mergeNode(node.type, {
        id: node.id,
        name: node.name,
        layer: node.layer,
        zPosition: node.zPosition,
        ...node.properties
      });
    }

    // Write graph edges to Memgraph
    for (const edge of allGraphEdges) {
      try {
        await memgraphService.mergeRelationship(edge.source, edge.target, edge.type, edge.properties);
      } catch (edgeErr) {
        console.warn(`Edge creation failed: ${edge.source}->${edge.target}:`, edgeErr.message);
      }
    }

    // Link documents to WorkItems with vector references
    const docsByWorkItem = {};
    for (const doc of documentsToSave) {
      const workItemId = `workitem_${doc.metadata.adoId}`;
      if (!docsByWorkItem[workItemId]) {
        docsByWorkItem[workItemId] = [];
      }
      docsByWorkItem[workItemId].push(doc.qdrant_id);
    }

    for (const [workItemId, vectorIds] of Object.entries(docsByWorkItem)) {
      await memgraphService.mergeNode('WorkItem', {
        id: workItemId,
        qdrant_vector_ids: JSON.stringify(vectorIds)
      });
    }

    await publishEvent(jobId, 'step_storage', 'completed', {
      qdrantPoints: qdrantPoints.length,
      graphNodes: allGraphNodes.length,
      graphEdges: allGraphEdges.length
    });
  } catch (e) {
    await publishEvent(jobId, 'step_storage', 'error', e.message);
    throw e;
  }

  return {
    documents: documentsToSave,
    nodes: allGraphNodes,
    edges: allGraphEdges
  };
}

/**
 * Process Document (PDF, MSG, etc.)
 */
async function processDocument(job, ai, filePath) {
  const jobId = job.id;
  const workItemId = job.data.workItemId;

  // --- STEP A: DEDUPLICATION (Hash Check) ---
  await publishEvent(jobId, 'step_dedup', 'running');

  const fileBuffer = fs.readFileSync(filePath);
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const fileName = path.basename(filePath);

  // Check Memgraph
  const existingNode = await memgraphService.findNodeByHash(fileHash);
  if (existingNode) {
    console.log(`[Ingest] Deduplication: Document ${fileName} already exists (Hash: ${fileHash.substring(0, 8)}).`);

    if (workItemId) {
      await memgraphService.mergeRelationship(workItemId, existingNode.id, 'HAS_ATTACHMENT');
    }

    await publishEvent(jobId, 'step_dedup', 'completed', { status: 'duplicate', id: existingNode.id });
    return;
  }

  await publishEvent(jobId, 'step_dedup', 'completed', { status: 'new', hash: fileHash });

  // --- STEP B: PARSING ---
  await publishEvent(jobId, 'step_parsing', 'running');

  const ext = path.extname(filePath).toLowerCase();
  let atoms = [];

  try {
    if (ext === '.pdf') {
      atoms = await pdfParser.parse(fileBuffer);
    } else if (ext === '.msg') {
      atoms = await msgParser.parse(filePath);
    } else {
      throw new Error(`Unsupported file type: ${ext}`);
    }

    await publishEvent(jobId, 'step_parsing', 'completed', { count: atoms.length });
  } catch (e) {
    await publishEvent(jobId, 'step_parsing', 'error', e.message);
    throw e;
  }

  // --- STEP C: TEXT PROCESSING PIPELINE ---
  await publishEvent(jobId, 'step_pipeline', 'running');

  const enrichedAtoms = [];
  const allNodes = [];
  const allEdges = [];
  const textsToEmbed = [];

  try {
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      const vectorId = uuidv4();

      // Process through pipeline
      const pipelineResult = await processTextPipeline(atom.content, {
        type: 'Document',
        source: 'file',
        removePII: process.env.REMOVE_PII === 'true'
      });

      // Generate summary via enrichment service
      const summary = await enrichmentService.generateSummary(atom.content);

      // Text for embedding includes context + summary + content
      const textToEmbed = [
        atom.context || '',
        summary,
        pipelineResult.sanitizedText
      ].filter(Boolean).join('\n');

      enrichedAtoms.push({
        ...atom,
        id: atom.id || `atom_${fileHash}_${i}`,
        vectorId: vectorId,
        summary: summary,
        pipelineResult: pipelineResult,
        textToEmbed: textToEmbed
      });

      textsToEmbed.push(textToEmbed);

      // Collect entities
      for (const entity of pipelineResult.entities) {
        const entityId = entity.id || generateEntityId(entity);
        const layer = getLayerForEntityType(entity.type);

        allNodes.push({
          type: entity.type,
          id: entityId,
          name: entity.name || entity.text,
          layer: layer,
          zPosition: getZPositionForType(entity.type),
          properties: {
            confidence: entity.confidence,
            source: 'extraction'
          }
        });

        // Atom -> MENTIONS -> Entity
        allEdges.push({
          source: `atom_${fileHash}_${i}`,
          target: entityId,
          type: 'MENTIONS'
        });
      }
    }

    await publishEvent(jobId, 'step_pipeline', 'completed', {
      atoms: enrichedAtoms.length,
      entities: allNodes.length
    });
  } catch (e) {
    await publishEvent(jobId, 'step_pipeline', 'error', e.message);
    throw e;
  }

  // --- STEP D: VECTORIZATION ---
  await publishEvent(jobId, 'step_vectorization', 'running');

  let vectors = [];
  const qdrantPoints = [];

  try {
    if (textsToEmbed.length > 0) {
      vectors = await teiService.getEmbeddings(textsToEmbed);
    }

    for (let i = 0; i < enrichedAtoms.length; i++) {
      const atom = enrichedAtoms[i];
      qdrantPoints.push({
        id: atom.vectorId,
        vector: vectors[i],
        payload: {
          file_name: fileName,
          file_hash: fileHash,
          content: atom.pipelineResult.sanitizedText,
          context: atom.context,
          summary: atom.summary,
          type: atom.type,
          language: atom.pipelineResult.language.language,
          entityCount: atom.pipelineResult.entities.length
        }
      });
    }

    if (qdrantPoints.length > 0) {
      await qdrantService.upsertPoints(qdrantPoints);
    }

    await publishEvent(jobId, 'step_vectorization', 'completed', { count: vectors.length });
  } catch (e) {
    await publishEvent(jobId, 'step_vectorization', 'error', e.message);
    throw e;
  }

  // --- STEP E: GRAPH PERSISTENCE ---
  await publishEvent(jobId, 'step_graph_persistence', 'running');

  try {
    // Create Document Node
    const docNodeId = `doc_${fileHash}`;
    await memgraphService.mergeNode('Document', {
      id: docNodeId,
      name: fileName,
      fileHash: fileHash,
      type: 'Document',
      layer: 'Business',
      zPosition: 0,
      atomCount: enrichedAtoms.length,
      entityCount: allNodes.length
    });

    // Create Atom nodes and link to Document
    for (const atom of enrichedAtoms) {
      await memgraphService.mergeNode('Atom', {
        id: atom.id,
        content: atom.pipelineResult.sanitizedText.substring(0, 500),
        summary: atom.summary,
        qdrant_vector_id: atom.vectorId,
        type: atom.type,
        language: atom.pipelineResult.language.language,
        layer: 'Business',
        zPosition: 0
      });

      // Document -> CONTAINS -> Atom
      await memgraphService.mergeRelationship(docNodeId, atom.id, 'CONTAINS');
    }

    // Create Entity nodes
    for (const node of allNodes) {
      await memgraphService.mergeNode(node.type, {
        id: node.id,
        name: node.name,
        layer: node.layer,
        zPosition: node.zPosition,
        ...node.properties
      });
    }

    // Create edges
    for (const edge of allEdges) {
      try {
        await memgraphService.mergeRelationship(edge.source, edge.target, edge.type, edge.properties || {});
      } catch (edgeErr) {
        console.warn(`Edge creation failed: ${edge.source}->${edge.target}`, edgeErr.message);
      }
    }

    // Link to WorkItem if provided
    if (workItemId) {
      await memgraphService.mergeRelationship(workItemId, docNodeId, 'HAS_ATTACHMENT');
    }

    await publishEvent(jobId, 'step_graph_persistence', 'completed', {
      nodes: allNodes.length + enrichedAtoms.length + 1,
      edges: allEdges.length + enrichedAtoms.length
    });

  } catch (graphError) {
    console.error(`[Ingest] Graph persistence failed! Initiating Rollback... Error: ${graphError.message}`);

    // Rollback: Delete vectors
    const vectorIdsToDelete = enrichedAtoms.map(a => a.vectorId);
    try {
      await qdrantService.deletePoints(vectorIdsToDelete);
      console.log(`[Ingest] Rollback successful: Deleted ${vectorIdsToDelete.length} vectors.`);
    } catch (rollbackError) {
      console.error(`[Ingest] CRITICAL: Rollback failed! Vectors orphaned. IDs: ${vectorIdsToDelete.join(',')}`, rollbackError);
    }

    throw new Error(`Graph sync failed: ${graphError.message}. Vectors rolled back.`);
  }

  return {
    document: docNodeId,
    atoms: enrichedAtoms.length,
    entities: allNodes.length,
    edges: allEdges.length
  };
}

// --- WORKER SETUP ---

const worker = new Worker('knowledge-queue', async (job) => {
  console.log(`Processing job ${job.id} (${job.name})`);
  const startTime = Date.now();

  try {
    const ai = getAIProvider('local', 'llama3');

    let result;
    if (job.name === 'ingest-work-items') {
      result = await processWorkItems(job, ai, job.data.ids);
    } else if (job.name === 'process-document') {
      result = await processDocument(job, ai, job.data.filePath);
    }

    const duration = Date.now() - startTime;
    await publishEvent(job.id, 'job_complete', 'success', {
      duration,
      result
    });

    console.log(`Job ${job.id} completed in ${duration}ms`);
    return result;

  } catch (e) {
    console.error(`Job ${job.id} failed:`, e);
    await publishEvent(job.id, 'job_failed', 'error', { message: e.message, stack: e.stack });
    throw e;
  }

}, { connection: redisConnection });

console.log('===============================================');
console.log('  Enhanced Indexing Pipeline Worker Started');
console.log('===============================================');
console.log(`  Redis: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
console.log(`  PII Removal: ${process.env.REMOVE_PII === 'true' ? 'ENABLED' : 'disabled'}`);
console.log(`  Semantic Extraction: ${process.env.ENABLE_SEMANTIC_EXTRACTION === 'true' ? 'ENABLED' : 'disabled'}`);
console.log(`  Chunk Size: ${chunker.config.maxTokens} tokens`);
console.log('===============================================');

// Heartbeat for monitoring
setInterval(async () => {
  try {
    await redisConnection.set('worker:heartbeat', Date.now(), 'EX', 30);
    await redisConnection.set('worker:status', JSON.stringify({
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    }), 'EX', 30);
  } catch (e) {
    console.error('Heartbeat failed:', e.message);
  }
}, 10000);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await worker.close();
  await redisConnection.quit();
  await redisPublisher.quit();
  process.exit(0);
});

module.exports = {
  processTextPipeline,
  processWorkItems,
  processDocument,
  worker
};
