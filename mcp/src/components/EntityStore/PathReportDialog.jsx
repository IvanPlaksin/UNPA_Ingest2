/**
 * PathReportDialog — full path from root entity to selected entity,
 * displayed in UN official report style with complete node and edge
 * information including relationship context and document provenance.
 */
import React, { useState } from 'react';
import { Box, Button, CircularProgress, Dialog, IconButton, Paper, Typography, Stack, Chip, Divider } from '@mui/material';
import { X, FileText, Link2, AlertTriangle, CheckCircle, Sparkles } from 'lucide-react';
import * as entityStoreService from '../../services/entityStore.service';
import { PALETTE } from './EntityGraph2D';

/* ── Persistence ─────────────────────────────────────────────────── */
const SIZE_KEY = 'es.pathReportDialogSize';
function loadSize() { try { return JSON.parse(localStorage.getItem(SIZE_KEY)); } catch { return null; } }
function saveSize(w, h) { try { localStorage.setItem(SIZE_KEY, JSON.stringify({ w, h })); } catch {} }

/* ── Design tokens ───────────────────────────────────────────────── */
const R = {
    bg:         '#F5F4F1',
    paper:      '#FFFFFF',
    border:     '#B8C4CE',
    headerBg:   '#003F6C',
    unBlue:     '#009EDB',
    text:       '#0F1C26',      // near-black — max contrast
    subtle:     '#2D3748',      // dark slate — readable body copy
    muted:      '#4A5A6A',      // medium slate — secondary labels (was #7A8895, too light)
    edgeBg:     '#E8F2F8',
    edgeBorder: '#7FA8BF',
    accent:     '#004E80',      // darker than #005B8E for better contrast
};

/* ── Label style helper ──────────────────────────────────────────── */
const labelSx = {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: R.muted,
    textTransform: 'uppercase',
    letterSpacing: '0.09em',
    mb: 0.75,
};

