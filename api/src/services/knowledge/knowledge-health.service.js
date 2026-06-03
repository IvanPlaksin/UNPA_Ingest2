'use strict';
/**
 * KnowledgeHealthService
 *
 * Aggregates executive-level health metrics for the Knowledge Health Dashboard.
 * Works with Document, KnowledgeNode (processes), Gap, and ExtractionResult nodes.
 *
 * Health score formula (Codex KM-020 alignment):
 *   30% avg completeness   (target ≥ 0.70)
 *   25% classification rate (target 100%)
 *   25% avg KQS            (target ≥ 0.70)
 *   20% gap health         (inverse of open HIGH-severity gap ratio)
 */

let _mg = null, _neo4j = null;
function mg()    { if (!_mg)    _mg    = require('../memgraph.service');  return _mg; }
function neo4j() { if (!_neo4j) _neo4j = require('neo4j-driver');         return _neo4j; }

const LOG = '[KnowledgeHealth]';

// Completeness mirrors triangle-explorer logic
function calcCompleteness(normCount, opCount, empCount, openHigh, openMed, openLow) {
    const raw     = (Number(normCount > 0) + Number(opCount > 0) + Number(empCount > 0)) / 3;
    const penalty = openHigh * 0.15 + openMed * 0.10 + openLow * 0.05;
    return Math.max(0, Math.round((raw - penalty) * 1000) / 1000);
}

function healthScore({ avgCompleteness, classifiedPct, avgKQS, openHighGaps, totalProcesses }) {
    const complScore = Math.min(avgCompleteness / 0.70, 1) * 30;
    const classScore = (classifiedPct / 100) * 25;
    const kqsScore   = Math.min(avgKQS / 0.70, 1) * 25;
    const gapRatio   = totalProcesses > 0 ? Math.min(openHighGaps / Math.max(totalProcesses, 1), 1) : 0;
    const gapScore   = (1 - gapRatio) * 20;
    return Math.round(complScore + classScore + kqsScore + gapScore);
}

function healthLevel(score) {
    if (score >= 90) return 'EXCELLENT';
    if (score >= 70) return 'GOOD';
    if (score >= 50) return 'FAIR';
    if (score >= 30) return 'POOR';
    return 'CRITICAL';
}

class KnowledgeHealthService {

    // ─── System-wide health ───────────────────────────────────────────────────

    async getSystemHealth() {
        const driver = mg().getDriver();
        const session = driver.session();
        try {
            // Document counts
            const docRes = await session.run(`
                MATCH (d:Document)
                RETURN
                    count(d) AS total,
                    count(CASE WHEN d.classifiedAt IS NOT NULL THEN 1 END) AS classified
            `);
            const docRow = docRes.records[0];
            const totalDocs   = neo4j().integer.toNumber(docRow.get('total'));
            const classifiedDocs = neo4j().integer.toNumber(docRow.get('classified'));

            // Gap counts
            const gapRes = await session.run(`
                MATCH (g:Gap) WHERE g.status IS NOT NULL
                RETURN
                    count(CASE WHEN g.status = 'OPEN' THEN 1 END) AS open,
                    count(CASE WHEN g.status = 'OPEN' AND g.severity = 'HIGH' THEN 1 END) AS highOpen
            `);
            const gapRow = gapRes.records[0];
            const openGaps     = neo4j().integer.toNumber(gapRow.get('open'));
            const highOpenGaps = neo4j().integer.toNumber(gapRow.get('highOpen'));

            // KQS and completeness per process (KnowledgeNode with domainGraphId)
            const procRes = await session.run(`
                MATCH (p:KnowledgeNode) WHERE p.domainGraphId IS NOT NULL
                OPTIONAL MATCH (p)<-[:GOVERNS]-(n:KnowledgeNode)       WHERE n.label IN ['L0','L1','L2']
                OPTIONAL MATCH (p)<-[:OPERATIONALIZES]-(o:KnowledgeNode) WHERE o.label = 'L3'
                OPTIONAL MATCH (p)<-[:REVEALS_GAP_IN]-(e:KnowledgeNode) WHERE e.label = 'L4'
                OPTIONAL MATCH (g:Gap)-[:AFFECTS]->(p) WHERE g.status = 'OPEN' AND g.severity = 'HIGH'
                WITH p,
                     count(DISTINCT n) AS normCount,
                     count(DISTINCT o) AS opCount,
                     count(DISTINCT e) AS empCount,
                     count(DISTINCT g) AS highGaps,
                     p.kqsScore AS kqs
                RETURN count(p) AS total,
                       avg(CASE WHEN kqs IS NOT NULL THEN toFloat(kqs) ELSE 0.0 END) AS avgKQS,
                       avg(toFloat(normCount > 0) / 1.0) AS hasNorm
            `);
            const procRow  = procRes.records[0];
            const totalProc = procRow ? neo4j().integer.toNumber(procRow.get('total')) : 0;
            const avgKQS    = procRow ? (procRow.get('avgKQS') || 0) : 0;

            // Compute avg completeness via namespace aggregation
            const nsHealth = await this._getNamespacesSummary(session);
            const avgCompleteness = nsHealth.length > 0
                ? nsHealth.reduce((s, n) => s + n.completeness, 0) / nsHealth.length
                : 0;

            const classifiedPct = totalDocs > 0 ? Math.round(classifiedDocs / totalDocs * 100) : 0;
            const score = healthScore({ avgCompleteness, classifiedPct, avgKQS, openHighGaps: highOpenGaps, totalProcesses: totalProc });

            return {
                healthScore: score,
                healthLevel: healthLevel(score),
                metrics: {
                    totalDocuments:    totalDocs,
                    classifiedPercent: classifiedPct,
                    avgKQS:            Math.round(avgKQS * 100) / 100,
                    openGaps,
                    highOpenGaps,
                    totalProcesses:    totalProc,
                    avgCompleteness:   Math.round(avgCompleteness * 1000) / 1000
                },
                lastUpdated: new Date().toISOString()
            };
        } finally {
            await session.close();
        }
    }

