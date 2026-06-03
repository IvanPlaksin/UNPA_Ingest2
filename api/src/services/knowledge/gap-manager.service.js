'use strict';
/**
 * GapManagerService
 *
 * Centralised gap management across all processes/namespaces.
 * Works with Gap nodes created by KnowledgeTriangleService:
 *   Gap { id, gapType, severity, status, title, description,
 *         identifiedBy, identifiedAt, affectedProcess,
 *         recommendation, resolution, resolvedAt,
 *         escalationHistory (JSON), snoozedUntil, createdAt, updatedAt }
 *
 * Escalation is stored on the Gap node as a JSON array in `escalationHistory`.
 * Status transitions: OPEN → ACKNOWLEDGED → ADDRESSED → CLOSED
 */

const { v4: uuidv4 } = require('uuid');

let _mg = null, _neo4j = null;
function mg()    { if (!_mg)    _mg    = require('../memgraph.service');  return _mg; }
function neo4j() { if (!_neo4j) _neo4j = require('neo4j-driver');         return _neo4j; }

const STALE_DAYS    = 90;
const REVIEW_DAYS   = 180;
const GAP_COLS = `
    gap.id AS id, gap.gapType AS gapType, gap.severity AS severity,
    gap.status AS status, gap.title AS title, gap.description AS description,
    gap.identifiedBy AS identifiedBy, gap.identifiedAt AS identifiedAt,
    gap.affectedProcess AS affectedProcess,
    gap.recommendation AS recommendation, gap.resolution AS resolution,
    gap.resolvedAt AS resolvedAt,
    gap.escalationHistory AS escalationHistory,
    gap.snoozedUntil AS snoozedUntil,
    gap.createdAt AS createdAt, gap.updatedAt AS updatedAt
`;

class GapManagerService {

    // ─── Dashboard ────────────────────────────────────────────────────────────

    async getDashboard(namespace) {
        const params = {};
        let nsFilter = '';
        if (namespace) {
            // Filter gaps via their affected process node namespace
            nsFilter = `
                OPTIONAL MATCH (proc:KnowledgeNode {id: gap.affectedProcess})
                WITH gap, proc
                WHERE proc.namespace = $ns OR gap.namespace = $ns
            `;
            params.ns = namespace;
        }

        const gapRows = await mg().runQuery(
            `MATCH (gap:Gap) WHERE gap.status IS NOT NULL
             ${nsFilter}
             RETURN gap.id as id, gap.status as status, gap.severity as severity,
                    gap.gapType as gapType, gap.identifiedAt as identifiedAt,
                    gap.snoozedUntil as snoozedUntil, gap.createdAt as createdAt`,
            params
        );

        const now = Date.now();
        let open = 0, stale = 0, inProgress = 0, closed = 0;
        let high = 0, medium = 0, low = 0;
        const aging   = { days0_30: 0, days31_60: 0, days61_90: 0, daysOver90: 0 };
        const byType  = {};

        for (const g of gapRows) {
            const s = g.status || 'OPEN';
            if (s === 'OPEN')                                 open++;
            if (s === 'ACKNOWLEDGED' || s === 'ADDRESSED')    inProgress++;
            if (s === 'CLOSED')                               closed++;

            const ref = g.identifiedAt || g.createdAt;
            const ageDays = ref ? Math.floor((now - new Date(ref).getTime()) / 86400000) : 0;
            if (s !== 'CLOSED') {
                if (ageDays > STALE_DAYS) stale++;
                if (ageDays <= 30)  aging.days0_30++;
                else if (ageDays <= 60) aging.days31_60++;
                else if (ageDays <= 90) aging.days61_90++;
                else                    aging.daysOver90++;
            }

            const sev = g.severity || 'LOW';
            if (sev === 'HIGH')   high++;
            if (sev === 'MEDIUM') medium++;
            if (sev === 'LOW')    low++;

            const type = g.gapType || 'UNKNOWN';
            byType[type] = (byType[type] || 0) + 1;
        }

        return {
            summary: { open, stale, inProgress, closed, total: gapRows.length, highOpen: high },
            aging,
            byType: Object.entries(byType).map(([type, count]) => ({ type, count }))
                         .sort((a, b) => b.count - a.count),
            bySeverity: { high, medium, low }
        };
    }

