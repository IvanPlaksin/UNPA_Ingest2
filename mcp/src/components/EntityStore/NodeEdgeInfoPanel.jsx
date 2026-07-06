/**
 * NodeEdgeInfoPanel — floating panel shown when a node or edge is selected.
 *
 * Node mode: entity details + BFS shortest path from urlEntityId to selected
 *            (both nodes AND edges in the path are displayed).
 *
 * Edge mode: relationship type, context, connected entity cards, provenance.
 */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Box, Typography, IconButton, Stack, Chip, Divider, Tooltip } from '@mui/material';
import { X, Link2, FileText, Maximize2, Zap, AlertTriangle, Database } from 'lucide-react';
import { PALETTE } from './EntityGraph2D';
import PathReportDialog from './PathReportDialog';
import { findPaths } from '../../services/entityStore.service';

const DOC_TYPES = new Set(['DOCUMENT', 'POLICY', 'RESOLUTION', 'REGULATION', 'GUIDELINE']);
const IMPACT_RISK_COLOR = { low: '#22c55e', medium: '#f59e0b', high: '#f97316', critical: '#ef4444' };

/* ── BFS shortest path (undirected) ──────────────────────────────── */
function findPath(graphData, fromId, toId) {
    if (!fromId || !toId || fromId === toId) return null;
    if (!graphData?.relationships?.length) return null;

    const adj = new Map();
    for (const r of graphData.relationships) {
        if (!adj.has(r.sourceId)) adj.set(r.sourceId, []);
        if (!adj.has(r.targetId)) adj.set(r.targetId, []);
        adj.get(r.sourceId).push(r.targetId);
        adj.get(r.targetId).push(r.sourceId);
    }

    const visited = new Set([fromId]);
    const queue   = [{ id: fromId, path: [fromId] }];
    while (queue.length) {
        const { id, path } = queue.shift();
        for (const nbId of (adj.get(id) || [])) {
            if (!visited.has(nbId)) {
                const next = [...path, nbId];
                if (nbId === toId) return next;
                visited.add(nbId);
                queue.push({ id: nbId, path: next });
            }
        }
    }
    return null;
}

/* ── Build interleaved node+edge segment list ─────────────────────── */
function buildPathSegments(path, relationships, entityMap) {
    if (!path || path.length === 0) return [];
    const segments = [];
    for (let i = 0; i < path.length; i++) {
        segments.push({ type: 'node', id: path[i], entity: entityMap.get(path[i]) });
        if (i < path.length - 1) {
            const aId = path[i], bId = path[i + 1];
            const rel = relationships?.find(r =>
                (r.sourceId === aId && r.targetId === bId) ||
                (r.sourceId === bId && r.targetId === aId)
            ) || null;
            segments.push({
                type:      'edge',
                rel,
                fromId:    aId,
                toId:      bId,
                direction: rel ? (rel.sourceId === aId ? 'forward' : 'backward') : null,
            });
        }
    }
    return segments;
}

/* ── Small helpers ───────────────────────────────────────────────── */
function Field({ label, value, mono = false }) {
    if (value === null || value === undefined || value === '') return null;
    return (
        <Box sx={{ display: 'flex', gap: 1.25, py: 0.45, alignItems: 'flex-start' }}>
            <Typography sx={{
                fontSize: '0.6rem', color: '#94a3b8', minWidth: 80, flexShrink: 0, pt: 0.2,
                textTransform: 'uppercase', letterSpacing: '0.055em', fontWeight: 700,
            }}>
                {label}
            </Typography>
            <Typography sx={{
                fontSize: mono ? '0.7rem' : '0.76rem',
                color: '#b0bec5',
                fontFamily: mono ? 'monospace' : undefined,
                lineHeight: 1.4, wordBreak: 'break-word',
            }}>
                {String(value)}
            </Typography>
        </Box>
    );
}

function EntityCard({ entity, roleLabel }) {
    if (!entity) return null;
    const c = PALETTE[(entity.type || '').toUpperCase()] || PALETTE.default;
    return (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
            <Typography sx={{
                fontSize: '0.6rem', color: '#94a3b8', minWidth: 26, flexShrink: 0, pt: 0.4,
                textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em',
            }}>
                {roleLabel}
            </Typography>
            <Box sx={{ flex: 1, bgcolor: `${c.border}12`, border: `1px solid ${c.border}45`, borderRadius: 1, px: 0.9, py: 0.5 }}>
                <Typography sx={{ fontSize: '0.59rem', color: c.text, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.15 }}>
                    {entity.type}
                </Typography>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#f1f5f9', lineHeight: 1.3 }}>
                    {entity.name}
                </Typography>
                {entity.namespace && (
                    <Typography sx={{ fontSize: '0.6rem', color: '#64748b', mt: 0.15 }}>{entity.namespace}</Typography>
                )}
            </Box>
        </Box>
    );
}