    // ─── All namespaces summary ───────────────────────────────────────────────

    async getNamespaces() {
        const driver = mg().getDriver();
        const session = driver.session();
        try {
            return await this._getNamespacesSummary(session);
        } finally {
            await session.close();
        }
    }

    async _getNamespacesSummary(session) {
        // Distinct namespaces from Documents + KnowledgeNodes
        const nsRes = await session.run(`
            MATCH (d:Document) WHERE d.namespace IS NOT NULL
            RETURN DISTINCT d.namespace AS ns
            UNION
            MATCH (k:KnowledgeNode) WHERE k.namespace IS NOT NULL AND k.domainGraphId IS NOT NULL
            RETURN DISTINCT k.namespace AS ns
        `);
        const namespaces = nsRes.records.map(r => r.get('ns')).filter(Boolean);

        const results = [];
        for (const ns of namespaces) {
            // Docs in namespace
            const docR = await session.run(
                `MATCH (d:Document {namespace: $ns}) RETURN count(d) AS cnt`,
                { ns }
            );
            const docCount = neo4j().integer.toNumber(docR.records[0]?.get('cnt') || 0);

            // Processes and completeness
            const procR = await session.run(`
                MATCH (p:KnowledgeNode {namespace: $ns}) WHERE p.domainGraphId IS NOT NULL
                OPTIONAL MATCH (p)<-[:GOVERNS]-(n:KnowledgeNode)        WHERE n.label IN ['L0','L1','L2']
                OPTIONAL MATCH (p)<-[:OPERATIONALIZES]-(o:KnowledgeNode) WHERE o.label = 'L3'
                OPTIONAL MATCH (p)<-[:REVEALS_GAP_IN]-(e:KnowledgeNode)  WHERE e.label = 'L4'
                OPTIONAL MATCH (gH:Gap)-[:AFFECTS]->(p) WHERE gH.status = 'OPEN' AND gH.severity = 'HIGH'
                OPTIONAL MATCH (gM:Gap)-[:AFFECTS]->(p) WHERE gM.status = 'OPEN' AND gM.severity = 'MEDIUM'
                OPTIONAL MATCH (gL:Gap)-[:AFFECTS]->(p) WHERE gL.status = 'OPEN' AND gL.severity = 'LOW'
                WITH p,
                    count(DISTINCT n)  AS normC,
                    count(DISTINCT o)  AS opC,
                    count(DISTINCT e)  AS empC,
                    count(DISTINCT gH) AS hGaps,
                    count(DISTINCT gM) AS mGaps,
                    count(DISTINCT gL) AS lGaps,
                    p.kqsScore AS kqs
                RETURN
                    count(p)  AS total,
                    avg(toFloat(kqs)) AS avgKQS,
                    collect({norm: normC, op: opC, emp: empC, h: hGaps, m: mGaps, l: lGaps}) AS rows
            `, { ns });
            const procRow   = procR.records[0];
            const procCount = procRow ? neo4j().integer.toNumber(procRow.get('total')) : 0;
            const avgKQS    = procRow ? (procRow.get('avgKQS') || 0) : 0;
            const rows      = procRow ? procRow.get('rows') : [];

            const complArr = rows.map(r => calcCompleteness(
                neo4j().integer.toNumber(r.norm),
                neo4j().integer.toNumber(r.op),
                neo4j().integer.toNumber(r.emp),
                neo4j().integer.toNumber(r.h),
                neo4j().integer.toNumber(r.m),
                neo4j().integer.toNumber(r.l)
            ));
            const avgCompleteness = complArr.length > 0
                ? Math.round(complArr.reduce((a, b) => a + b, 0) / complArr.length * 1000) / 1000
                : 0;

            // Gaps
            const gapR = await session.run(`
                MATCH (g:Gap {namespace: $ns}) WHERE g.status IS NOT NULL
                RETURN count(CASE WHEN g.status = 'OPEN' THEN 1 END) AS open
            `, { ns });
            const openGaps = neo4j().integer.toNumber(gapR.records[0]?.get('open') || 0);

            // High gaps
            const highGapR = await session.run(`
                MATCH (g:Gap {namespace: $ns}) WHERE g.status = 'OPEN' AND g.severity = 'HIGH'
                RETURN count(g) AS cnt
            `, { ns });
            const highOpenGaps = neo4j().integer.toNumber(highGapR.records[0]?.get('cnt') || 0);

            const classifiedR = await session.run(`
                MATCH (d:Document {namespace: $ns}) WHERE d.classifiedAt IS NOT NULL
                RETURN count(d) AS cnt
            `, { ns });
            const classifiedDocs = neo4j().integer.toNumber(classifiedR.records[0]?.get('cnt') || 0);
            const classifiedPct  = docCount > 0 ? Math.round(classifiedDocs / docCount * 100) : 0;

            const score = healthScore({
                avgCompleteness, classifiedPct, avgKQS,
                openHighGaps: highOpenGaps, totalProcesses: procCount
            });

            results.push({
                namespace:      ns,
                documentCount:  docCount,
                processCount:   procCount,
                completeness:   avgCompleteness,
                avgKQS:         Math.round(avgKQS * 100) / 100,
                openGaps,
                healthScore:    score,
                healthLevel:    healthLevel(score)
            });
        }

        return results.sort((a, b) => b.healthScore - a.healthScore);
    }