/* ── UN globe (SVG) ──────────────────────────────────────────────── */
function UNGlobe({ size = 48 }) {
    return (
        <Box sx={{ width: size, height: size, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="13" stroke="rgba(255,255,255,0.9)" strokeWidth="1.3" />
                <ellipse cx="16" cy="16" rx="6.5" ry="13" stroke="rgba(255,255,255,0.65)" strokeWidth="1" />
                <ellipse cx="16" cy="16" rx="13" ry="6.5" stroke="rgba(255,255,255,0.65)" strokeWidth="1" />
                <line x1="3" y1="16" x2="29" y2="16" stroke="rgba(255,255,255,0.5)" strokeWidth="0.9" />
                <line x1="16" y1="3" x2="16" y2="29" stroke="rgba(255,255,255,0.5)" strokeWidth="0.9" />
            </svg>
        </Box>
    );
}

/* ── Node section ─────────────────────────────────────────────────── */
function NodeSection({ entity, nodeIndex, nodeCount }) {
    const c = entity ? (PALETTE[(entity.type || '').toUpperCase()] || PALETTE.default) : PALETTE.default;

    return (
        <Box sx={{ bgcolor: R.paper, border: `1px solid ${R.border}`, borderLeft: `5px solid ${c.border}`, borderRadius: '0 10px 10px 0', overflow: 'hidden' }}>

            {/* Strip header */}
            <Box sx={{ px: 2.5, py: 1, bgcolor: `${c.border}12`, borderBottom: `1px solid ${c.border}30`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: R.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Entity {nodeIndex} of {nodeCount}
                </Typography>
                {entity?.type && (
                    <Chip label={entity.type} size="small"
                        sx={{ bgcolor: `${c.border}25`, color: c.text, border: `1px solid ${c.border}60`, fontSize: '0.72rem', height: 21, fontWeight: 600 }} />
                )}
            </Box>

            <Box sx={{ px: 2.5, pt: 1.75, pb: 2.25 }}>
                {/* Name */}
                <Typography sx={{ fontSize: '1.18rem', fontWeight: 700, color: R.text, lineHeight: 1.3, mb: 0.75 }}>
                    {entity?.name || <em style={{ color: R.muted }}>Unknown entity</em>}
                </Typography>

                {/* Meta row */}
                {entity && (
                    <Stack direction="row" flexWrap="wrap" gap={2} mb={1.25}>
                        {entity.namespace && (
                            <Typography sx={{ fontSize: '0.85rem', color: R.subtle }}>
                                <span style={{ color: R.muted, fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Namespace: </span>
                                {entity.namespace}
                            </Typography>
                        )}
                        {entity.epistemicLayer && (
                            <Typography sx={{ fontSize: '0.85rem', color: '#4c1d95' }}>
                                <span style={{ color: R.muted, fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Layer: </span>
                                {entity.epistemicLayer}
                            </Typography>
                        )}
                        {entity.category && (
                            <Typography sx={{ fontSize: '0.85rem', color: R.subtle }}>
                                <span style={{ color: R.muted, fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Category: </span>
                                {entity.category}
                            </Typography>
                        )}
                        {entity.mentionCount > 0 && (
                            <Typography sx={{ fontSize: '0.85rem', color: R.subtle }}>
                                <span style={{ color: R.muted, fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Mentions: </span>
                                {entity.mentionCount}
                            </Typography>
                        )}
                    </Stack>
                )}

                {/* Description */}
                {entity?.description && (
                    <>
                        <Divider sx={{ my: 1.5, borderColor: R.border }} />
                        <Typography sx={labelSx}>Description</Typography>
                        <Typography sx={{ fontSize: '0.92rem', color: R.subtle, lineHeight: 1.8 }}>
                            {entity.description}
                        </Typography>
                    </>
                )}

                {/* Provenance */}
                {entity && (entity.provenanceDocTitle || entity.provenanceDocSymbol) && (
                    <>
                        <Divider sx={{ my: 1.5, borderColor: R.border }} />
                        <Typography sx={labelSx}>Source Provenance</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                            <FileText size={15} style={{ color: R.unBlue, flexShrink: 0, marginTop: 3 }} />
                            <Box>
                                {entity.provenanceDocSymbol && (
                                    <Typography sx={{ fontSize: '0.88rem', fontFamily: 'monospace', fontWeight: 700, color: R.accent, mb: 0.3 }}>
                                        {entity.provenanceDocSymbol}
                                    </Typography>
                                )}
                                {entity.provenanceDocTitle && (
                                    <Typography sx={{ fontSize: '0.9rem', color: R.text, lineHeight: 1.5 }}>
                                        {entity.provenanceDocTitle}
                                    </Typography>
                                )}
                                {entity.provenanceImportedAt && (
                                    <Typography sx={{ fontSize: '0.8rem', color: R.muted, mt: 0.35 }}>
                                        Imported: {new Date(entity.provenanceImportedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                                    </Typography>
                                )}
                                {Array.isArray(entity.provenanceSources) && entity.provenanceSources.length > 0 && (
                                    <Stack direction="row" flexWrap="wrap" gap={0.5} mt={0.75}>
                                        {entity.provenanceSources.slice(0, 6).map((src, i) => (
                                            <Chip key={i} label={src} size="small"
                                                sx={{ bgcolor: '#DDE8F0', color: R.accent, border: `1px solid ${R.edgeBorder}`, fontSize: '0.72rem', height: 20, fontWeight: 500 }} />
                                        ))}
                                    </Stack>
                                )}
                            </Box>
                        </Box>
                    </>
                )}
            </Box>
        </Box>
    );
}

/* ── Edge connector ──────────────────────────────────────────────── */
function EdgeSection({ segment, fromName, toName }) {
    const rel       = segment.rel;
    const isForward = segment.direction === 'forward';
    const dirLabel  = isForward
        ? `${fromName || '?'} → ${toName || '?'}`
        : `${fromName || '?'} ← ${toName || '?'}`;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 0 }}>
            {/* Top stem */}
            <Box sx={{ width: 2, height: 24, bgcolor: R.edgeBorder }} />
            {/* Arrowhead */}
            <Box sx={{ width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: `9px solid ${R.edgeBorder}` }} />

            {/* Card */}
            <Box sx={{ width: '80%', bgcolor: R.edgeBg, border: `1px solid ${R.edgeBorder}`, borderRadius: 2, overflow: 'hidden', mt: 0.25 }}>
                {/* Header */}
                <Box sx={{ px: 2.25, py: 1, bgcolor: `${R.accent}14`, borderBottom: `1px solid ${R.edgeBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 0.75 }}>
                    <Stack direction="row" alignItems="center" gap={0.85}>
                        <Link2 size={14} style={{ color: R.accent }} />
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: R.accent, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                            {rel?.relType || 'RELATED TO'}
                        </Typography>
                    </Stack>
                    <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap">
                        {rel?.confidence != null && (
                            <Typography sx={{ fontSize: '0.78rem', color: R.muted }}>
                                Confidence: <strong style={{ color: R.subtle }}>{Math.round(rel.confidence * 100)}%</strong>
                            </Typography>
                        )}
                        <Typography sx={{ fontSize: '0.78rem', color: R.muted, fontStyle: 'italic' }}>
                            {dirLabel}
                        </Typography>
                    </Stack>
                </Box>

                {/* Body */}
                <Box sx={{ px: 2.25, py: 1.75 }}>
                    {rel?.context ? (
                        <>
                            <Typography sx={labelSx}>Contextual Excerpt</Typography>
                            <Box sx={{ bgcolor: R.paper, border: `1px solid ${R.border}`, borderLeft: `4px solid ${R.unBlue}`, borderRadius: '0 8px 8px 0', px: 2.25, py: 1.5 }}>
                                <Typography sx={{ fontSize: '0.92rem', color: R.text, fontStyle: 'italic', lineHeight: 1.8 }}>
                                    "{rel.context}"
                                </Typography>
                            </Box>
                        </>
                    ) : (
                        <Typography sx={{ fontSize: '0.85rem', color: R.muted, fontStyle: 'italic' }}>
                            No contextual excerpt is available for this relationship.
                        </Typography>
                    )}

                    {/* Relationship provenance */}
                    {rel?.provenance && (rel.provenance.docTitle || rel.provenance.docSymbol) && (
                        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px dashed ${R.border}`, display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                            <FileText size={14} style={{ color: R.unBlue, flexShrink: 0, marginTop: 2 }} />
                            <Box>
                                {rel.provenance.docSymbol && (
                                    <Typography sx={{ fontSize: '0.82rem', fontFamily: 'monospace', fontWeight: 700, color: R.accent }}>
                                        {rel.provenance.docSymbol}
                                    </Typography>
                                )}
                                {rel.provenance.docTitle && (
                                    <Typography sx={{ fontSize: '0.85rem', color: R.subtle, lineHeight: 1.5 }}>
                                        {rel.provenance.docTitle}
                                    </Typography>
                                )}
                            </Box>
                        </Box>
                    )}
                </Box>
            </Box>

            {/* Bottom stem */}
            <Box sx={{ width: 2, height: 20, bgcolor: R.edgeBorder, mt: 0.25 }} />
        </Box>
    );
}

/* ── Structural Analysis Section ─────────────────────────────────── */
const ROBUSTNESS_CFG = {
    HIGH:     { dots: '●●●●●', color: '#22c55e', label: 'HIGH' },
    MODERATE: { dots: '●●○○○', color: '#eab308', label: 'MODERATE' },
    FRAGILE:  { dots: '●○○○○', color: '#ef4444', label: 'FRAGILE' },
};

function AnalysisCard({ title, children }) {
    return (
        <Box sx={{ mb: 2 }}>
            <Typography sx={{ ...labelSx, color: R.accent, mb: 0.75 }}>{title}</Typography>
            <Paper elevation={0} sx={{ p: 2, bgcolor: '#F0F6FA', border: `1px solid ${R.border}`, borderRadius: 1.5 }}>
                {children}
            </Paper>
        </Box>
    );
}

function StructuralAnalysisSection({ analysis, pathsData, entityMap }) {
    if (!analysis) return null;

    const rc   = ROBUSTNESS_CFG[analysis.connectionRobustness] || ROBUSTNESS_CFG.FRAGILE;
    const maxS = pathsData?.length ? Math.max(...pathsData.map(p => p.pathStrength)) : 1;

    return (
        <Box sx={{ mt: 4, pt: 3, borderTop: `2px solid ${R.headerBg}` }}>
            <Typography sx={{
                textAlign: 'center', color: R.headerBg, fontWeight: 700,
                letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: '0.85rem', mb: 3,
            }}>
                ══  Structural Analysis  ══
            </Typography>

            {/* Robustness */}
            <AnalysisCard title="Connection Robustness">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography sx={{ fontFamily: 'monospace', color: rc.color, fontSize: '1.1rem', letterSpacing: '0.1em' }}>
                        {rc.dots}
                    </Typography>
                    <Typography sx={{ fontWeight: 700, color: rc.color, fontSize: '0.95rem' }}>
                        {rc.label}
                    </Typography>
                </Box>
                <Typography variant="body2" sx={{ mt: 0.75, color: R.subtle, fontSize: '0.85rem' }}>
                    {analysis.independentPathCount} independent path{analysis.independentPathCount !== 1 ? 's' : ''} exist between these entities.
                </Typography>
            </AnalysisCard>

            {/* Critical Intermediaries */}
            <AnalysisCard title="Critical Intermediaries">
                {analysis.articulationPoints?.length > 0 ? (
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                        <AlertTriangle size={16} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
                        <Box>
                            <Typography sx={{ fontWeight: 600, fontSize: '0.88rem', color: R.text }}>
                                All paths pass through:{' '}
                                {analysis.articulationPoints
                                    .map(id => entityMap?.get(id)?.name || id)
                                    .join(', ')}
                            </Typography>
                            <Typography variant="body2" sx={{ color: R.muted, fontSize: '0.82rem', mt: 0.4 }}>
                                Removing this entity would sever the connection entirely.
                            </Typography>
                        </Box>
                    </Box>
                ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                        <CheckCircle size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
                        <Typography sx={{ fontSize: '0.88rem', color: R.subtle }}>
                            No single point of failure — connection survives removal of any intermediary.
                        </Typography>
                    </Box>
                )}
            </AnalysisCard>

            {/* Connecting Subgraph */}
            <AnalysisCard title="Connecting Subgraph">
                <Typography sx={{ fontSize: '0.88rem', color: R.subtle }}>
                    <strong>{analysis.subgraphNodeCount}</strong> nodes ·{' '}
                    <strong>{analysis.subgraphEdgeCount}</strong> edges ·{' '}
                    <strong>{(analysis.subgraphDensity * 100).toFixed(0)}%</strong> density
                </Typography>
            </AnalysisCard>

            {/* Path Strength Bars */}
            {pathsData?.length > 0 && (
                <AnalysisCard title="Path Strength Distribution">
                    {pathsData.map((path, i) => (
                        <Box key={i} sx={{ mb: i < pathsData.length - 1 ? 1.5 : 0 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.4 }}>
                                <Typography variant="body2" sx={{ fontSize: '0.82rem', color: R.subtle }}>
                                    Path {i + 1} · {path.hopCount} hop{path.hopCount !== 1 ? 's' : ''}
                                    {i === 0 && <span style={{ color: R.unBlue, fontWeight: 700 }}> ★</span>}
                                </Typography>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.82rem', color: R.muted }}>
                                    {(path.pathStrength * 100).toFixed(1)}%
                                </Typography>
                            </Box>
                            <Box sx={{ height: 8, bgcolor: R.border, borderRadius: 1, overflow: 'hidden' }}>
                                <Box sx={{
                                    height: '100%',
                                    width: `${(path.pathStrength / maxS) * 100}%`,
                                    bgcolor: i === 0 ? R.unBlue : R.accent,
                                    borderRadius: 1,
                                    transition: 'width 0.4s ease',
                                }} />
                            </Box>
                        </Box>
                    ))}
                    <Typography variant="body2" sx={{ mt: 1.25, color: R.muted, fontSize: '0.8rem' }}>
                        Average strength: {(pathsData.reduce((s, p) => s + p.pathStrength, 0) / pathsData.length * 100).toFixed(1)}%
                    </Typography>
                </AnalysisCard>
            )}
        </Box>
    );
}

/* ── Main export ─────────────────────────────────────────────────── */
export default function PathReportDialog({ open, onClose, segments, fromEntity, toEntity, structuralAnalysis, pathsData }) {
    const saved = loadSize();
    const [interpretation, setInterpretation] = useState(null);
    const [interpreting, setInterpreting]     = useState(false);

    const entityMap = React.useMemo(() => {
        const m = new Map();
        segments?.forEach(seg => { if (seg.type === 'node' && seg.entity) m.set(seg.id, seg.entity); });
        return m;
    }, [segments]);

    const handleExplain = async () => {
        setInterpreting(true);
        try {
            const result = await entityStoreService.interpretPaths(
                fromEntity, toEntity, pathsData || [], structuralAnalysis
            );
            setInterpretation(result);
        } catch (e) {
            setInterpretation({ narrative: `Analysis failed: ${e.message}`, keyInsight: '' });
        } finally {
            setInterpreting(false);
        }
    };

    const nodeCount = segments ? segments.filter(s => s.type === 'node').length : 0;
    const edgeCount = segments ? segments.filter(s => s.type === 'edge').length : 0;

    const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

    const handleClose = () => {
        const paper = document.querySelector('.MuiDialog-paper');
        if (paper) {
            const { width, height } = paper.getBoundingClientRect();
            saveSize(Math.round(width), Math.round(height));
        }
        onClose();
    };

    const nameMap = {};
    let ni = 0;
    const enriched = segments?.map(seg => {
        if (seg.type === 'node') {
            ni++;
            if (seg.entity) nameMap[seg.id] = seg.entity.name;
            return { ...seg, nodeIndex: ni };
        }
        return seg;
    }) || [];

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth={false}
            PaperProps={{
                sx: {
                    width:     saved?.w || 940,
                    height:    saved?.h || '84vh',
                    maxWidth:  '95vw',
                    maxHeight: '95vh',
                    minWidth:  580,
                    minHeight: 420,
                    resize:    'both',
                    overflow:  'hidden',
                    display:   'flex',
                    flexDirection: 'column',
                    bgcolor: R.bg,
                    borderRadius: 2,
                },
            }}
        >
            {/* ── UN Header ── */}
            <Box sx={{ bgcolor: R.headerBg, px: 3, py: 1.75, display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                <UNGlobe size={48} />
                <Box flex={1}>
                    <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.8)', letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }}>
                        United Nations · Knowledge Graph System
                    </Typography>
                    <Typography sx={{ fontSize: '1.12rem', fontWeight: 700, color: '#fff', letterSpacing: '0.06em', mt: 0.25 }}>
                        PATH ANALYSIS REPORT
                    </Typography>
                </Box>
                <Box sx={{ textAlign: 'right', flexShrink: 0, mr: 1 }}>
                    <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.72)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                        Generated
                    </Typography>
                    <Typography sx={{ fontSize: '0.85rem', color: '#fff', fontWeight: 500 }}>
                        {today}
                    </Typography>
                </Box>
                <IconButton onClick={handleClose}
                    sx={{ color: 'rgba(255,255,255,0.75)', p: 0.75, '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.15)' } }}>
                    <X size={18} />
                </IconButton>
            </Box>

            {/* ── Blue meta strip ── */}
            <Box sx={{ bgcolor: R.unBlue, px: 3, py: 1.25, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, flexShrink: 0 }}>
                <Box>
                    <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.88)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>From</Typography>
                    <Typography sx={{ fontSize: '0.95rem', color: '#fff', fontWeight: 600 }}>{fromEntity?.name || '—'}</Typography>
                </Box>
                <Typography sx={{ color: 'rgba(255,255,255,0.65)', fontSize: '1.3rem', lineHeight: 1 }}>→</Typography>
                <Box>
                    <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.88)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>To</Typography>
                    <Typography sx={{ fontSize: '0.95rem', color: '#fff', fontWeight: 600 }}>{toEntity?.name || '—'}</Typography>
                </Box>
                <Box flex={1} />
                <Box sx={{ textAlign: 'right' }}>
                    <Typography sx={{ fontSize: '0.82rem', color: '#fff' }}>
                        <strong>{nodeCount}</strong> {nodeCount === 1 ? 'entity' : 'entities'} · <strong>{edgeCount}</strong> {edgeCount === 1 ? 'relationship' : 'relationships'}
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)' }}>
                        Path length: {edgeCount} {edgeCount === 1 ? 'hop' : 'hops'}
                    </Typography>
                </Box>
            </Box>

            {/* ── Scrollable report content ── */}
            <Box sx={{ flex: 1, overflowY: 'auto', px: 3.5, py: 3 }}>
                {enriched.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 8 }}>
                        <Typography sx={{ fontSize: '0.95rem', color: R.muted, fontStyle: 'italic' }}>No path data available.</Typography>
                    </Box>
                ) : enriched.map((seg, idx) => {
                    if (seg.type === 'node') {
                        return (
                            <NodeSection
                                key={`seg-${idx}`}
                                entity={seg.entity}
                                nodeIndex={seg.nodeIndex}
                                nodeCount={nodeCount}
                            />
                        );
                    }
                    return (
                        <EdgeSection
                            key={`seg-${idx}`}
                            segment={seg}
                            fromName={nameMap[seg.fromId]}
                            toName={nameMap[seg.toId]}
                        />
                    );
                })}

                {/* Structural Analysis */}
                <StructuralAnalysisSection
                    analysis={structuralAnalysis}
                    pathsData={pathsData}
                    entityMap={entityMap}
                />

                {/* Explain Connection */}
                {structuralAnalysis && (
                    <Box sx={{ mt: 3 }}>
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={interpreting ? <CircularProgress size={14} /> : <Sparkles size={14} />}
                            onClick={handleExplain}
                            disabled={interpreting}
                            sx={{
                                borderColor: R.unBlue, color: R.unBlue,
                                '&:hover': { borderColor: R.accent, bgcolor: `${R.unBlue}10` },
                                textTransform: 'none', fontWeight: 600,
                            }}
                        >
                            {interpreting ? 'Analyzing...' : 'Explain Connection'}
                        </Button>

                        {interpretation && (
                            <Paper elevation={0} sx={{
                                mt: 2, p: 2.5, bgcolor: '#FFFBEB',
                                border: '1px solid #FCD34D', borderLeft: '4px solid #F59E0B', borderRadius: 1.5,
                            }}>
                                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.1em', mb: 1 }}>
                                    AI Analysis
                                </Typography>
                                <Typography sx={{ fontSize: '0.9rem', color: R.text, lineHeight: 1.75 }}>
                                    {interpretation.narrative}
                                </Typography>
                                {interpretation.keyInsight && (
                                    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px dashed #FCD34D' }}>
                                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.1em', mb: 0.5 }}>
                                            Key Insight
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.88rem', color: R.subtle, lineHeight: 1.65 }}>
                                            {interpretation.keyInsight}
                                        </Typography>
                                    </Box>
                                )}
                            </Paper>
                        )}
                    </Box>
                )}

                {/* Footer */}
                <Box sx={{ mt: 4, pt: 2.5, borderTop: `2px solid ${R.border}`, textAlign: 'center' }}>
                    <Box sx={{ width: 44, height: 2, bgcolor: R.unBlue, mx: 'auto', mb: 1.5 }} />
                    <Typography sx={{ fontSize: '0.78rem', color: R.muted, letterSpacing: '0.07em', textTransform: 'uppercase', mb: 0.5 }}>
                        United Nations Knowledge Graph System · Automated Path Analysis
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: R.muted }}>
                        This report was generated automatically. All information should be verified against the original source documents.
                    </Typography>
                </Box>
            </Box>
        </Dialog>
    );
}