function SectionHeader({ label }) {
    return (
        <Typography sx={{
            fontSize: '0.59rem', color: '#94a3b8',
            textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700,
            mb: 0.6,
        }}>
            {label}
        </Typography>
    );
}

/* ── Compact path display (nodes + edges) ────────────────────────── */
function PathStep({ entity, isFirst, isLast }) {
    const c = entity ? (PALETTE[(entity.type || '').toUpperCase()] || PALETTE.default) : PALETTE.default;
    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: c.border, flexShrink: 0, ml: 0.15, border: `1px solid ${c.border}80` }} />
                <Box>
                    {entity?.type && (
                        <Typography sx={{ fontSize: '0.58rem', color: c.text, textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>
                            {entity.type}
                        </Typography>
                    )}
                    <Typography sx={{
                        fontSize: '0.75rem',
                        color: (isFirst || isLast) ? '#f1f5f9' : '#94a3b8',
                        fontWeight: (isFirst || isLast) ? 600 : 400,
                        lineHeight: 1.3,
                    }}>
                        {entity?.name || '?'}
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
}

function PathDisplay({ segments }) {
    if (!segments || segments.length === 0) return null;

    const nodeIds = segments.filter(s => s.type === 'node').map(s => s.id);
    const firstId = nodeIds[0];
    const lastId  = nodeIds[nodeIds.length - 1];

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {segments.map((seg, idx) => {
                if (seg.type === 'node') {
                    return (
                        <PathStep
                            key={`n-${seg.id || idx}`}
                            entity={seg.entity}
                            isFirst={seg.id === firstId}
                            isLast={seg.id === lastId}
                        />
                    );
                }
                /* edge segment */
                return (
                    <Box key={`e-${idx}`} sx={{ ml: 0.5, pl: 0.9, borderLeft: '1px dashed #2d3748', py: 0.3, mt: 0.1 }}>
                        <Typography sx={{ fontSize: '0.6rem', color: '#7c3aed', letterSpacing: '0.03em' }}>
                            ↓ {seg.rel?.relType || '—'}
                        </Typography>
                        {seg.rel?.context && (
                            <Typography sx={{
                                fontSize: '0.58rem', color: '#64748b', fontStyle: 'italic', mt: 0.12,
                                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                            }}>
                                "{seg.rel.context}"
                            </Typography>
                        )}
                    </Box>
                );
            })}
        </Box>
    );
}

/* ── Inline structural summary ────────────────────────────────────── */
function InlineConnectionSummary({ analysis }) {
    if (!analysis) return null;
    const RC = { HIGH: '#22c55e', MODERATE: '#eab308', FRAGILE: '#ef4444' };
    const color = RC[analysis.connectionRobustness] || '#64748b';
    return (
        <Box sx={{
            mt: 1.25, px: 1.25, py: 1, bgcolor: 'rgba(0, 158, 219, 0.08)',
            borderRadius: 1, borderLeft: '3px solid #009EDB',
        }}>
            <Typography sx={{ fontSize: '0.6rem', color: '#009EDB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', mb: 0.4 }}>
                Connection Analysis
            </Typography>
            <Typography sx={{ fontSize: '0.72rem', color: '#b0bec5' }}>
                <span style={{ color, fontWeight: 700 }}>{analysis.connectionRobustness}</span>{' '}
                · {analysis.independentPathCount} independent path{analysis.independentPathCount !== 1 ? 's' : ''}
                {analysis.articulationPoints?.length > 0 && (
                    <span style={{ color: '#ef4444' }}> · ⚠ bottleneck</span>
                )}
            </Typography>
        </Box>
    );
}