    // ─── Namespace detail ─────────────────────────────────────────────────────

    async getNamespaceDetail(namespace) {
        const driver = mg().getDriver();
        const session = driver.session();
        try {
            // Documents by layer
            const layerRes = await session.run(`
                MATCH (d:Document {namespace: $ns})
                RETURN d.layer AS layer, count(d) AS cnt
            `, { ns: namespace });
            const byLayer = {};
            for (const r of layerRes.records) {
                const l = r.get('layer') || 'UNKNOWN';
                byLayer[l] = neo4j().integer.toNumber(r.get('cnt'));
            }

            // Processes with triangle info
            const procRes = await session.run(`
                MATCH (p:KnowledgeNode {namespace: $ns}) WHERE p.domainGraphId IS NOT NULL
                OPTIONAL MATCH (p)<-[:GOVERNS]-(n:KnowledgeNode)        WHERE n.label IN ['L0','L1','L2']
                OPTIONAL MATCH (p)<-[:OPERATIONALIZES]-(o:KnowledgeNode) WHERE o.label = 'L3'
                OPTIONAL MATCH (p)<-[:REVEALS_GAP_IN]-(e:KnowledgeNode)  WHERE e.label = 'L4'
                OPTIONAL MATCH (g:Gap)-[:AFFECTS]->(p) WHERE g.status = 'OPEN'
                WITH p,
                    count(DISTINCT n) AS normC, count(DISTINCT o) AS opC, count(DISTINCT e) AS empC,
                    count(DISTINCT g) AS openGaps, p.kqsScore AS kqs
                RETURN p.id AS id, p.label AS name, kqs, normC, opC, empC, openGaps
                ORDER BY kqs DESC
                LIMIT 50
            `, { ns: namespace });

            let full = 0, partial = 0, minimal = 0, none = 0;
            let kqsHigh = 0, kqsGood = 0, kqsFair = 0, kqsPoor = 0;
            const processes = procRes.records.map(r => {
                const normC    = neo4j().integer.toNumber(r.get('normC'));
                const opC      = neo4j().integer.toNumber(r.get('opC'));
                const empC     = neo4j().integer.toNumber(r.get('empC'));
                const openGaps = neo4j().integer.toNumber(r.get('openGaps'));
                const kqs      = parseFloat(r.get('kqs') || 0);
                const comp     = calcCompleteness(normC, opC, empC, 0, 0, 0);

                if (comp >= 1.0)  full++;
                else if (comp >= 0.67) partial++;
                else if (comp > 0)    minimal++;
                else none++;

                if (kqs >= 0.8)       kqsHigh++;
                else if (kqs >= 0.6)  kqsGood++;
                else if (kqs >= 0.4)  kqsFair++;
                else                  kqsPoor++;

                return {
                    id:           r.get('id'),
                    name:         r.get('name'),
                    kqs:          Math.round(kqs * 100) / 100,
                    completeness: comp,
                    openGaps
                };
            });

            // Gaps summary
            const gapRes = await session.run(`
                MATCH (g:Gap {namespace: $ns}) WHERE g.status IS NOT NULL
                RETURN
                    count(CASE WHEN g.status = 'OPEN' THEN 1 END) AS open,
                    count(CASE WHEN g.status = 'OPEN' AND
                        g.identifiedAt IS NOT NULL AND
                        duration.inDays(datetime(g.identifiedAt), datetime()).days > 90 THEN 1 END) AS stale,
                    count(CASE WHEN g.severity = 'HIGH'   AND g.status = 'OPEN' THEN 1 END) AS high,
                    count(CASE WHEN g.severity = 'MEDIUM' AND g.status = 'OPEN' THEN 1 END) AS medium,
                    count(CASE WHEN g.severity = 'LOW'    AND g.status = 'OPEN' THEN 1 END) AS low
            `, { ns: namespace });
            const gr = gapRes.records[0];
            const gapSummary = gr ? {
                open:   neo4j().integer.toNumber(gr.get('open')),
                stale:  neo4j().integer.toNumber(gr.get('stale')),
                bySeverity: {
                    high:   neo4j().integer.toNumber(gr.get('high')),
                    medium: neo4j().integer.toNumber(gr.get('medium')),
                    low:    neo4j().integer.toNumber(gr.get('low'))
                }
            } : { open: 0, stale: 0, bySeverity: { high: 0, medium: 0, low: 0 } };

            // Overall health for this namespace
            const docCount = Object.values(byLayer).reduce((a, b) => a + b, 0);
            const classifiedR = await session.run(
                `MATCH (d:Document {namespace: $ns}) WHERE d.classifiedAt IS NOT NULL RETURN count(d) AS cnt`,
                { ns: namespace }
            );
            const classifiedPct = docCount > 0
                ? Math.round(neo4j().integer.toNumber(classifiedR.records[0]?.get('cnt') || 0) / docCount * 100)
                : 0;
            const avgKQS = processes.length > 0
                ? processes.reduce((s, p) => s + p.kqs, 0) / processes.length
                : 0;
            const avgComp = processes.length > 0
                ? processes.reduce((s, p) => s + p.completeness, 0) / processes.length
                : 0;
            const score = healthScore({
                avgCompleteness: avgComp, classifiedPct, avgKQS,
                openHighGaps: gapSummary.bySeverity.high, totalProcesses: processes.length
            });

            return {
                namespace,
                healthScore:  score,
                healthLevel:  healthLevel(score),
                documentsByLayer: byLayer,
                triangleDistribution: { full, partial, minimal, none },
                kqsDistribution: { high: kqsHigh, good: kqsGood, fair: kqsFair, poor: kqsPoor },
                gapSummary,
                processes
            };
        } finally {
            await session.close();
        }
    }