    // ─── Gap list ─────────────────────────────────────────────────────────────

    async listGaps({ namespace, status, severity, minAgeDays, maxAgeDays, search, sortBy = 'age', sortDir = 'desc', limit = 50, offset = 0 } = {}) {
        const conditions = ["gap.status IS NOT NULL"];
        const params = {
            limit: neo4j().int(limit),
            offset: neo4j().int(offset)
        };

        if (status)   { conditions.push('gap.status = $status');   params.status = status; }
        if (severity) { conditions.push('gap.severity = $sev');     params.sev = severity; }
        if (search)   {
            conditions.push('(toLower(gap.title) CONTAINS toLower($q) OR toLower(gap.gapType) CONTAINS toLower($q))');
            params.q = search;
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        // Include process name via optional join
        const cypher = `
            MATCH (gap:Gap) ${whereClause}
            OPTIONAL MATCH (proc:KnowledgeNode {id: gap.affectedProcess})
            RETURN ${GAP_COLS},
                   proc.label AS processName, proc.namespace AS processNamespace
            ORDER BY gap.identifiedAt DESC
            SKIP $offset LIMIT $limit
        `;

        const rows = await mg().runQuery(cypher, params);
        let results = rows.map(r => this._formatGap(r));

        // Post-filter by age (computed, can't easily do in Cypher)
        if (minAgeDays != null) results = results.filter(g => g.ageDays >= minAgeDays);
        if (maxAgeDays != null) results = results.filter(g => g.ageDays <= maxAgeDays);
        if (namespace) {
            results = results.filter(g => g.processNamespace === namespace || !g.processNamespace);
        }

        return results;
    }

    // ─── Escalation ───────────────────────────────────────────────────────────

    async getEscalation(gapId) {
        const rows = await mg().runQuery(
            `MATCH (gap:Gap {id: $id}) WHERE gap.status IS NOT NULL
             RETURN gap.id as id, gap.title as title, gap.identifiedAt as identifiedAt,
                    gap.createdAt as createdAt, gap.status as status, gap.severity as severity,
                    gap.escalationHistory as escalationHistory, gap.snoozedUntil as snoozedUntil`,
            { id: gapId }
        );
        if (!rows.length) return null;
        const g = rows[0];

        const ref = g.identifiedAt || g.createdAt;
        const ageDays = ref ? Math.floor((Date.now() - new Date(ref).getTime()) / 86400000) : 0;
        const staleAt   = ref ? new Date(new Date(ref).getTime() + STALE_DAYS  * 86400000).toISOString() : null;
        const reviewAt  = ref ? new Date(new Date(ref).getTime() + REVIEW_DAYS * 86400000).toISOString() : null;

        let history = [];
        try { history = JSON.parse(g.escalationHistory || '[]'); } catch { history = []; }

        return {
            gapId,
            title:     g.title,
            status:    g.status,
            severity:  g.severity,
            ageDays,
            isStale:   ageDays > STALE_DAYS,
            needsReview: ageDays > REVIEW_DAYS,
            identifiedAt: ref,
            staleAt,
            reviewAt,
            snoozedUntil: g.snoozedUntil,
            history
        };
    }

    async recordEscalation(gapId, { escalateTo, notes }) {
        const existing = await this.getEscalation(gapId);
        if (!existing) throw new Error(`Gap ${gapId} not found`);

        const entry = {
            id:            uuidv4(),
            escalatedAt:   new Date().toISOString(),
            escalatedTo:   escalateTo || 'MANAGEMENT',
            notes:         notes || '',
            type:          'ESCALATE'
        };
        const history = [...existing.history, entry];

        await mg().runQuery(
            `MATCH (gap:Gap {id: $id})
             SET gap.escalationHistory = $hist, gap.lastEscalatedAt = $now, gap.updatedAt = $now`,
            { id: gapId, hist: JSON.stringify(history), now: new Date().toISOString() }
        );
        return { gapId, escalation: entry };
    }

    async snoozeGap(gapId, days) {
        const snoozedUntil = new Date(Date.now() + days * 86400000).toISOString();
        const existing = await this.getEscalation(gapId);
        if (!existing) throw new Error(`Gap ${gapId} not found`);

        const entry = { id: uuidv4(), escalatedAt: new Date().toISOString(), type: 'SNOOZE', snoozeDays: days, snoozedUntil };
        const history = [...existing.history, entry];

        await mg().runQuery(
            `MATCH (gap:Gap {id: $id})
             SET gap.snoozedUntil = $until, gap.escalationHistory = $hist, gap.updatedAt = $now`,
            { id: gapId, until: snoozedUntil, hist: JSON.stringify(history), now: new Date().toISOString() }
        );
        return { gapId, snoozedUntil };
    }

    // ─── Bulk operations ──────────────────────────────────────────────────────

    async bulkUpdate(gapIds, action, params = {}) {
        if (!Array.isArray(gapIds) || !gapIds.length) throw new Error('gapIds must be a non-empty array');

        const results = { succeeded: 0, failed: 0, errors: [] };
        const allowed = ['acknowledge', 'address', 'close', 'snooze', 'escalate'];
        if (!allowed.includes(action)) throw new Error(`action must be one of: ${allowed.join(', ')}`);

        for (const gapId of gapIds) {
            try {
                if (action === 'acknowledge') {
                    await mg().runQuery(
                        `MATCH (gap:Gap {id: $id}) SET gap.status = 'ACKNOWLEDGED', gap.updatedAt = $now`,
                        { id: gapId, now: new Date().toISOString() }
                    );
                } else if (action === 'address') {
                    await mg().runQuery(
                        `MATCH (gap:Gap {id: $id}) SET gap.status = 'ADDRESSED', gap.updatedAt = $now`,
                        { id: gapId, now: new Date().toISOString() }
                    );
                } else if (action === 'close') {
                    await mg().runQuery(
                        `MATCH (gap:Gap {id: $id})
                         SET gap.status = 'CLOSED', gap.resolvedAt = $now, gap.resolution = $res, gap.updatedAt = $now`,
                        { id: gapId, now: new Date().toISOString(), res: params.resolution || '' }
                    );
                } else if (action === 'snooze') {
                    await this.snoozeGap(gapId, params.days || 7);
                } else if (action === 'escalate') {
                    await this.recordEscalation(gapId, { escalateTo: params.escalateTo, notes: params.notes });
                }
                results.succeeded++;
            } catch (e) {
                results.failed++;
                results.errors.push({ gapId, error: e.message });
            }
        }
        return results;
    }

    // ─── Export ───────────────────────────────────────────────────────────────

    async exportGaps(filters = {}, format = 'json') {
        const gaps = await this.listGaps({ ...filters, limit: 1000, offset: 0 });
        if (format === 'csv') {
            const header = ['id', 'title', 'gapType', 'severity', 'status', 'ageDays', 'processName', 'identifiedAt'];
            const rows = gaps.map(g => header.map(k => {
                const v = g[k] || '';
                return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
            }).join(','));
            return [header.join(','), ...rows].join('\n');
        }
        return gaps;
    }

    // ─── Formatter ────────────────────────────────────────────────────────────

    _formatGap(r) {
        const ref     = r.identifiedAt || r.createdAt;
        const ageDays = ref ? Math.floor((Date.now() - new Date(ref).getTime()) / 86400000) : null;

        let history = [];
        try { history = JSON.parse(r.escalationHistory || '[]'); } catch { history = []; }

        return {
            id:             r.id,
            gapType:        r.gapType,
            severity:       r.severity,
            status:         r.status,
            title:          r.title,
            description:    r.description,
            identifiedBy:   r.identifiedBy,
            identifiedAt:   ref,
            ageDays,
            isStale:        ageDays != null && ageDays > STALE_DAYS,
            needsReview:    ageDays != null && ageDays > REVIEW_DAYS,
            affectedProcess: r.affectedProcess,
            processName:    r.processName,
            processNamespace: r.processNamespace,
            recommendation: r.recommendation,
            resolution:     r.resolution,
            resolvedAt:     r.resolvedAt,
            snoozedUntil:   r.snoozedUntil,
            escalationCount: history.filter(e => e.type === 'ESCALATE').length,
            updatedAt:      r.updatedAt
        };
    }
}

const gapManagerService = new GapManagerService();
module.exports = { gapManagerService, GapManagerService, STALE_DAYS, REVIEW_DAYS };