/* ── Main component ──────────────────────────────────────────────── */
export default function NodeEdgeInfoPanel({
    entity,
    edge,
    graphData,
    urlEntityId,
    onClose,
}) {
    const [reportOpen, setReportOpen] = useState(false);
    const [weightedPathData, setWeightedPathData] = useState(null);
    const [impactSummary, setImpactSummary] = useState(null);
    const [supersessionStatus, setSupersessionStatus] = useState(null);
    const [evidenceCount, setEvidenceCount] = useState(null);
    const fetchKeyRef = useRef(null);

    const isEdge = !!edge && !entity;
    const isNode = !!entity;

    /* Entity lookup map */
    const entityMap = useMemo(() => {
        const m = new Map();
        for (const e of (graphData?.entities || [])) m.set(e.id, e);
        return m;
    }, [graphData]);

    /* Edge-connected entities */
    const srcEntity = useMemo(() => edge?.sourceId ? entityMap.get(edge.sourceId) || null : null, [edge, entityMap]);
    const tgtEntity = useMemo(() => edge?.targetId ? entityMap.get(edge.targetId) || null : null, [edge, entityMap]);

    /* BFS path */
    const path = useMemo(() => {
        if (!isNode || !urlEntityId || urlEntityId === entity?.id) return null;
        return findPath(graphData, urlEntityId, entity.id);
    }, [isNode, entity, urlEntityId, graphData]);

    /* Interleaved node + edge segments */
    const pathSegments = useMemo(() => {
        if (!path) return null;
        return buildPathSegments(path, graphData?.relationships, entityMap);
    }, [path, graphData, entityMap]);

    const urlEntity = useMemo(() => urlEntityId ? entityMap.get(urlEntityId) : null, [urlEntityId, entityMap]);

    /* Fetch weighted path data from API (for structural analysis) */
    useEffect(() => {
        if (!isNode || !urlEntityId || urlEntityId === entity?.id) {
            setWeightedPathData(null);
            return;
        }
        const key = `${urlEntityId}→${entity.id}`;
        fetchKeyRef.current = key;
        findPaths(urlEntityId, entity.id, 5).then(data => {
            if (fetchKeyRef.current === key) setWeightedPathData(data);
        }).catch(() => {});
    }, [isNode, entity?.id, urlEntityId]);

    /* Fetch impact summary for selected node */
    useEffect(() => {
        if (!isNode || !entity?.id) { setImpactSummary(null); return; }
        fetch(`/api/v1/entity-store/${entity.id}/impact-summary`)
            .then(r => r.ok ? r.json() : null)
            .then(r => { if (r?.success) setImpactSummary(r.data); })
            .catch(() => {});
    }, [isNode, entity?.id]);

    /* Fetch supersession status for document-type nodes */
    useEffect(() => {
        if (!isNode || !entity?.id || !DOC_TYPES.has((entity.type || '').toUpperCase())) {
            setSupersessionStatus(null); return;
        }
        fetch(`/api/v1/entity-store/${entity.id}/is-in-force`)
            .then(r => r.ok ? r.json() : null)
            .then(r => { if (r?.success) setSupersessionStatus(r.data); })
            .catch(() => {});
    }, [isNode, entity?.id, entity?.type]);

    /* Fetch evidence count for selected edge */
    useEffect(() => {
        if (!isEdge || !edge?.sourceId || !edge?.targetId) { setEvidenceCount(null); return; }
        fetch(`/api/v1/entity-store/evidence?sourceId=${edge.sourceId}&targetId=${edge.targetId}&relType=${edge.relType || ''}`)
            .then(r => r.ok ? r.json() : null)
            .then(r => { if (r?.success) setEvidenceCount(r.data?.length ?? 0); })
            .catch(() => {});
    }, [isEdge, edge?.sourceId, edge?.targetId, edge?.relType]);

    if (!isNode && !isEdge) return null;

    const typeKey = (entity?.type || '').toUpperCase();
    const c       = PALETTE[typeKey] || PALETTE.default;

    return (
        <>
            <Box sx={{
                position: 'absolute', right: 8, top: 8,
                width: 290,
                maxHeight: 'calc(100% - 16px)',
                bgcolor: 'rgba(10, 13, 20, 0.93)',
                backdropFilter: 'blur(10px)',
                border: '1px solid #1e293b',
                borderRadius: 2,
                display: 'flex', flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 4px 28px rgba(0,0,0,0.55)',
                zIndex: 20,
                pointerEvents: 'auto',
            }}>
                {/* ── Header ── */}
                <Box sx={{
                    px: 1.4, py: 0.85,
                    borderBottom: '1px solid #1e293b',
                    bgcolor: '#0d1117',
                    display: 'flex', alignItems: 'center', gap: 0.9,
                    flexShrink: 0,
                }}>
                    {isEdge ? (
                        <Link2 size={12} style={{ color: '#7c3aed', flexShrink: 0 }} />
                    ) : (
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c.border, flexShrink: 0 }} />
                    )}
                    <Typography sx={{
                        fontSize: '0.8rem', fontWeight: 700, color: '#f1f5f9', flex: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {isEdge ? (edge.relType || 'Relationship') : (entity?.name || entity?.id)}
                    </Typography>
                    <IconButton size="small" onClick={onClose}
                        sx={{ p: 0.3, color: '#94a3b8', '&:hover': { color: '#e2e8f0', bgcolor: '#ffffff10' } }}>
                        <X size={12} />
                    </IconButton>
                </Box>

                {/* ── Scrollable body ── */}
                <Box sx={{ flex: 1, overflowY: 'auto', p: 1.25 }}>

                    {/* ════ NODE INFO ════ */}
                    {isNode && (
                        <>
                            <Stack direction="row" flexWrap="wrap" gap={0.5} mb={1.25}>
                                <Chip label={entity.type} size="small"
                                    sx={{ bgcolor: `${c.border}22`, color: c.text, border: `1px solid ${c.border}55`, fontSize: '0.63rem', height: 19 }} />
                                {entity.namespace && (
                                    <Chip label={entity.namespace} size="small"
                                        sx={{ bgcolor: '#1e293b', color: '#94a3b8', fontSize: '0.63rem', height: 19 }} />
                                )}
                                {entity.epistemicLayer && (
                                    <Chip label={entity.epistemicLayer} size="small"
                                        sx={{ bgcolor: '#7c3aed22', color: '#a78bfa', border: '1px solid #7c3aed55', fontSize: '0.63rem', height: 19 }} />
                                )}
                            </Stack>

                            {/* Impact summary badge */}
                            {impactSummary && impactSummary.total > 0 && (
                                <Stack direction="row" gap={0.5} mb={0.75} flexWrap="wrap">
                                    <Chip
                                        icon={<Zap size={9} style={{ color: IMPACT_RISK_COLOR[impactSummary.riskLevel] || '#94a3b8' }} />}
                                        label={`${(impactSummary.riskLevel || 'low').toUpperCase()} impact · ${impactSummary.total} dep.`}
                                        size="small"
                                        sx={{
                                            fontSize: '0.58rem', height: 18,
                                            bgcolor: (IMPACT_RISK_COLOR[impactSummary.riskLevel] || '#94a3b8') + '22',
                                            color: IMPACT_RISK_COLOR[impactSummary.riskLevel] || '#94a3b8',
                                            border: `1px solid ${(IMPACT_RISK_COLOR[impactSummary.riskLevel] || '#94a3b8')}55`,
                                        }}
                                    />
                                </Stack>
                            )}

                            {/* Supersession status for document-type nodes */}
                            {supersessionStatus != null && !supersessionStatus.isInForce && (
                                <Stack direction="row" mb={0.75}>
                                    <Chip
                                        icon={<AlertTriangle size={9} style={{ color: '#f97316' }} />}
                                        label={supersessionStatus.supersededByName
                                            ? `Superseded by: ${supersessionStatus.supersededByName}`
                                            : 'Superseded — not in force'}
                                        size="small"
                                        sx={{ fontSize: '0.58rem', height: 18, bgcolor: '#f9731622', color: '#f97316', border: '1px solid #f9731655' }}
                                    />
                                </Stack>
                            )}

                            <Field label="ID"          value={entity.id}          mono />
                            <Field label="Description" value={entity.description} />
                            <Field label="Category"    value={entity.category} />
                            <Field label="Mentions"    value={entity.mentionCount > 0 ? entity.mentionCount : null} />
                            <Field label="Created"     value={entity.createdAt ? new Date(entity.createdAt).toLocaleString() : null} />

                            {/* Provenance */}
                            {(entity.provenanceDocTitle || entity.provenanceDocSymbol || entity.provenanceSources) && (
                                <>
                                    <Divider sx={{ my: 1, borderColor: '#1e293b' }} />
                                    <SectionHeader label="Provenance" />
                                    {entity.provenanceDocSymbol && (
                                        <Box sx={{ display: 'inline-block', bgcolor: '#1e3a5f', px: 0.75, py: 0.2, borderRadius: 0.75, mb: 0.5 }}>
                                            <Typography sx={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#93c5fd' }}>
                                                {entity.provenanceDocSymbol}
                                            </Typography>
                                        </Box>
                                    )}
                                    <Field label="Document" value={entity.provenanceDocTitle} />
                                    <Field label="Imported" value={entity.provenanceImportedAt
                                        ? new Date(entity.provenanceImportedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                                        : null
                                    } />
                                    {Array.isArray(entity.provenanceSources) && entity.provenanceSources.length > 0 && (
                                        <Box sx={{ mt: 0.5 }}>
                                            <Typography sx={{ fontSize: '0.6rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.055em', fontWeight: 700, mb: 0.4 }}>
                                                Sources
                                            </Typography>
                                            <Stack direction="row" flexWrap="wrap" gap={0.4}>
                                                {entity.provenanceSources.slice(0, 6).map((src, i) => (
                                                    <Chip key={i} label={src} size="small"
                                                        sx={{ bgcolor: '#1e293b', color: '#64748b', fontSize: '0.6rem', height: 17 }} />
                                                ))}
                                            </Stack>
                                        </Box>
                                    )}
                                </>
                            )}

                            {/* Path from URL entity */}
                            {urlEntityId && urlEntityId !== entity.id && (
                                <>
                                    <Divider sx={{ my: 1, borderColor: '#1e293b' }} />
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.6 }}>
                                        <SectionHeader label={`Path from "${urlEntity?.name || urlEntityId}"`} />
                                        {pathSegments && (
                                            <Tooltip title="Open full path report">
                                                <IconButton size="small" onClick={() => setReportOpen(true)}
                                                    sx={{ p: 0.3, color: '#94a3b8', ml: 0.5, mb: 0.6,
                                                        '&:hover': { color: '#a78bfa', bgcolor: '#7c3aed20' } }}>
                                                    <Maximize2 size={12} />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                    </Box>
                                    {pathSegments === null ? (
                                        <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                            No path found in current graph
                                        </Typography>
                                    ) : (
                                        <>
                                            <PathDisplay segments={pathSegments} />
                                            <InlineConnectionSummary analysis={weightedPathData?.structuralAnalysis} />
                                        </>
                                    )}
                                </>
                            )}
                        </>
                    )}

                    {/* ════ EDGE INFO ════ */}
                    {isEdge && (
                        <>
                            <Stack direction="row" mb={1.25}>
                                <Chip label={edge.relType || 'RELATED_TO'} size="small"
                                    sx={{ bgcolor: '#7c3aed22', color: '#a78bfa', border: '1px solid #7c3aed55', fontSize: '0.65rem', height: 20 }} />
                                {edge.confidence != null && (
                                    <Chip label={`${Math.round(edge.confidence * 100)}% confidence`} size="small"
                                        sx={{ ml: 0.5, bgcolor: '#1e293b', color: '#64748b', fontSize: '0.63rem', height: 20 }} />
                                )}
                            </Stack>

                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 1 }}>
                                <EntityCard entity={srcEntity} roleLabel="From" />
                                <Box sx={{ px: 1.5 }}>
                                    <Typography sx={{ fontSize: '0.63rem', color: '#7c3aed88', letterSpacing: '0.04em' }}>
                                        ↓ {edge.relType || 'RELATED_TO'}
                                    </Typography>
                                </Box>
                                <EntityCard entity={tgtEntity} roleLabel="To" />
                            </Box>

                            {edge.context && (
                                <>
                                    <Divider sx={{ my: 1, borderColor: '#1e293b' }} />
                                    <SectionHeader label="Context" />
                                    <Box sx={{ bgcolor: '#1e293b60', borderLeft: '3px solid #7c3aed', borderRadius: '0 6px 6px 0', p: '8px 10px' }}>
                                        <Typography sx={{ fontSize: '0.73rem', color: '#cbd5e1', fontStyle: 'italic', lineHeight: 1.55 }}>
                                            "{edge.context}"
                                        </Typography>
                                    </Box>
                                </>
                            )}

                            {edge.provenance && (
                                <>
                                    <Divider sx={{ my: 1, borderColor: '#1e293b' }} />
                                    <SectionHeader label="Provenance" />
                                    <Field label="Document" value={edge.provenance.docTitle} />
                                    <Field label="Symbol"   value={edge.provenance.docSymbol} mono />
                                </>
                            )}

                            {/* Evidence count */}
                            {evidenceCount != null && (
                                <>
                                    <Divider sx={{ my: 1, borderColor: '#1e293b' }} />
                                    <Stack direction="row" alignItems="center" gap={0.6}>
                                        <Database size={10} style={{ color: '#64748b', flexShrink: 0 }} />
                                        <Typography sx={{ fontSize: '0.65rem', color: evidenceCount > 0 ? '#93c5fd' : '#475569' }}>
                                            {evidenceCount > 0
                                                ? `${evidenceCount} evidence source${evidenceCount !== 1 ? 's' : ''}`
                                                : 'No evidence sources recorded'}
                                        </Typography>
                                    </Stack>
                                </>
                            )}
                        </>
                    )}
                </Box>
            </Box>

            {/* ── Full path report dialog ── */}
            {reportOpen && pathSegments && (
                <PathReportDialog
                    open={reportOpen}
                    onClose={() => setReportOpen(false)}
                    segments={pathSegments}
                    fromEntity={urlEntity}
                    toEntity={entity}
                    structuralAnalysis={weightedPathData?.structuralAnalysis}
                    pathsData={weightedPathData?.paths}
                />
            )}
        </>
    );
}
