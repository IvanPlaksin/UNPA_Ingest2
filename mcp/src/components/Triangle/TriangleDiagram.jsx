/**
 * TriangleDiagram — Knowledge Triangle SVG visualization
 *
 * Renders a triangle with:
 *   - NORMATIVE vertex at top (purple, GOVERNS)
 *   - OPERATIONAL vertex at bottom-left (green, OPERATIONALIZES)
 *   - EMPIRICAL vertex at bottom-right (red/orange, REVEALS_GAP_IN)
 *   - Process node at center
 *   - Animated pulse on gap vertex when gaps exist
 *
 * Props:
 *   process       { id, name, kqsScore }
 *   completeness  { score, vertices: { normative, operational, empirical }, missingVertices }
 *   counts        { normative, operational, empirical, gaps }
 *   onVertexClick (vertexType: 'normative'|'operational'|'empirical') => void
 *   highlightVertex string | null
 */
import React from 'react';
import { Box, Typography, Chip } from '@mui/material';

const W = 360, H = 300;

// Vertex centers
const VERTS = {
    normative:   { cx: W / 2,     cy: 36,      color: '#7c3aed', label: 'NORMATIVE',   edge: 'GOVERNS',          layers: 'L0-L2' },
    operational: { cx: 54,        cy: H - 36,  color: '#059669', label: 'OPERATIONAL', edge: 'OPERATIONALIZES',  layers: 'L3' },
    empirical:   { cx: W - 54,    cy: H - 36,  color: '#ef4444', label: 'EMPIRICAL',   edge: 'REVEALS_GAP_IN',   layers: 'L4' },
};
const CENTER = { cx: W / 2, cy: H / 2 - 8 };

function vertex(key) { return VERTS[key]; }

