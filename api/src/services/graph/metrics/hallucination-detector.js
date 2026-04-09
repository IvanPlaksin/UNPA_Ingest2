/**
 * Hallucination Detector via Embedding Retrieval
 *
 * Implements retrieval-augmented verification following FActScore/SAFE/PiVe methodologies.
 * Pipeline: Verbalize → Embed → Retrieve → Verify
 *
 * Features:
 * - Chunking source text with overlap
 * - Top-k evidence retrieval via embedding similarity
 * - 3-tier verdict system (grounded/uncertain/hallucinated)
 * - Optional LLM verification for uncertain cases
 *
 * @module services/graph/metrics/hallucination-detector
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG = {
    // Chunking parameters
    chunkSize: 200,           // Target chunk size in words
    chunkOverlap: 50,         // Overlap between chunks in words
    minChunkSize: 20,         // Minimum chunk size

    // Retrieval parameters
    topK: 3,                  // Number of chunks to retrieve
    similarityThreshold: 0.7, // Minimum similarity for "grounded" (neural embeddings)
    uncertainThreshold: 0.4,  // Below this = "hallucinated" (neural embeddings)

    // BOW-specific thresholds (lower because BOW is less semantic)
    bowSimilarityThreshold: 0.15, // Minimum similarity for "grounded" (BOW mode)
    bowUncertainThreshold: 0.05,  // Below this = "hallucinated" (BOW mode)

    // Embedding parameters
    embeddingDimension: 384,  // Default embedding dimension
    useBOWFallback: true,     // Use bag-of-words if no embedding service

    // Verification parameters
    useLLMVerification: false, // Enable LLM verification for uncertain
    llmModel: 'gpt-4',        // Model for LLM verification

    // Verbalization templates
    entityTemplate: '{{type}} named "{{name}}"{{#attributes}} with {{key}}={{value}}{{/attributes}}',
    relationTemplate: '"{{subject}}" {{predicate}} "{{object}}"',
    tripleTemplate: '{{subject.name}} ({{subject.type}}) {{predicate}} {{object.name}} ({{object.type}})'
};

// ═══════════════════════════════════════════════════════════════════════════
// HALLUCINATION DETECTOR CLASS
// ═══════════════════════════════════════════════════════════════════════════

class HallucinationDetector {
    /**
     * Create a hallucination detector
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        this.options = { ...DEFAULT_CONFIG, ...options };
        this.embeddingCache = new Map();
        this.chunkCache = new Map();
        this.stats = {
            totalVerifications: 0,
            groundedClaims: 0,
            uncertainClaims: 0,
            hallucinatedClaims: 0,
            cacheHits: 0,
            cacheMisses: 0,
            llmVerifications: 0
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MAIN VERIFICATION PIPELINE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Verify extraction results against source text
     * @param {Object} extractionResult - Extraction result with entities/relations
     * @param {string} sourceText - Original source text
     * @param {Object} options - Override options
     * @returns {Object} Verification report
     */
    async verify(extractionResult, sourceText, options = {}) {
        const config = { ...this.options, ...options };
        const startTime = Date.now();

        // Step 1: Chunk the source text
        const chunks = this.chunkText(sourceText, config);

        // Step 2: Embed all chunks
        const chunkEmbeddings = await this.embedChunks(chunks, config);

        // Step 3: Verbalize claims from extraction
        const claims = this.verbalizeClaims(extractionResult);

        // Step 4: Verify each claim
        const verifications = await Promise.all(
            claims.map(claim => this.verifyClaim(claim, chunks, chunkEmbeddings, config))
        );

        // Step 5: Aggregate results
        const report = this.aggregateResults(verifications, claims, startTime);

        this.stats.totalVerifications++;

        return report;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: TEXT CHUNKING
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Chunk source text with overlap
     * @param {string} text - Source text
     * @param {Object} config - Configuration
     * @returns {Array} Array of chunk objects
     */
    chunkText(text, config) {
        const cacheKey = `${text.length}_${config.chunkSize}_${config.chunkOverlap}`;
        if (this.chunkCache.has(cacheKey)) {
            return this.chunkCache.get(cacheKey);
        }

        const words = text.split(/\s+/).filter(w => w.length > 0);
        const chunks = [];

        let position = 0;
        let chunkIndex = 0;

        while (position < words.length) {
            const endPosition = Math.min(position + config.chunkSize, words.length);
            const chunkWords = words.slice(position, endPosition);

            if (chunkWords.length >= config.minChunkSize) {
                chunks.push({
                    id: `chunk_${chunkIndex}`,
                    text: chunkWords.join(' '),
                    wordStart: position,
                    wordEnd: endPosition,
                    charStart: this.wordPositionToChar(text, position),
                    charEnd: this.wordPositionToChar(text, endPosition)
                });
                chunkIndex++;
            }

            position += config.chunkSize - config.chunkOverlap;
        }

        this.chunkCache.set(cacheKey, chunks);
        return chunks;
    }

    /**
     * Convert word position to character position
     * @param {string} text - Original text
     * @param {number} wordPosition - Word position
     * @returns {number} Character position
     */
    wordPositionToChar(text, wordPosition) {
        const words = text.split(/\s+/);
        let charPos = 0;
        for (let i = 0; i < wordPosition && i < words.length; i++) {
            charPos += words[i].length + 1; // +1 for space
        }
        return Math.min(charPos, text.length);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: EMBEDDING
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Embed all chunks
     * @param {Array} chunks - Chunk objects
     * @param {Object} config - Configuration
     * @returns {Array} Chunk embeddings
     */
    async embedChunks(chunks, config) {
        const embeddings = [];

        for (const chunk of chunks) {
            const embedding = await this.getEmbedding(chunk.text, config);
            embeddings.push(embedding);
        }

        return embeddings;
    }

    /**
     * Get embedding for text (with caching)
     * @param {string} text - Text to embed
     * @param {Object} config - Configuration
     * @returns {Array} Embedding vector
     */
    async getEmbedding(text, config) {
        const cacheKey = text.substring(0, 100);

        if (this.embeddingCache.has(cacheKey)) {
            this.stats.cacheHits++;
            return this.embeddingCache.get(cacheKey);
        }

        this.stats.cacheMisses++;
        let embedding;

        try {
            // Try to use embedding service if available
            if (this.embeddingService) {
                embedding = await this.embeddingService.embed(text);
            } else if (config.useBOWFallback) {
                embedding = this.bowEmbedding(text, config.embeddingDimension);
            } else {
                throw new Error('No embedding service available');
            }
        } catch (error) {
            if (config.useBOWFallback) {
                embedding = this.bowEmbedding(text, config.embeddingDimension);
            } else {
                throw error;
            }
        }

        this.embeddingCache.set(cacheKey, embedding);
        return embedding;
    }

    /**
     * Simple bag-of-words embedding (fallback)
     * @param {string} text - Text to embed
     * @param {number} dimension - Embedding dimension
     * @returns {Array} Embedding vector
     */
    bowEmbedding(text, dimension) {
        const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 2);
        const embedding = new Array(dimension).fill(0);

        for (const word of words) {
            const hash = this.simpleHash(word);
            const index = Math.abs(hash) % dimension;
            embedding[index] += 1;
        }

        // Normalize
        const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0)) || 1;
        return embedding.map(v => v / norm);
    }

    /**
     * Simple string hash function
     * @param {string} str - String to hash
     * @returns {number} Hash value
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: CLAIM VERBALIZATION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Verbalize claims from extraction result
     * @param {Object} extractionResult - Extraction result
     * @returns {Array} Array of verbalized claims
     */
    verbalizeClaims(extractionResult) {
        const claims = [];

        // Verbalize entities
        if (extractionResult.entities) {
            for (const entity of extractionResult.entities) {
                claims.push(this.verbalizeEntity(entity));
            }
        }

        // Verbalize relations
        if (extractionResult.relations) {
            for (const relation of extractionResult.relations) {
                claims.push(this.verbalizeRelation(relation));
            }
        }

        // Verbalize triples
        if (extractionResult.triples) {
            for (const triple of extractionResult.triples) {
                claims.push(this.verbalizeTriple(triple));
            }
        }

        return claims;
    }

    /**
     * Verbalize an entity as a natural language claim
     * @param {Object} entity - Entity object
     * @returns {Object} Claim object
     */
    verbalizeEntity(entity) {
        let text = `There is a ${entity.type || 'entity'}`;

        if (entity.name) {
            text += ` named "${entity.name}"`;
        } else if (entity.id) {
            text += ` identified as "${entity.id}"`;
        }

        // Add key attributes
        const keyAttrs = ['role', 'status', 'department', 'location'];
        const attrs = [];
        for (const attr of keyAttrs) {
            if (entity[attr]) {
                attrs.push(`${attr}: ${entity[attr]}`);
            }
        }
        if (attrs.length > 0) {
            text += ` with ${attrs.join(', ')}`;
        }

        return {
            type: 'entity',
            text,
            source: entity,
            id: entity.id || entity.name || `entity_${Math.random().toString(36).substr(2, 9)}`
        };
    }

    /**
     * Verbalize a relation as a natural language claim
     * @param {Object} relation - Relation object
     * @returns {Object} Claim object
     */
    verbalizeRelation(relation) {
        const subject = relation.subject || relation.source || relation.from || 'something';
        const object = relation.object || relation.target || relation.to || 'something';
        const predicate = relation.predicate || relation.type || relation.relation || 'relates to';

        const text = `"${subject}" ${this.humanizePredicate(predicate)} "${object}"`;

        return {
            type: 'relation',
            text,
            source: relation,
            id: `rel_${subject}_${predicate}_${object}`.replace(/\s+/g, '_').substring(0, 50)
        };
    }

    /**
     * Verbalize a triple as a natural language claim
     * @param {Object} triple - Triple object
     * @returns {Object} Claim object
     */
    verbalizeTriple(triple) {
        const subjectName = triple.subject?.name || triple.subject || 'unknown';
        const subjectType = triple.subject?.type || '';
        const objectName = triple.object?.name || triple.object || 'unknown';
        const objectType = triple.object?.type || '';
        const predicate = triple.predicate || triple.relation || 'relates to';

        let text = `${subjectName}`;
        if (subjectType) text += ` (a ${subjectType})`;
        text += ` ${this.humanizePredicate(predicate)} `;
        text += objectName;
        if (objectType) text += ` (a ${objectType})`;

        return {
            type: 'triple',
            text,
            source: triple,
            id: `triple_${subjectName}_${predicate}_${objectName}`.replace(/\s+/g, '_').substring(0, 50)
        };
    }

    /**
     * Convert predicate to human-readable form
     * @param {string} predicate - Predicate in CAPS_CASE
     * @returns {string} Human-readable predicate
     */
    humanizePredicate(predicate) {
        const mapping = {
            'DEPENDS_ON': 'depends on',
            'IMPLEMENTS': 'implements',
            'USES': 'uses',
            'CONTAINS': 'contains',
            'PART_OF': 'is part of',
            'BELONGS_TO': 'belongs to',
            'ASSIGNED_TO': 'is assigned to',
            'OWNED_BY': 'is owned by',
            'AUTHORED_BY': 'was authored by',
            'CREATED_BY': 'was created by',
            'RELATED_TO': 'is related to',
            'REFERENCES': 'references',
            'BLOCKS': 'blocks',
            'FOLLOWS': 'follows',
            'PRECEDES': 'precedes',
            'PRODUCES': 'produces',
            'REQUIRES': 'requires',
            'RESOLVES': 'resolves',
            'FIXES': 'fixes',
            'MANAGES': 'manages',
            'PARENT_OF': 'is parent of',
            'CHILD_OF': 'is child of'
        };

        return mapping[predicate] || predicate.toLowerCase().replace(/_/g, ' ');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: CLAIM VERIFICATION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Verify a single claim against source chunks
     * @param {Object} claim - Verbalized claim
     * @param {Array} chunks - Source chunks
     * @param {Array} chunkEmbeddings - Chunk embeddings
     * @param {Object} config - Configuration
     * @returns {Object} Verification result
     */
    async verifyClaim(claim, chunks, chunkEmbeddings, config) {
        // Embed the claim
        const claimEmbedding = await this.getEmbedding(claim.text, config);

        // Find top-k similar chunks
        const similarities = chunkEmbeddings.map((chunkEmb, idx) => ({
            chunkIdx: idx,
            similarity: this.cosineSimilarity(claimEmbedding, chunkEmb)
        }));

        similarities.sort((a, b) => b.similarity - a.similarity);
        const topK = similarities.slice(0, config.topK);

        // Determine verdict based on best similarity
        // Use BOW thresholds if in BOW mode (no embedding service)
        const isBOWMode = !this.embeddingService;
        const simThreshold = isBOWMode
            ? (config.bowSimilarityThreshold || 0.15)
            : config.similarityThreshold;
        const uncThreshold = isBOWMode
            ? (config.bowUncertainThreshold || 0.05)
            : config.uncertainThreshold;

        const bestSimilarity = topK[0]?.similarity || 0;
        let verdict;
        let confidence;

        if (bestSimilarity >= simThreshold) {
            verdict = 'grounded';
            confidence = bestSimilarity;
            this.stats.groundedClaims++;
        } else if (bestSimilarity >= uncThreshold) {
            verdict = 'uncertain';
            confidence = bestSimilarity;
            this.stats.uncertainClaims++;

            // Optional LLM verification for uncertain claims
            if (config.useLLMVerification && this.llmService) {
                const llmResult = await this.llmVerify(claim, chunks, topK, config);
                if (llmResult.verified !== null) {
                    verdict = llmResult.verified ? 'grounded' : 'hallucinated';
                    confidence = llmResult.confidence;
                    this.stats.llmVerifications++;
                }
            }
        } else {
            verdict = 'hallucinated';
            confidence = 1 - bestSimilarity;
            this.stats.hallucinatedClaims++;
        }

        // Collect evidence
        const evidence = topK.map(({ chunkIdx, similarity }) => ({
            chunk: chunks[chunkIdx],
            similarity,
            text: chunks[chunkIdx].text.substring(0, 200) + (chunks[chunkIdx].text.length > 200 ? '...' : '')
        }));

        return {
            claim,
            verdict,
            confidence,
            bestSimilarity,
            evidence,
            reasoning: this.generateReasoning(claim, verdict, bestSimilarity, evidence)
        };
    }

    /**
     * Calculate cosine similarity between two vectors
     * @param {Array} a - First vector
     * @param {Array} b - Second vector
     * @returns {number} Cosine similarity [-1, 1]
     */
    cosineSimilarity(a, b) {
        if (a.length !== b.length) {
            throw new Error('Vector dimensions must match');
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        const norm = Math.sqrt(normA) * Math.sqrt(normB);
        return norm === 0 ? 0 : dotProduct / norm;
    }

    /**
     * Generate reasoning for the verdict
     * @param {Object} claim - The claim
     * @param {string} verdict - The verdict
     * @param {number} similarity - Best similarity score
     * @param {Array} evidence - Evidence chunks
     * @returns {string} Human-readable reasoning
     */
    generateReasoning(claim, verdict, similarity, evidence) {
        const simPercent = (similarity * 100).toFixed(1);

        switch (verdict) {
            case 'grounded':
                return `Claim supported by source text (${simPercent}% similarity). ` +
                    `Evidence found in ${evidence.length} chunk(s).`;

            case 'uncertain':
                return `Partial evidence found (${simPercent}% similarity). ` +
                    `Claim may be an inference or generalization.`;

            case 'hallucinated':
                return `No supporting evidence found (${simPercent}% max similarity). ` +
                    `Claim appears to be fabricated or from external knowledge.`;

            default:
                return `Unknown verdict: ${verdict}`;
        }
    }

    /**
     * LLM verification for uncertain claims
     * @param {Object} claim - The claim to verify
     * @param {Array} chunks - All chunks
     * @param {Array} topK - Top-k similar chunks
     * @param {Object} config - Configuration
     * @returns {Object} LLM verification result
     */
    async llmVerify(claim, chunks, topK, config) {
        if (!this.llmService) {
            return { verified: null, confidence: 0 };
        }

        const evidenceText = topK.map(({ chunkIdx }) => chunks[chunkIdx].text).join('\n\n');

        const prompt = `Given the following evidence from a source document:

---EVIDENCE---
${evidenceText}
---END EVIDENCE---

Determine if the following claim is supported by the evidence:

CLAIM: ${claim.text}

Respond with:
- SUPPORTED: if the claim is directly or indirectly supported by the evidence
- NOT_SUPPORTED: if the claim contradicts or has no basis in the evidence
- UNCERTAIN: if you cannot determine

Response:`;

        try {
            const response = await this.llmService.generate(prompt, {
                model: config.llmModel,
                maxTokens: 50,
                temperature: 0
            });

            const result = response.toLowerCase();
            if (result.includes('supported') && !result.includes('not_supported')) {
                return { verified: true, confidence: 0.8 };
            } else if (result.includes('not_supported')) {
                return { verified: false, confidence: 0.8 };
            }

            return { verified: null, confidence: 0.5 };
        } catch (error) {
            return { verified: null, confidence: 0 };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 5: RESULT AGGREGATION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Aggregate verification results into a report
     * @param {Array} verifications - Individual verification results
     * @param {Array} claims - Original claims
     * @param {number} startTime - Start timestamp
     * @returns {Object} Aggregated report
     */
    aggregateResults(verifications, claims, startTime) {
        const grounded = verifications.filter(v => v.verdict === 'grounded');
        const uncertain = verifications.filter(v => v.verdict === 'uncertain');
        const hallucinated = verifications.filter(v => v.verdict === 'hallucinated');

        const totalClaims = verifications.length;

        // Calculate overall metrics
        const hallucinationRate = totalClaims > 0 ? hallucinated.length / totalClaims : 0;
        const groundingRate = totalClaims > 0 ? grounded.length / totalClaims : 0;
        const avgConfidence = totalClaims > 0
            ? verifications.reduce((sum, v) => sum + v.confidence, 0) / totalClaims
            : 0;

        // Calculate by claim type
        const byType = {
            entity: { total: 0, grounded: 0, uncertain: 0, hallucinated: 0 },
            relation: { total: 0, grounded: 0, uncertain: 0, hallucinated: 0 },
            triple: { total: 0, grounded: 0, uncertain: 0, hallucinated: 0 }
        };

        for (const v of verifications) {
            const type = v.claim.type;
            if (byType[type]) {
                byType[type].total++;
                byType[type][v.verdict]++;
            }
        }

        // Determine overall quality grade
        const grade = this.assignGrade(hallucinationRate, groundingRate);

        return {
            summary: {
                totalClaims,
                grounded: grounded.length,
                uncertain: uncertain.length,
                hallucinated: hallucinated.length,
                hallucinationRate,
                groundingRate,
                avgConfidence,
                grade
            },
            byType,
            verifications,
            groundedClaims: grounded.map(v => ({
                claim: v.claim.text,
                type: v.claim.type,
                confidence: v.confidence,
                evidence: v.evidence[0]?.text
            })),
            hallucinatedClaims: hallucinated.map(v => ({
                claim: v.claim.text,
                type: v.claim.type,
                bestMatch: v.bestSimilarity,
                reasoning: v.reasoning
            })),
            uncertainClaims: uncertain.map(v => ({
                claim: v.claim.text,
                type: v.claim.type,
                similarity: v.bestSimilarity,
                evidence: v.evidence[0]?.text
            })),
            processingTime: Date.now() - startTime,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Assign quality grade based on metrics
     * @param {number} hallucinationRate - Hallucination rate
     * @param {number} groundingRate - Grounding rate
     * @returns {string} Letter grade
     */
    assignGrade(hallucinationRate, groundingRate) {
        // Primary: penalize hallucinations heavily
        // Secondary: reward grounding
        const score = (1 - hallucinationRate * 1.5) * 0.6 + groundingRate * 0.4;

        if (score >= 0.9) return 'A';
        if (score >= 0.8) return 'B';
        if (score >= 0.7) return 'C';
        if (score >= 0.5) return 'D';
        return 'F';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UTILITY METHODS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Set embedding service
     * @param {Object} service - Embedding service with embed() method
     */
    setEmbeddingService(service) {
        this.embeddingService = service;
    }

    /**
     * Set LLM service
     * @param {Object} service - LLM service with generate() method
     */
    setLLMService(service) {
        this.llmService = service;
    }

    /**
     * Get detector statistics
     * @returns {Object} Statistics
     */
    getStats() {
        const total = this.stats.groundedClaims + this.stats.uncertainClaims + this.stats.hallucinatedClaims;
        return {
            ...this.stats,
            totalClaims: total,
            groundingRate: total > 0 ? (this.stats.groundedClaims / total * 100).toFixed(1) + '%' : '0%',
            hallucinationRate: total > 0 ? (this.stats.hallucinatedClaims / total * 100).toFixed(1) + '%' : '0%',
            cacheHitRate: this.stats.cacheHits + this.stats.cacheMisses > 0
                ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) * 100).toFixed(1) + '%'
                : '0%'
        };
    }

    /**
     * Clear caches
     */
    clearCache() {
        this.embeddingCache.clear();
        this.chunkCache.clear();
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalVerifications: 0,
            groundedClaims: 0,
            uncertainClaims: 0,
            hallucinatedClaims: 0,
            cacheHits: 0,
            cacheMisses: 0,
            llmVerifications: 0
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a hallucination detector with default configuration
 * @param {Object} options - Configuration options
 * @returns {HallucinationDetector} Detector instance
 */
function createHallucinationDetector(options = {}) {
    return new HallucinationDetector(options);
}

// Singleton instance for convenience
const hallucinationDetector = new HallucinationDetector();

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    HallucinationDetector,
    createHallucinationDetector,
    hallucinationDetector,
    DEFAULT_CONFIG
};
