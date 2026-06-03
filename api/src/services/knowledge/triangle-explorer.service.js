'use strict';
/**
 * TriangleExplorerService
 *
 * Aggregates Knowledge Triangle data for the Triangle Explorer UI.
 * Works with KnowledgeNode "process" nodes and their triangle edges:
 *   KnowledgeNode ←──GOVERNS──────── KnowledgeNode (L0-L2 normative)
 *   KnowledgeNode ←──OPERATIONALIZES─ KnowledgeNode (L3 operational)
 *   KnowledgeNode ←──REVEALS_GAP_IN── KnowledgeNode (L4 empirical)
 *   KnowledgeNode ←──AFFECTS────────  Gap
 *
 * Also supports Document nodes (uploaded via DocumentProcessingService)
 * linked to process nodes via the same triangle edges.
 */

let _mg = null, _neo4j = null;
function mg()    { if (!_mg)    _mg    = require('../memgraph.service');  return _mg; }
function neo4j() { if (!_neo4j) _neo4j = require('neo4j-driver');         return _neo4j; }

const LOG_PREFIX = '[TriangleExplorer]';

// ─── Completeness calculation (mirrors triangle service logic) ────────────────
function calcCompleteness(normCount, opCount, empCount, openHigh, openMed, openLow) {
    const hasN = normCount > 0, hasO = opCount > 0, hasE = empCount > 0;
    const raw     = (Number(hasN) + Number(hasO) + Number(hasE)) / 3;
    const penalty = openHigh * 0.15 + openMed * 0.10 + openLow * 0.05;
    return Math.max(0, Math.round((raw - penalty) * 1000) / 1000);
}

function completenessLabel(score) {
    if (score >= 1.0)  return 'full';
    if (score >= 0.67) return 'partial';
    if (score > 0)     return 'minimal';
    return 'none';
}

class TriangleExplorerService {

    // ─── Process list ─────────────────────────────────────────────────────────

    /**
     * List KnowledgeNode "processes" with aggregated triangle summary.
     *
     * @param {object} options
     * @param {string}  options.namespace  — filter by namespace
     * @param {string}  options.search     — text search on label/content
     * @param {string}  options.completeness — 'full'|'partial'|'minimal'|'none'
     * @param {boolean} options.hasGaps    — only processes with open gaps
     * @param {string}  options.sortBy     — 'completeness'|'name'|'gaps'|'kqs'
     * @param {number}  options.limit
     * @param {number}  options.offset
     */
    async listProcesses({ namespace, search, completeness, hasGaps, sortBy = 'completeness', limit = 50, offset = 0 } = {}) {
        // Batch triangle query — all in one pass with OPTIONAL MATCH
        let cypher = `
            MATCH (proc:KnowledgeNode)
            OPTIONAL MATCH (norm:KnowledgeNode)-[:GOVERNS]->(proc)
            OPTIONAL MATCH (op:KnowledgeNode)-[:OPERATIONALIZES]->(proc)
            OPTIONAL MATCH (emp:KnowledgeNode)-[:REVEALS_GAP_IN]->(gapNode:Gap)-[:AFFECTS]->(proc)
            OPTIONAL MATCH (gapAff:Gap {status: 'OPEN'})-[:AFFECTS]->(proc)
            WITH proc,
                 collect(DISTINCT norm) AS norms,
                 collect(DISTINCT op) AS ops,
                 collect(DISTINCT emp) AS emps,
                 collect(DISTINCT gapAff) AS openGaps
            WITH proc,
                 size(norms) AS normCount, size(ops) AS opCount, size(emps) AS empCount,
                 size(openGaps) AS gapCount,
                 size([g IN openGaps WHERE g.severity = 'HIGH'])   AS highGaps,
                 size([g IN openGaps WHERE g.severity = 'MEDIUM']) AS medGaps,
                 size([g IN openGaps WHERE g.severity = 'LOW'])    AS lowGaps
        `;

        const conditions = [];
        const params = {
            limit: neo4j().int(limit),
            offset: neo4j().int(offset)
        };

        if (namespace) {
            conditions.push('proc.namespace = $ns');
            params.ns = namespace;
        }
        if (search) {
            conditions.push('(toLower(proc.label) CONTAINS toLower($search) OR toLower(proc.content) CONTAINS toLower($search))');
            params.search = search;
        }

        if (conditions.length) {
            cypher += ` WHERE ${conditions.join(' AND ')}`;
        }

        cypher += `
            RETURN proc.id AS id,
                   proc.label AS label,
                   proc.content AS content,
                   proc.namespace AS namespace,
                   proc.epistemicLayer AS epistemicLayer,
                   proc.kqs_score AS kqsScore,
                   normCount, opCount, empCount, gapCount,
                   highGaps, medGaps, lowGaps
            ORDER BY normCount + opCount + empCount DESC, proc.label ASC
            SKIP $offset LIMIT $limit
        `;

        const rows = await mg().runQuery(cypher, params);
        let results = rows.map(r => {
            const comp = calcCompleteness(
                Number(r.normCount || 0), Number(r.opCount || 0), Number(r.empCount || 0),
                Number(r.highGaps || 0), Number(r.medGaps || 0), Number(r.lowGaps || 0)
            );
            return {
                id:            r.id,
                name:          r.label || r.content?.substring(0, 80) || r.id,
                namespace:     r.namespace,
                epistemicLayer: r.epistemicLayer,
                kqsScore:      r.kqsScore,
                completeness:  comp,
                completenessLabel: completenessLabel(comp),
                counts: {
                    normative:    Number(r.normCount || 0),
                    operational:  Number(r.opCount   || 0),
                    empirical:    Number(r.empCount   || 0),
                    gaps:         Number(r.gapCount   || 0),
                }
            };
        });

        // Post-filter (completeness, hasGaps) — done in-memory after fetch
        if (completeness) {
            results = results.filter(r => r.completenessLabel === completeness);
        }
        if (hasGaps) {
            results = results.filter(r => r.counts.gaps > 0);
        }

        return results;
    }