export default function TriangleDiagram({ process, completeness, counts = {}, onVertexClick, highlightVertex }) {
    const kqs   = process?.kqsScore;
    const score = completeness?.score ?? 0;
    const pct   = Math.round(score * 100);

    function hasVertex(key) {
        return completeness?.vertices?.[key]?.present ?? false;
    }
    function countFor(key) {
        return counts?.[key] ?? 0;
    }

    return (
        <Box sx={{ position: 'relative', width: W, mx: 'auto' }}>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
                <defs>
                    <marker id="arrowN" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
                        <path d="M0,0 L8,4 L0,8 Z" fill={VERTS.normative.color} opacity="0.6" />
                    </marker>
                    <marker id="arrowO" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
                        <path d="M0,0 L8,4 L0,8 Z" fill={VERTS.operational.color} opacity="0.6" />
                    </marker>
                    <marker id="arrowE" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
                        <path d="M0,0 L8,4 L0,8 Z" fill={VERTS.empirical.color} opacity="0.6" />
                    </marker>
                    {/* Pulse animation for gap vertex */}
                    <style>{`
                        @keyframes tpulse { 0%,100%{r:26px;opacity:1} 50%{r:31px;opacity:0.6} }
                        .pulse-emp { animation: tpulse 1.8s ease-in-out infinite; }
                    `}</style>
                </defs>

                {/* ── Triangle outline ── */}
                <polygon
                    points={`${VERTS.normative.cx},${VERTS.normative.cy} ${VERTS.operational.cx},${VERTS.operational.cy} ${VERTS.empirical.cx},${VERTS.empirical.cy}`}
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth={1.5}
                    strokeDasharray="6,4"
                />

                {/* ── Edges from center to vertices ── */}
                {[
                    { key: 'normative',   marker: 'url(#arrowN)' },
                    { key: 'operational', marker: 'url(#arrowO)' },
                    { key: 'empirical',   marker: 'url(#arrowE)' },
                ].map(({ key, marker }) => {
                    const v = vertex(key);
                    const has = hasVertex(key);
                    // Calculate direction from center toward vertex, stop before vertex circle
                    const dx = v.cx - CENTER.cx, dy = v.cy - CENTER.cy;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const ux = dx / dist, uy = dy / dist;
                    const x1 = CENTER.cx + ux * 34, y1 = CENTER.cy + uy * 34;
                    const x2 = v.cx    - ux * 32, y2 = v.cy    - uy * 32;
                    return (
                        <line key={key}
                            x1={x1} y1={y1} x2={x2} y2={y2}
                            stroke={has ? v.color : '#e2e8f0'}
                            strokeWidth={has ? 2.5 : 1.5}
                            strokeDasharray={has ? '' : '5,4'}
                            markerEnd={has ? marker : ''}
                            opacity={has ? 0.85 : 0.5}
                        />
                    );
                })}

                {/* ── Center process node ── */}
                <circle cx={CENTER.cx} cy={CENTER.cy} r={34}
                    fill="white"
                    stroke={pct >= 67 ? '#22c55e' : pct >= 34 ? '#f59e0b' : '#ef4444'}
                    strokeWidth={2.5}
                />
                <text x={CENTER.cx} y={CENTER.cy - 8} textAnchor="middle"
                    fontSize={11} fontWeight="700" fill="#1e293b">
                    {pct}%
                </text>
                <text x={CENTER.cx} y={CENTER.cy + 6} textAnchor="middle"
                    fontSize={9} fill="#64748b">
                    {kqs != null ? `KQS ${kqs.toFixed(2)}` : 'complete'}
                </text>
                {counts?.gaps > 0 && (
                    <text x={CENTER.cx} y={CENTER.cy + 20} textAnchor="middle"
                        fontSize={9} fill="#ef4444" fontWeight="600">
                        ⚠ {counts.gaps} gap{counts.gaps > 1 ? 's' : ''}
                    </text>
                )}

                {/* ── Vertex circles ── */}
                {Object.entries(VERTS).map(([key, v]) => {
                    const has  = hasVertex(key);
                    const cnt  = countFor(key);
                    const highlighted = highlightVertex === key;
                    const isPulse = key === 'empirical' && counts?.gaps > 0;

                    return (
                        <g key={key}
                            style={{ cursor: 'pointer' }}
                            onClick={() => onVertexClick?.(key)}>
                            {/* Hover/highlight ring */}
                            {(highlighted || isPulse) && (
                                <circle cx={v.cx} cy={v.cy} r={29}
                                    fill="none"
                                    stroke={v.color}
                                    strokeWidth={2}
                                    opacity={0.35}
                                    className={isPulse ? 'pulse-emp' : ''}
                                />
                            )}
                            {/* Main circle */}
                            <circle cx={v.cx} cy={v.cy} r={25}
                                fill={has ? v.color : 'white'}
                                stroke={v.color}
                                strokeWidth={highlighted ? 3 : 2}
                                opacity={has ? 1 : 0.6}
                            />
                            {/* Document count badge */}
                            {cnt > 0 && (
                                <text x={v.cx} y={v.cy + 4} textAnchor="middle"
                                    fontSize={13} fontWeight="700"
                                    fill={has ? 'white' : v.color}>
                                    {cnt}
                                </text>
                            )}
                            {/* Empty vertex marker */}
                            {cnt === 0 && !has && (
                                <text x={v.cx} y={v.cy + 4} textAnchor="middle"
                                    fontSize={14} fill={v.color} opacity={0.5}>
                                    +
                                </text>
                            )}
                            {/* Vertex label */}
                            <text x={v.cx} y={v.cy + 40} textAnchor="middle"
                                fontSize={9} fontWeight="600" fill={v.color} opacity={0.85}>
                                {v.label}
                            </text>
                            <text x={v.cx} y={v.cy + 52} textAnchor="middle"
                                fontSize={8} fill="#94a3b8">
                                {v.layers}
                            </text>
                        </g>
                    );
                })}
            </svg>

            {/* ── Process name below diagram ── */}
            <Box sx={{ textAlign: 'center', mt: 0.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                    {process?.name || '—'}
                </Typography>
            </Box>
        </Box>
    );
}
