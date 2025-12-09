const path = require('path');
const pdfParser = require('./parsers/pdf.parser');
const msgParser = require('./parsers/msg.parser');
const docxParser = require('./parsers/docx.parser');
const enrichmentService = require('./enrichment.service');
const teiService = require('./tei.service');
const { v4: uuidv4 } = require('uuid');

class SimulationService {
    /**
     * Simulates the full ingestion pipeline for an attachment.
     * @param {string} filePath - Path to the temp file.
     * @param {string} fileType - Original file name or extension.
     * @returns {Promise<Object>} - Simulation results.
     */
    async simulateAttachmentProcessing(filePath, fileType) {
        const ext = path.extname(fileType).toLowerCase() || path.extname(filePath).toLowerCase();
        let atoms = [];

        // 1. Parsing
        console.log(`[Simulation] Parsing ${fileType}...`);
        if (ext === '.pdf') {
            atoms = await pdfParser.parse(filePath);
        } else if (ext === '.msg') {
            atoms = await msgParser.parse(filePath);
        } else if (ext === '.docx') {
            atoms = await docxParser.parse(filePath);
        } else {
            throw new Error(`Unsupported file type for simulation: ${ext}`);
        }

        const stats = {
            totalAtoms: atoms.length,
            totalTokens: 0,
            model: process.env.LLM_MODEL || 'unknown'
        };

        const processedAtoms = [];
        const textsToEmbed = [];

        // 2. Enrichment Loop
        console.log(`[Simulation] Enriching ${atoms.length} atoms...`);
        for (const atom of atoms) {
            // Summary
            const summary = await enrichmentService.generateSummary(atom.content);

            // Graph Extraction
            const graphData = await enrichmentService.extractGraphEntities(atom.content);

            // Prepare for Vectorization
            const textToEmbed = `${atom.context}\n${summary}\n${atom.content}`;
            textsToEmbed.push(textToEmbed);

            // Estimate tokens (rough approximation: 4 chars per token)
            const tokenCount = Math.ceil(textToEmbed.length / 4);
            stats.totalTokens += tokenCount;

            processedAtoms.push({
                id: atom.id,
                content: atom.content,
                context: atom.context,
                summary: summary,
                extractedGraph: graphData,
                tokens: tokenCount,
                text: textToEmbed // For reference
            });
        }

        // 3. Vectorization (Batch)
        console.log(`[Simulation] Vectorizing...`);
        let vectors = [];
        try {
            if (textsToEmbed.length > 0) {
                vectors = await teiService.getEmbeddings(textsToEmbed);
            }
        } catch (e) {
            console.warn("[Simulation] Vectorization failed (is TEI running?), using mock vectors.", e.message);
            // Mock vectors if TEI fails
            vectors = textsToEmbed.map(() => Array(50).fill(0).map(() => Math.random() * 2 - 1));
        }

        // 4. Formatting Results
        // Attach vector previews to atoms
        processedAtoms.forEach((atom, idx) => {
            const vec = vectors[idx] || [];
            // Return only first 50 dims for preview to save bandwidth
            atom.vectorPreview = vec.slice(0, 50);
        });

        // Consolidate Graph Data for the whole document
        const fullGraph = {
            nodes: [],
            edges: []
        };

        const uniqueNodes = new Map();
        const allEdges = [];

        processedAtoms.forEach(atom => {
            if (atom.extractedGraph) {
                // Deduplicate nodes
                if (atom.extractedGraph.nodes) {
                    atom.extractedGraph.nodes.forEach(node => {
                        if (!node.id) return;
                        // Use normalized ID as key
                        const key = node.id.toLowerCase();
                        if (!uniqueNodes.has(key)) {
                            uniqueNodes.set(key, {
                                ...node,
                                id: key, // Ensure ID is normalized
                                data: { isSimulation: true, initiator: 'AI' }
                            });
                        }
                    });
                }

                // Collect edges
                if (atom.extractedGraph.edges) {
                    atom.extractedGraph.edges.forEach(edge => {
                        allEdges.push({
                            ...edge,
                            source: edge.source.toLowerCase(),
                            target: edge.target.toLowerCase(),
                            id: `sim_edge_${uuidv4()}` // Generate unique ID for ReactFlow
                        });
                    });
                }
            }
        });

        fullGraph.nodes = Array.from(uniqueNodes.values());
        fullGraph.edges = allEdges;

        return {
            fileType: ext,
            stats: stats,
            atoms: processedAtoms,
            graphData: fullGraph,
            graphPreview: fullGraph // Explicitly return as graphPreview as requested
        };
    }
}

module.exports = new SimulationService();
