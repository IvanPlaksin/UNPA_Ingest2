const neo4jService = require('./neo4j.service');
const chromaService = require('./chroma.service');
const adoService = require('./ado.service');
const graphExtractor = require('./graph.extractor');
const msgProcessor = require('../processors/msg.structure.processor');
const pdfProcessor = require('../../../indexing-pipeline/src/processors/pdf.structure.processor'); // Cross-module import
const docxProcessor = require('../../../indexing-pipeline/src/processors/docx.structure.processor'); // Cross-module import
const { getAIProvider } = require('./llm/ai.factory');
const crypto = require('crypto');

class IngestionService {
    constructor() {
        // Default to local Llama 3 for now, can be configured
        this.ai = getAIProvider('local', 'llama3');
    }

    /**
     * Generates a hash for the content to check for changes.
     * @param {Buffer} buffer 
     */
    _generateHash(buffer) {
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    /**
     * Orchestrates the ingestion of an attachment.
     * @param {string} attachmentUrl 
     * @param {string} workItemId 
     * @param {string} fileName 
     */
    async processAttachment(attachmentUrl, workItemId, fileName) {
        console.log(`[Ingestion] Processing attachment: ${fileName} (${attachmentUrl})`);

        // 1. Check Status (Idempotency)
        const status = await neo4jService.checkDocumentStatus(attachmentUrl);
        if (status.processed) {
            console.log(`[Ingestion] Document already processed. Returning existing graph.`);
            // TODO: Fetch existing chunks from Chroma if needed for the UI inspector
            // For now, we'll return the graph and empty chunks (or fetch from Chroma if we implement that)
            const graphData = await neo4jService.getDocumentGraph(attachmentUrl);
            return {
                graphData: this._formatGraphData(graphData),
                chunks: [], // We could fetch these from Chroma if we want to show them again
                status: 'cached'
            };
        }

        // 2. Download
        const contentBuffer = await adoService.getAttachmentContent(attachmentUrl);
        const fileHash = this._generateHash(Buffer.from(contentBuffer));

        // 3. Parse
        let atoms = [];
        const lowerName = fileName.toLowerCase();

        if (lowerName.endsWith('.msg')) {
            atoms = await msgProcessor.process(contentBuffer);
        } else if (lowerName.endsWith('.pdf')) {
            atoms = await pdfProcessor.process(contentBuffer);
        } else if (lowerName.endsWith('.docx')) {
            atoms = await docxProcessor.process(contentBuffer);
        } else {
            throw new Error(`Unsupported file type: ${fileName}`);
        }

        // 4. Vectorize & Enrich
        const chunks = [];
        const entities = [];

        for (let i = 0; i < atoms.length; i++) {
            const atom = atoms[i];
            const text = `${atom.context}\n${atom.content}`;

            // Vectorize
            let vector;
            try {
                vector = await this.ai.embedText(text);
            } catch (e) {
                console.error(`[Ingestion] Vectorization failed for atom ${i}`, e);
                continue;
            }

            chunks.push({
                id: `doc_${fileHash}_${i}`,
                text: atom.content,
                metadata: {
                    source: attachmentUrl,
                    workItemId: workItemId,
                    type: atom.type,
                    context: atom.context
                },
                vector: vector,
                // For UI display
                tokenCount: atom.content.split(' ').length,
                vectorSample: vector.slice(0, 5)
            });

            // Extract Entities (Heuristics for now, can use LLM later)
            if (atom.metadata && atom.metadata.sender) {
                entities.push({ name: atom.metadata.sender, type: 'Person', relation: 'AUTHORED_BY' });
            }
            // Simple keyword extraction for demo
            if (atom.content.includes('Node.js')) entities.push({ name: 'Node.js', type: 'Technology' });
            if (atom.content.includes('Neo4j')) entities.push({ name: 'Neo4j', type: 'Technology' });
        }

        // 5. Save to Chroma
        await chromaService.saveVectors(chunks);

        // 6. Save to Neo4j (Graph)
        const docData = {
            url: attachmentUrl,
            name: fileName,
            hash: fileHash,
            processedAt: new Date().toISOString()
        };
        await neo4jService.saveDocument(docData, workItemId);
        await neo4jService.saveExtractedEntities(attachmentUrl, entities);

        // 7. Return Result
        const graphData = await neo4jService.getDocumentGraph(attachmentUrl);

        return {
            graphData: this._formatGraphData(graphData),
            chunks: chunks.map(c => ({ ...c, vector: c.vector })), // Return full vectors for UI
            status: 'processed'
        };
    }

    /**
     * Simulates the ingestion of an attachment (Dry Run).
     * @param {string} attachmentUrl 
     * @param {string} workItemId 
     * @param {string} fileName 
     */
    async simulateAttachment(attachmentUrl, workItemId, fileName) {
        console.log(`[Ingestion] Simulating attachment: ${fileName} (${attachmentUrl})`);

        // Ensure model exists
        if (this.ai.ensureModelExists) {
            await this.ai.ensureModelExists();
        }

        // 1. Download
        const contentBuffer = await adoService.getAttachmentContent(attachmentUrl);
        const fileHash = this._generateHash(Buffer.from(contentBuffer));

        // 2. Parse
        let atoms = [];
        const lowerName = fileName.toLowerCase();

        if (lowerName.endsWith('.msg')) {
            atoms = await msgProcessor.process(contentBuffer);
        } else if (lowerName.endsWith('.pdf')) {
            atoms = await pdfProcessor.process(contentBuffer);
        } else if (lowerName.endsWith('.docx')) {
            atoms = await docxProcessor.process(contentBuffer);
        } else {
        }

        // 3. Vectorize & Enrich
        const chunks = [];
        const graphNodes = [];
        const graphEdges = [];

        // Create Document Node
        const docNodeId = `sim_doc_${fileHash}`;
        graphNodes.push({
            id: docNodeId,
            label: `Document: ${fileName}`,
            type: 'Artifact',
            data: {
                status: 'AI_VERIFIED',
                verificationDate: new Date().toISOString(),
                initiator: 'Gemini-3-Pro',
                version: 1,
                isSimulation: true,
                url: attachmentUrl
            }
        });

        for (let i = 0; i < atoms.length; i++) {
            const atom = atoms[i];
            const text = `${atom.context}\n${atom.content}`;

            // Vectorize
            let vector;
            try {
                vector = await this.ai.embedText(text);
            } catch (e) {
                console.error(`[Ingestion] Vectorization failed for atom ${i}`, e);
                continue;
            }

            chunks.push({
                id: `chk_${i}`,
                text: atom.content,
                metadata: {
                    source: attachmentUrl,
                    workItemId: workItemId,
                    type: atom.type,
                    context: atom.context
                },
                vectorPreview: vector.slice(0, 50), // Preview for UI
                tokens: atom.content.split(' ').length
            });

            // --- GRAPH EXTRACTION (LLM) ---
            try {
                // Only extract graph if content is substantial enough
                if (atom.content.length > 30) {
                    const chunkGraph = await graphExtractor.extractGraphFromChunk(atom.content, docNodeId, this.ai);

                    if (chunkGraph.nodes.length > 0) {
                        chunkGraph.nodes.forEach(n => graphNodes.push(n));
                        chunkGraph.edges.forEach(e => graphEdges.push(e));
                        console.log(`[Ingestion] Extracted ${chunkGraph.nodes.length} nodes from atom ${i}`);
                    }
                }
            } catch (graphErr) {
                console.warn(`[Ingestion] Graph extraction failed for atom ${i}:`, graphErr.message);
            }
        }

        // Deduplicate entities (simple ID check)
        const uniqueNodes = Array.from(new Map(graphNodes.map(n => [n.id, n])).values());
        const uniqueEdges = Array.from(new Map(graphEdges.map(e => [e.id || `${e.source}-${e.target}`, e])).values());

        return {
            chunks: chunks,
            graphData: {
                nodes: uniqueNodes,
                edges: uniqueEdges,
                metadata: {
                    graphId: crypto.randomUUID(),
                    version: 1,
                    verification: { status: 'AI_VERIFIED' },
                    date: new Date().toISOString(),
                    initiator: 'Gemini-3-Pro'
                }
            }
        };
    }

    async vectorizeQuery(text) {
        const vector = await this.ai.embedText(text);
        return { vector };
    }

    // Helper to format Neo4j driver result to UI expected format
    _formatGraphData(neo4jResult) {
        // neo4jResult is { nodes: [], edges: [] } from our service
        // We need to ensure it matches what the UI expects (id, label, type, etc.)
        // Our service already does a decent job, but let's ensure IDs are strings
        return {
            nodes: neo4jResult.nodes.map(n => ({
                id: n.id,
                label: n.label,
                type: n.type,
                data: n.properties // ReactFlow might want 'data'
            })),
            edges: neo4jResult.edges.map(e => ({
                id: e.id,
                source: e.source,
                target: e.target,
                label: e.label
            }))
        };
    }
    // ... (existing methods)

    /**
     * Ingests data from a source adapter stream.
     * @param {import('./interfaces/source.adapter').SourceAdapter} adapter 
     * @param {Object} filter 
     */
    async ingestFromSource(adapter, filter) {
        console.log(`[Ingestion] Starting ingestion from source...`);

        if (adapter.validateConfig) {
            const isHealthy = await adapter.validateConfig();
            if (!isHealthy) throw new Error("Source adapter is not healthy.");
        }

        let count = 0;
        const results = [];

        try {
            for await (const item of adapter.fetchStream(filter)) {
                console.log(`[Ingestion] Processing item: ${item.id} (${item.type})`);
                const result = await this.processIngestionItem(item);
                results.push(result);
                count++;
            }
        } catch (e) {
            console.error(`[Ingestion] Stream error:`, e);
            throw e;
        }

        return { count, results };
    }

    /**
     * Processes a single unified IngestionItem.
     * @param {import('./interfaces/source.adapter').IngestionItem} item 
     */
    async processIngestionItem(item) {
        // 1. Check if already processed (Idempotency)
        // Use ID or URL from metadata
        const uniqueId = item.metadata.url || item.id;
        const status = await neo4jService.checkDocumentStatus(uniqueId);

        if (status.processed) {
            console.log(`[Ingestion] Item ${item.id} already processed. Skipping.`);
            return { status: 'skipped', id: item.id };
        }

        // 2. Parse Content (if needed)
        // If type is file, check extension
        let processedContent = item.content;
        let atoms = [];

        if (item.type === 'file') {
            const fileName = item.metadata.path || item.metadata.name || 'unknown';
            const lowerName = fileName.toLowerCase();

            // Assume content is text for source files, but handle processors if BUFFER is needed
            // For now, existing processors take Buffer. 
            // If item.content is string, convert to Buffer?
            const buffer = Buffer.from(item.content);

            if (lowerName.endsWith('.msg')) {
                atoms = await msgProcessor.process(buffer);
            } else if (lowerName.endsWith('.pdf')) {
                atoms = await pdfProcessor.process(buffer);
            } else if (lowerName.endsWith('.docx')) {
                atoms = await docxProcessor.process(buffer);
            } else {
                // Default: Treat as code/text file
                atoms = [{ content: item.content, type: 'code', context: item.context }];
            }
        } else {
            // Work Item or other text
            atoms = [{ content: item.content, type: 'text', context: item.context }];
        }

        // 3. Vectorize & Save (Entities, Chroma, Graph)
        // Reuse logic from processAttachment, but simpler for now

        const chunks = [];
        const entities = [];
        const fileHash = this._generateHash(Buffer.from(item.content)); // item.content might be string

        for (let i = 0; i < atoms.length; i++) {
            const atom = atoms[i];
            const text = `${JSON.stringify(atom.context || {})}\n${atom.content}`;

            let vector;
            try {
                vector = await this.ai.embedText(text);
            } catch (e) {
                console.error(`[Ingestion] Vectorization failed for atom ${i}`, e);
                continue;
            }

            chunks.push({
                id: `item_${fileHash}_${i}`,
                text: atom.content,
                metadata: {
                    source: uniqueId,
                    itemId: item.id,
                    type: atom.type,
                    context: atom.context
                },
                vector: vector
            });

            // Entity Extraction (Heuristic/LLM could be added here)
        }

        // Save to Chroma
        if (chunks.length > 0) {
            await chromaService.saveVectors(chunks);
        }

        // Save to Neo4j
        const docData = {
            url: uniqueId,
            name: item.metadata.title || item.metadata.path || item.id,
            hash: fileHash,
            processedAt: new Date().toISOString()
        };

        // Relation Handling from Metadata
        if (item.metadata.relations) {
            // Logic to save relations to graph could go here
        }

        await neo4jService.saveDocument(docData, item.id);

        // Extract Entities?
        // await neo4jService.saveExtractedEntities(uniqueId, entities);

        return { status: 'processed', id: item.id, chunks: chunks.length };
    }
}

module.exports = new IngestionService();