    // ─── Triangle detail ──────────────────────────────────────────────────────

    /**
     * Get the full Knowledge Triangle for a process node.
     * Returns normative, operational, empirical documents + gaps + completeness.
     */
    async getProcessTriangle(processId) {
        const [proc, normRows, opRows, empRows, gapRows] = await Promise.all([
            // Process node
            mg().runQuery(
                `MATCH (n:KnowledgeNode {id: $id})
                 RETURN n.id as id, n.label as label, n.content as content,
                        n.namespace as namespace, n.epistemicLayer as epistemicLayer,
                        n.kqs_score as kqsScore`,
                { id: processId }
            ),
            // Normative documents (GOVERNS)
            mg().runQuery(
                `MATCH (src:KnowledgeNode)-[r:GOVERNS]->(proc:KnowledgeNode {id: $id})
                 RETURN src.id as id, src.label as label, src.content as content,
                        src.epistemicLayer as layer, src.kqs_score as kqsScore,
                        src.documentType as documentType,
                        r.createdAt as edgeCreatedAt`,
                { id: processId }
            ),
            // Operational documents (OPERATIONALIZES)
            mg().runQuery(
                `MATCH (src:KnowledgeNode)-[r:OPERATIONALIZES]->(proc:KnowledgeNode {id: $id})
                 RETURN src.id as id, src.label as label, src.content as content,
                        src.epistemicLayer as layer, src.kqs_score as kqsScore,
                        src.documentType as documentType,
                        r.createdAt as edgeCreatedAt`,
                { id: processId }
            ),
            // Empirical documents (REVEALS_GAP_IN → Gap → proc)
            mg().runQuery(
                `MATCH (src:KnowledgeNode)-[r:REVEALS_GAP_IN]->(gap:Gap)-[:AFFECTS]->(proc:KnowledgeNode {id: $id})
                 RETURN src.id as id, src.label as label, src.content as content,
                        src.epistemicLayer as layer, src.kqs_score as kqsScore,
                        src.documentType as documentType,
                        gap.id as gapId, gap.severity as gapSeverity`,
                { id: processId }
            ),
            // Gaps
            mg().runQuery(
                `MATCH (gap:Gap)-[:AFFECTS]->(proc:KnowledgeNode {id: $id})
                 RETURN gap.id as id, gap.gapType as gapType, gap.severity as severity,
                        gap.status as status, gap.title as title,
                        gap.description as description,
                        gap.identifiedBy as identifiedBy,
                        gap.identifiedAt as identifiedAt,
                        gap.recommendation as recommendation,
                        gap.createdAt as createdAt`,
                { id: processId }
            )
        ]);

        if (!proc.length) return null;
        const p = proc[0];

        const normative   = normRows.map(r => this._formatDoc(r));
        const operational = opRows.map(r => this._formatDoc(r));
        const empirical   = empRows.map(r => this._formatDoc(r));
        const gaps        = gapRows.map(r => this._formatGap(r));

        const openHigh = gaps.filter(g => g.status === 'OPEN' && g.severity === 'HIGH').length;
        const openMed  = gaps.filter(g => g.status === 'OPEN' && g.severity === 'MEDIUM').length;
        const openLow  = gaps.filter(g => g.status === 'OPEN' && g.severity === 'LOW').length;
        const comp     = calcCompleteness(normative.length, operational.length, empirical.length, openHigh, openMed, openLow);

        const missingVertices = [
            !normative.length   && 'NORMATIVE',
            !operational.length && 'OPERATIONAL',
            !empirical.length   && 'EMPIRICAL'
        ].filter(Boolean);

        return {
            process: {
                id:            p.id,
                name:          p.label || p.content?.substring(0, 100) || p.id,
                description:   p.content,
                namespace:     p.namespace,
                epistemicLayer: p.epistemicLayer,
                kqsScore:      p.kqsScore
            },
            completeness: {
                score:           comp,
                label:           completenessLabel(comp),
                vertices: {
                    normative:   { present: normative.length > 0,   count: normative.length },
                    operational: { present: operational.length > 0, count: operational.length },
                    empirical:   { present: empirical.length > 0,   count: empirical.length }
                },
                missingVertices,
                gapPenalty: Math.round((openHigh * 0.15 + openMed * 0.10 + openLow * 0.05) * 1000) / 1000
            },
            normative,
            operational,
            empirical,
            gaps
        };
    }