    // ─── Activity feed ────────────────────────────────────────────────────────

    async getActivity(namespace, limit = 20) {
        const driver = mg().getDriver();
        const session = driver.session();
        try {
            const nsFilter = namespace ? `WHERE d.namespace = '${namespace.replace(/'/g, "\\'")}' ` : '';
            const nsGapFilter = namespace ? `WHERE g.namespace = '${namespace.replace(/'/g, "\\'")}' ` : '';

            const activities = [];

            // Document uploads
            const uploadRes = await session.run(`
                MATCH (d:Document) ${nsFilter}
                WHERE d.uploadedAt IS NOT NULL
                RETURN 'UPLOAD' AS type, d.id AS id, d.name AS name,
                       d.namespace AS ns, d.uploadedAt AS ts
                ORDER BY d.uploadedAt DESC LIMIT ${Math.ceil(limit / 2)}
            `);
            for (const r of uploadRes.records) {
                activities.push({
                    type:        'UPLOAD',
                    id:          r.get('id'),
                    description: `Document uploaded: ${r.get('name') || r.get('id')}`,
                    namespace:   r.get('ns'),
                    timestamp:   r.get('ts')
                });
            }

            // Classifications
            const classRes = await session.run(`
                MATCH (d:Document) ${nsFilter}
                WHERE d.classifiedAt IS NOT NULL
                RETURN 'CLASSIFY' AS type, d.id AS id, d.name AS name,
                       d.namespace AS ns, d.classifiedAt AS ts, d.documentType AS docType
                ORDER BY d.classifiedAt DESC LIMIT ${Math.ceil(limit / 2)}
            `);
            for (const r of classRes.records) {
                activities.push({
                    type:        'CLASSIFY',
                    id:          r.get('id'),
                    description: `Classified as ${r.get('docType') || 'document'}: ${r.get('name') || r.get('id')}`,
                    namespace:   r.get('ns'),
                    timestamp:   r.get('ts')
                });
            }

            // Gap events
            const gapRes = await session.run(`
                MATCH (g:Gap) ${nsGapFilter}
                WHERE g.identifiedAt IS NOT NULL
                RETURN 'GAP' AS type, g.id AS id, g.title AS title,
                       g.namespace AS ns, g.severity AS sev, g.status AS status,
                       g.identifiedAt AS ts
                ORDER BY g.identifiedAt DESC LIMIT ${Math.ceil(limit / 2)}
            `);
            for (const r of gapRes.records) {
                const status = r.get('status');
                const t = status === 'CLOSED' ? 'GAP_CLOSED' : status === 'OPEN' ? 'GAP_OPEN' : 'GAP_UPDATE';
                activities.push({
                    type:        t,
                    id:          r.get('id'),
                    description: `Gap ${status?.toLowerCase()}: ${r.get('title') || r.get('id')} [${r.get('sev')}]`,
                    namespace:   r.get('ns'),
                    timestamp:   r.get('ts')
                });
            }

            // Sort all by timestamp desc, take top N
            return activities
                .filter(a => a.timestamp)
                .sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1))
                .slice(0, limit);
        } finally {
            await session.close();
        }
    }

    // ─── Export ───────────────────────────────────────────────────────────────

    async exportNamespace(namespace, format = 'json') {
        const detail = await this.getNamespaceDetail(namespace);
        const activity = await this.getActivity(namespace, 50);

        if (format === 'csv') {
            const lines = [
                `Namespace,${namespace}`,
                `Health Score,${detail.healthScore}`,
                `Health Level,${detail.healthLevel}`,
                '',
                'Layer,Documents',
                ...Object.entries(detail.documentsByLayer).map(([l, c]) => `${l},${c}`),
                '',
                'Triangle Distribution',
                `Full,${detail.triangleDistribution.full}`,
                `Partial,${detail.triangleDistribution.partial}`,
                `Minimal,${detail.triangleDistribution.minimal}`,
                `None,${detail.triangleDistribution.none}`,
                '',
                'Gap Summary',
                `Open,${detail.gapSummary.open}`,
                `Stale,${detail.gapSummary.stale}`,
                `High Severity,${detail.gapSummary.bySeverity.high}`,
                '',
                'Process ID,Name,Completeness,KQS,Open Gaps',
                ...detail.processes.map(p =>
                    `${p.id},"${(p.name || '').replace(/"/g, '""')}",${p.completeness},${p.kqs},${p.openGaps}`
                )
            ];
            return lines.join('\n');
        }

        return { detail, activity };
    }
}

const knowledgeHealthService = new KnowledgeHealthService();
module.exports = { knowledgeHealthService, KnowledgeHealthService };