    // ─── Link / Unlink ────────────────────────────────────────────────────────

    /**
     * Manually link a document/node to a process via a triangle edge.
     * @param {string} processId
     * @param {string} documentId  — KnowledgeNode or Document node
     * @param {string} edgeType    — 'GOVERNS' | 'OPERATIONALIZES' | 'REVEALS_GAP_IN'
     */
    async linkDocumentToProcess(processId, documentId, edgeType) {
        const allowed = ['GOVERNS', 'OPERATIONALIZES', 'REVEALS_GAP_IN'];
        if (!allowed.includes(edgeType)) {
            throw new Error(`edgeType must be one of: ${allowed.join(', ')}`);
        }

        // Verify both nodes exist
        const check = await mg().runQuery(
            `MATCH (src {id: $srcId}), (proc:KnowledgeNode {id: $procId})
             RETURN src.id as srcId, proc.id as procId`,
            { srcId: documentId, procId: processId }
        );
        if (!check.length) throw new Error('Source or target node not found');

        if (edgeType === 'REVEALS_GAP_IN') {
            // Create a Gap node between document and process
            const { v4: uuidv4 } = require('uuid');
            const gapId = uuidv4();
            await mg().runQuery(
                `MATCH (src {id: $srcId}), (proc:KnowledgeNode {id: $procId})
                 CREATE (gap:Gap {
                   id: $gapId, gapType: 'KNOWLEDGE', severity: 'MEDIUM', status: 'OPEN',
                   title: 'Manual gap link', identifiedAt: $now, createdAt: $now
                 })
                 CREATE (src)-[:REVEALS_GAP_IN]->(gap)-[:AFFECTS]->(proc)`,
                { srcId: documentId, procId: processId, gapId, now: new Date().toISOString() }
            );
            return { edgeType, sourceId: documentId, targetId: processId, gapId };
        }

        await mg().runQuery(
            `MATCH (src {id: $srcId}), (proc:KnowledgeNode {id: $procId})
             MERGE (src)-[r:${edgeType}]->(proc)
             ON CREATE SET r.createdAt = $now`,
            { srcId: documentId, procId: processId, now: new Date().toISOString() }
        );
        return { edgeType, sourceId: documentId, targetId: processId };
    }

    /**
     * Remove a triangle edge between a document and a process.
     */
    async unlinkDocumentFromProcess(processId, documentId) {
        await mg().runQuery(
            `MATCH (src {id: $srcId})-[r:GOVERNS|OPERATIONALIZES]->(proc:KnowledgeNode {id: $procId})
             DELETE r`,
            { srcId: documentId, procId: processId }
        );
        return { unlinked: true };
    }

    // ─── Formatters ───────────────────────────────────────────────────────────

    _formatDoc(r) {
        return {
            id:           r.id,
            name:         r.label || r.content?.substring(0, 80) || r.id,
            layer:        r.layer,
            kqsScore:     r.kqsScore,
            documentType: r.documentType,
            edgeCreatedAt: r.edgeCreatedAt
        };
    }

    _formatGap(r) {
        const identifiedAt = r.identifiedAt || r.createdAt;
        const ageMs  = identifiedAt ? Date.now() - new Date(identifiedAt).getTime() : null;
        const ageDays = ageMs ? Math.floor(ageMs / 86400000) : null;
        return {
            id:             r.id,
            gapType:        r.gapType,
            severity:       r.severity,
            status:         r.status,
            title:          r.title,
            description:    r.description,
            identifiedBy:   r.identifiedBy,
            identifiedAt:   identifiedAt,
            ageDays,
            isStale:        ageDays != null && ageDays > 90,
            recommendation: r.recommendation
        };
    }
}

const triangleExplorerService = new TriangleExplorerService();
module.exports = { triangleExplorerService, TriangleExplorerService };
