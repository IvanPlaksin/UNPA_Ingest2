/**
 * ArtifactReportTab — PATH ANALYSIS REPORT style panel embedded as a dialog tab.
 *
 * Renders structured analytical report for graph-producing primitives:
 *   CONNECT  — path chains + bundle analysis + structural analysis
 *   EXPAND   — neighbourhood analysis by relationship type
 *   STRUCTURE — centrality / bridge analysis report
 *
 * Design tokens match PathReportDialog (R.*).
 */
import React from 'react';
import {
  Box, Stack, Typography, Chip, Divider, Paper,
} from '@mui/material';
import {
  Link2, Network, Cpu, AlertTriangle, CheckCircle,
  ArrowRight, Shield, Activity,
} from 'lucide-react';

// ─── Design tokens (same as PathReportDialog) ─────────────────────────────────
const R = {
  bg:         '#F5F4F1',
  paper:      '#FFFFFF',
  border:     '#B8C4CE',
  headerBg:   '#003F6C',
  unBlue:     '#009EDB',
  text:       '#0F1C26',
  subtle:     '#2D3748',
  muted:      '#4A5A6A',
  edgeBg:     '#E8F2F8',
  edgeBorder: '#7FA8BF',
  accent:     '#004E80',
};

const PALETTE = {
  ACTOR:        { bg: '#EFF6FF', border: '#3B82F6', text: '#1D4ED8' },
  ORGANIZATION: { bg: '#F5F3FF', border: '#7C3AED', text: '#5B21B6' },
  PERSON:       { bg: '#FFF7ED', border: '#EA580C', text: '#C2410C' },
  CONCEPT:      { bg: '#F0FDF4', border: '#16A34A', text: '#15803D' },
  DOCUMENT:     { bg: '#FEFCE8', border: '#CA8A04', text: '#92400E' },
  EVENT:        { bg: '#FFF1F2', border: '#E11D48', text: '#BE123C' },
  PROCESS:      { bg: '#F0F9FF', border: '#0284C7', text: '#075985' },
  TECHNOLOGY:   { bg: '#FDF4FF', border: '#A21CAF', text: '#86198F' },
  POLICY:       { bg: '#FFF8F1', border: '#D97706', text: '#B45309' },
  SYSTEM:       { bg: '#F8FAFC', border: '#475569', text: '#334155' },
  default:      { bg: '#F8FAFC', border: '#94A3B8', text: '#475569' },
};

const pc = (type) => PALETTE[(type || '').toUpperCase()] || PALETTE.default;

// ─── UN Header ────────────────────────────────────────────────────────────────
function ReportHeader({ title, subtitle }) {
  return (
    <Box sx={{ bgcolor: R.headerBg, px: 2.5, py: 1.5, mb: 2, borderRadius: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Box sx={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="13" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" />
            <ellipse cx="16" cy="16" rx="6.5" ry="13" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
            <ellipse cx="16" cy="16" rx="13" ry="6.5" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
            <line x1="3" y1="16" x2="29" y2="16" stroke="rgba(255,255,255,0.4)" strokeWidth="0.9" />
          </svg>
        </Box>
        <Box>
          <Typography sx={{ color: 'white', fontWeight: 700, fontSize: '0.88rem', letterSpacing: '0.04em' }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem' }}>{subtitle}</Typography>
          )}
        </Box>
      </Stack>
    </Box>
  );
}

// ─── Entity node card (PathReportDialog NodeSection style) ────────────────────
function NodeCard({ entity, index, total }) {
  if (!entity) return null;
  const c = pc(entity.type);
  return (
    <Box sx={{ bgcolor: R.paper, border: `1px solid ${R.border}`, borderLeft: `5px solid ${c.border}`, borderRadius: '0 8px 8px 0', overflow: 'hidden', mb: 0 }}>
      <Box sx={{ px: 2, py: 0.75, bgcolor: `${c.border}12`, borderBottom: `1px solid ${c.border}30`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: R.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Entity {index} of {total}
        </Typography>
        {entity.type && (
          <Chip label={entity.type} size="small" sx={{ bgcolor: `${c.border}22`, color: c.text, fontSize: '0.62rem', height: 18, fontWeight: 600, border: `1px solid ${c.border}50` }} />
        )}
      </Box>
      <Box sx={{ px: 2, py: 1 }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: R.text, lineHeight: 1.3, mb: 0.5 }}>
          {entity.name}
        </Typography>
        <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ mb: 0.25 }}>
          {entity.namespace && (
            <Typography sx={{ fontSize: '0.72rem', color: R.subtle }}>
              <span style={{ color: R.muted, fontWeight: 700, fontSize: '0.6rem', textTransform: 'uppercase' }}>NS: </span>
              {entity.namespace}
            </Typography>
          )}
          {entity.epistemicLayer && (
            <Typography sx={{ fontSize: '0.72rem', color: R.subtle }}>
              <span style={{ color: R.muted, fontWeight: 700, fontSize: '0.6rem', textTransform: 'uppercase' }}>Layer: </span>
              {entity.epistemicLayer.replace('L0_', '').replace('L1_', 'L1:').replace('L2_', 'L2:').replace(/_/g, ' ')}
            </Typography>
          )}
          {entity.mentionCount > 0 && (
            <Typography sx={{ fontSize: '0.72rem', color: R.subtle }}>
              <span style={{ color: R.muted, fontWeight: 700, fontSize: '0.6rem', textTransform: 'uppercase' }}>Mentions: </span>
              {entity.mentionCount}
            </Typography>
          )}
        </Stack>
        {entity.description && (
          <Typography sx={{ fontSize: '0.8rem', color: R.subtle, mt: 0.75, lineHeight: 1.6 }}>
            {entity.description.slice(0, 180)}{entity.description.length > 180 ? '…' : ''}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

// ─── Edge connector — supports multiple parallel relationships ────────────────
function EdgeCard({ rel, fromName, toName, showConnector = true, relIndex, relTotal }) {
  const isParallel = relTotal > 1;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 0 }}>
      {showConnector && (
        <>
          <Box sx={{ width: 2, height: 16, bgcolor: R.edgeBorder }} />
          {!isParallel || relIndex === 0 ? (
            <Box sx={{ width: 0, height: 0, borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderTop: `8px solid ${R.edgeBorder}` }} />
          ) : (
            // Parallel indicator — small fork arrow
            <Box sx={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `6px solid ${R.accent}88` }} />
          )}
        </>
      )}
      <Box sx={{
        width: '88%',
        bgcolor: R.edgeBg,
        border: `1px solid ${isParallel && relIndex > 0 ? R.accent + '60' : R.edgeBorder}`,
        borderRadius: 1.5,
        overflow: 'hidden',
        mt: 0.25,
        mb: isParallel && relIndex < relTotal - 1 ? 0.4 : 0,
      }}>
        {/* Header row */}
        <Box sx={{ px: 2, py: 0.65, bgcolor: `${R.accent}${isParallel && relIndex > 0 ? '18' : '10'}`, borderBottom: `1px solid ${R.edgeBorder}55`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 0.5 }}>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Link2 size={12} style={{ color: R.accent }} />
            <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: R.accent, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {rel?.relType?.replace(/_/g, ' ') || 'RELATED TO'}
            </Typography>
            {isParallel && (
              <Chip
                label={`${relIndex + 1}/${relTotal}`}
                size="small"
                sx={{ fontSize: '0.56rem', height: 14, bgcolor: R.accent + '22', color: R.accent }}
              />
            )}
          </Stack>
          <Stack direction="row" spacing={1.5} alignItems="center">
            {rel?.direction && rel.direction !== 'forward' && (
              <Chip label={rel.direction} size="small" variant="outlined" sx={{ fontSize: '0.56rem', height: 14 }} />
            )}
            {rel?.confidence != null && (
              <Typography sx={{ fontSize: '0.68rem', color: R.muted }}>
                conf. <strong style={{ color: R.subtle }}>{Math.round(rel.confidence * 100)}%</strong>
              </Typography>
            )}
          </Stack>
        </Box>

        {/* From → To */}
        {(fromName || toName) && (
          <Box sx={{ px: 2, pt: 0.6, pb: rel?.context ? 0 : 0.75 }}>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <Typography sx={{ fontSize: '0.78rem', color: R.text, fontWeight: 600 }}>{fromName}</Typography>
              <ArrowRight size={12} style={{ color: R.accent, flexShrink: 0 }} />
              <Typography sx={{ fontSize: '0.78rem', color: R.text, fontWeight: 600 }}>{toName}</Typography>
            </Stack>
          </Box>
        )}

        {/* Context text — full, no truncation */}
        {rel?.context && (
          <Box sx={{ px: 2, pt: 0.5, pb: 0.85, borderTop: `1px dashed ${R.border}`, mt: 0.5 }}>
            <Typography sx={{ fontSize: '0.7rem', color: R.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.35 }}>
              Evidence context
            </Typography>
            <Typography sx={{ fontSize: '0.77rem', color: R.subtle, lineHeight: 1.65, fontStyle: 'italic' }}>
              "{rel.context}"
            </Typography>
            {rel?.documentId && (
              <Typography sx={{ fontSize: '0.62rem', color: R.muted, mt: 0.4 }}>
                Source: {rel.documentId}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

// ─── Robustness badge ─────────────────────────────────────────────────────────
function RobustnessBadge({ value }) {
  const cfg = {
    HIGH:     { color: '#15803D', bg: '#F0FDF4', border: '#86EFAC', icon: CheckCircle },
    MODERATE: { color: '#B45309', bg: '#FFFBEB', border: '#FCD34D', icon: AlertTriangle },
    FRAGILE:  { color: '#BE123C', bg: '#FFF1F2', border: '#FDA4AF', icon: AlertTriangle },
  }[value] || { color: R.muted, bg: R.edgeBg, border: R.edgeBorder, icon: Activity };
  const Icon = cfg.icon;
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, bgcolor: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 1, px: 1.25, py: 0.4 }}>
      <Icon size={13} style={{ color: cfg.color }} />
      <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: cfg.color }}>{value}</Typography>
    </Box>
  );
}

// ─── CONNECT Report ───────────────────────────────────────────────────────────
function ConnectReport({ content }) {
  const { paths = [], entities = [], structuralAnalysis, bundles = {}, interpretation } = content;

  // Entity lookup by ID
  const entityById = Object.fromEntries(entities.map(e => [e.id || e.entityId, e]));

  // Bundle lookup by entity ID pair — bundle.nodeA/nodeB are entity IDs
  const bundleById = {};
  Object.values(bundles).forEach(b => {
    bundleById[`${b.nodeA}||${b.nodeB}`] = b.relationships || [];
    bundleById[`${b.nodeB}||${b.nodeA}`] = b.relationships || [];
  });
  const getBundleRels = (idA, idB) =>
    (idA && idB) ? (bundleById[`${idA}||${idB}`] || []) : [];

  // Determine primary from/to from first path segments
  const firstPath = paths[0];
  const firstSegs = firstPath?.segments || [];
  const fromEntity = firstSegs.length
    ? (entityById[firstSegs[0].id] || { name: firstSegs[0].name, type: firstSegs[0].type })
    : entityById[content.fromEntityId];
  const toEntity = firstSegs.length
    ? (entityById[firstSegs[firstSegs.length - 1].id] || { name: firstSegs[firstSegs.length - 1].name })
    : entityById[content.toEntityId];

  if (paths.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center', opacity: 0.5 }}>
        <Typography>No paths found between the specified entities.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: R.bg, p: 1.5, borderRadius: 1.5 }}>
      <ReportHeader
        title="PATH ANALYSIS REPORT"
        subtitle={fromEntity && toEntity ? `${fromEntity.name} → ${toEntity.name}` : undefined}
      />

      {/* Meta strip */}
      <Box sx={{ bgcolor: R.unBlue + '18', border: `1px solid ${R.unBlue}40`, borderRadius: 1, px: 2, py: 1, mb: 2 }}>
        <Stack direction="row" spacing={3} flexWrap="wrap">
          <MetaItem label="Paths Found" value={paths.length} />
          <MetaItem label="Total Entities" value={entities.length} />
          {firstPath?.hopCount != null && <MetaItem label="Shortest Path" value={`${firstPath.hopCount} hop(s)`} />}
          <MetaItem label="Rel. Bundles" value={Object.keys(bundles).length} />
          {structuralAnalysis?.connectionRobustness && (
            <Box>
              <Typography sx={{ fontSize: '0.62rem', color: R.muted, fontWeight: 700, textTransform: 'uppercase', mb: 0.3 }}>Robustness</Typography>
              <RobustnessBadge value={structuralAnalysis.connectionRobustness} />
            </Box>
          )}
        </Stack>
      </Box>

      {/* AI Interpretation (generated at execution time by path-interpreter) */}
      {interpretation && (interpretation.paragraphs?.length > 0 || interpretation.narrative) && (() => {
        // Support both new structure { paragraphs, keyInsight } and legacy { narrative, keyInsight }
        const paragraphs = interpretation.paragraphs?.length > 0
          ? interpretation.paragraphs
          : [{ label: 'Analysis', text: interpretation.narrative }];
        const { keyInsight } = interpretation;

        return (
          <Box sx={{ mb: 2, border: '1px solid #BAE6FD', borderRadius: 1, overflow: 'hidden' }}>
            {/* Header */}
            <Box sx={{ px: 1.5, py: 0.75, bgcolor: '#0284C7', display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                AI Interpretation
              </Typography>
              <Typography sx={{ fontSize: '0.6rem', color: '#BAE6FD', ml: 'auto' }}>generated at execution time</Typography>
            </Box>

            <Box sx={{ bgcolor: '#F0F9FF', p: 1.5 }}>
              {/* Analytical paragraphs */}
              {paragraphs.map((para, i) => (
                <Box key={i} sx={{ mb: i < paragraphs.length - 1 ? 1.75 : 0 }}>
                  <Typography sx={{
                    fontSize: '0.6rem', fontWeight: 700, color: '#0369A1',
                    textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.5,
                    pb: 0.3, borderBottom: '1px solid #BAE6FD',
                  }}>
                    {para.label}
                  </Typography>
                  <Typography sx={{ fontSize: '0.82rem', color: R.subtle, lineHeight: 1.72, whiteSpace: 'pre-line' }}>
                    {para.text}
                  </Typography>
                </Box>
              ))}

              {/* Key Insight */}
              {keyInsight && (
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mt: 1.5, pt: 1.25, borderTop: '1px solid #BAE6FD' }}>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: R.accent, whiteSpace: 'nowrap' }}>Key insight:</Typography>
                  <Typography sx={{ fontSize: '0.8rem', color: R.accent, fontStyle: 'italic', lineHeight: 1.6 }}>
                    {keyInsight}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        );
      })()}

      {/* Paths — show up to 3, use segments when available */}
      {paths.slice(0, 3).map((path, pi) => {
        const segments = path.segments || [];
        const useSegs  = segments.length > 0;
        const nodeIds  = path.nodeIds || segments.map(s => s.id);
        const count    = useSegs ? segments.length : nodeIds.length;

        return (
          <Box key={pi} sx={{ mb: 2.5 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: R.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Path {pi + 1}
              </Typography>
              {path.hopCount != null && <Chip label={`${path.hopCount} hop(s)`} size="small" sx={{ fontSize: '0.6rem', height: 16 }} />}
              {path.pathStrength != null && (
                <Chip label={`strength ${Math.round(path.pathStrength * 100)}%`} size="small" variant="outlined" sx={{ fontSize: '0.6rem', height: 16 }} />
              )}
            </Stack>

            {useSegs ? (
              // ── Segments branch: rich data with edge type ──────────────
              segments.map((seg, si) => {
                const entity    = entityById[seg.id] || { name: seg.name, type: seg.type, id: seg.id };
                const nextSeg   = segments[si + 1];
                const bundleRels = nextSeg ? getBundleRels(seg.id, nextSeg.id) : [];

                return (
                  <Box key={si}>
                    <NodeCard entity={entity} index={si + 1} total={count} />
                    {nextSeg && (
                      bundleRels.length > 0 ? (
                        // Show ALL bundle relationships (each = distinct evidence)
                        bundleRels.map((r, ri) => (
                          <EdgeCard
                            key={ri}
                            rel={r}
                            fromName={seg.name}
                            toName={nextSeg.name}
                            showConnector={ri === 0}
                            relIndex={ri}
                            relTotal={bundleRels.length}
                          />
                        ))
                      ) : seg.edge ? (
                        // Fallback to segment edge info (direction + strength from path)
                        <EdgeCard
                          rel={{ relType: seg.edge.relType, direction: seg.edge.direction, confidence: seg.edge.strength }}
                          fromName={seg.name} toName={nextSeg.name}
                        />
                      ) : (
                        <EdgeCard rel={null} fromName={seg.name} toName={nextSeg.name} />
                      )
                    )}
                  </Box>
                );
              })
            ) : (
              // ── nodeIds branch: look up entities by ID, then bundles by name ──
              nodeIds.map((nodeId, ni) => {
                const entity   = entityById[nodeId];
                const nextId   = nodeIds[ni + 1];
                const nextEnt  = nextId ? entityById[nextId] : null;
                const bundleRels = getBundleRels(nodeId, nextId);

                return (
                  <Box key={ni}>
                    <NodeCard entity={entity || { name: nodeId, type: 'ACTOR' }} index={ni + 1} total={count} />
                    {nextId && (
                      bundleRels.length > 0 ? (
                        bundleRels.map((r, ri) => (
                          <EdgeCard
                            key={ri}
                            rel={r}
                            fromName={entity?.name || nodeId}
                            toName={nextEnt?.name || nextId}
                            showConnector={ri === 0}
                            relIndex={ri}
                            relTotal={bundleRels.length}
                          />
                        ))
                      ) : (
                        <EdgeCard rel={null} fromName={entity?.name || nodeId} toName={nextEnt?.name || nextId} />
                      )
                    )}
                  </Box>
                );
              })
            )}
          </Box>
        );
      })}

      {/* All bundles with full context (not-in-path pairs) */}
      {Object.keys(bundles).length > 0 && (
        <>
          <Divider sx={{ my: 1.5, borderColor: R.border }} />
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: R.muted, textTransform: 'uppercase', letterSpacing: '0.07em', mb: 1 }}>
            All Relationship Evidence
          </Typography>
          {Object.values(bundles).map((b, i) => {
            const nameA = entityById[b.nodeA]?.name || b.nodeA;
            const nameB = entityById[b.nodeB]?.name || b.nodeB;
            const typeA = entityById[b.nodeA]?.type;
            const typeB = entityById[b.nodeB]?.type;
            return (
            <Box key={i} sx={{ mb: 1.25, bgcolor: R.paper, border: `1px solid ${R.border}`, borderRadius: 1.5, overflow: 'hidden' }}>
              <Box sx={{ px: 2, py: 0.75, bgcolor: R.accent + '0C', borderBottom: `1px solid ${R.border}`, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: R.text }}>{nameA}</Typography>
                  {typeA && <Chip label={typeA} size="small" sx={{ fontSize: '0.52rem', height: 14, opacity: 0.7 }} />}
                </Stack>
                <ArrowRight size={11} style={{ color: R.accent, flexShrink: 0 }} />
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: R.text }}>{nameB}</Typography>
                  {typeB && <Chip label={typeB} size="small" sx={{ fontSize: '0.52rem', height: 14, opacity: 0.7 }} />}
                </Stack>
                <Box sx={{ flex: 1 }} />
                <Chip label={`${b.count} contextual link(s)`} size="small" color="primary" sx={{ fontSize: '0.58rem', height: 16 }} />
              </Box>
              {(b.relationships || []).map((r, ri) => (
                <Box key={ri} sx={{ px: 2, py: 0.75, borderBottom: ri < b.relationships.length - 1 ? `1px solid ${R.border}` : 'none' }}>
                  <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: r.context ? 0.5 : 0 }}>
                    <Link2 size={11} style={{ color: R.accent, flexShrink: 0 }} />
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: R.accent, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {(r.relType || 'RELATED').replace(/_/g, ' ')}
                    </Typography>
                    {r.direction && r.direction !== 'forward' && (
                      <Chip label={r.direction} size="small" variant="outlined" sx={{ fontSize: '0.54rem', height: 14 }} />
                    )}
                    {r.confidence != null && (
                      <Typography sx={{ fontSize: '0.65rem', color: R.muted, ml: 'auto !important' }}>
                        {Math.round(r.confidence * 100)}%
                      </Typography>
                    )}
                  </Stack>
                  {r.context && (
                    <Box sx={{ pl: 2, borderLeft: `3px solid ${R.accent}40` }}>
                      <Typography sx={{ fontSize: '0.75rem', color: R.subtle, lineHeight: 1.65, fontStyle: 'italic' }}>
                        "{r.context}"
                      </Typography>
                      {r.documentId && (
                        <Typography sx={{ fontSize: '0.6rem', color: R.muted, mt: 0.3 }}>
                          Source: {r.documentId}
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
            );
          })}
        </>
      )}

      {/* Structural analysis */}
      {structuralAnalysis && (
        <>
          <Divider sx={{ my: 1.5, borderColor: R.border }} />
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: R.muted, textTransform: 'uppercase', letterSpacing: '0.07em', mb: 1 }}>
            Structural Analysis
          </Typography>
          <Box sx={{ p: 1.25, bgcolor: R.paper, border: `1px solid ${R.border}`, borderRadius: 1 }}>
            <Stack direction="row" spacing={3} flexWrap="wrap" sx={{ mb: 1.25 }}>
              {structuralAnalysis.independentPathCount != null && (
                <MetaItem label="Independent Paths" value={structuralAnalysis.independentPathCount} />
              )}
              {structuralAnalysis.subgraphNodeCount != null && (
                <MetaItem label="Subgraph Nodes" value={structuralAnalysis.subgraphNodeCount} />
              )}
              {structuralAnalysis.subgraphEdgeCount != null && (
                <MetaItem label="Subgraph Edges" value={structuralAnalysis.subgraphEdgeCount} />
              )}
              {structuralAnalysis.subgraphDensity != null && (
                <MetaItem label="Density" value={`${Math.round(structuralAnalysis.subgraphDensity * 100)}%`} />
              )}
              {structuralAnalysis.avgPathStrength != null && (
                <MetaItem label="Avg Strength" value={`${Math.round(structuralAnalysis.avgPathStrength * 100)}%`} />
              )}
            </Stack>

            {/* Structural summary bullets (pre-computed by backend) */}
            {(structuralAnalysis.summary || []).length > 0 && (
              <Box sx={{ mb: 1.25, p: 1, bgcolor: R.bg, borderRadius: 1, border: `1px solid ${R.border}` }}>
                {structuralAnalysis.summary.map((line, i) => (
                  <Typography key={i} sx={{ fontSize: '0.75rem', color: R.subtle, lineHeight: 1.7, display: 'flex', gap: 0.75 }}>
                    <span style={{ color: R.accent, fontWeight: 700, flexShrink: 0 }}>›</span>
                    {line}
                  </Typography>
                ))}
              </Box>
            )}

            {(structuralAnalysis.articulationPoints || []).length > 0 && (
              <Box>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: R.muted, textTransform: 'uppercase', mb: 0.4 }}>
                  Critical Bottlenecks (all paths pass through)
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.5}>
                  {structuralAnalysis.articulationPoints.map((id, i) => {
                    const e = entityById[id];
                    return (
                      <Chip key={i} label={e?.name || id} size="small" color="warning" icon={<Shield size={10} />} sx={{ fontSize: '0.65rem', height: 18 }} />
                    );
                  })}
                </Stack>
              </Box>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}

// ─── EXPAND Report ────────────────────────────────────────────────────────────
function ExpandReport({ content }) {
  const nodes = content.nodes || [];
  const edges = content.edges || [];
  const center = nodes.find(n => n.entityId === content.entityId);
  const neighbors = nodes.filter(n => n.entityId !== content.entityId);

  // Group neighbors by relationship type
  const byRel = {};
  edges.forEach(e => {
    const neighborId = e.targetId === content.entityId ? e.sourceId
                     : e.sourceId === content.entityId ? e.targetId : null;
    if (!neighborId) return;
    const node = nodes.find(n => n.entityId === neighborId);
    if (!node) return;
    const rel = e.relType || 'RELATED';
    if (!byRel[rel]) byRel[rel] = [];
    if (!byRel[rel].find(x => x.entityId === node.entityId)) byRel[rel].push(node);
  });

  return (
    <Box sx={{ bgcolor: R.bg, p: 1.5, borderRadius: 1.5 }}>
      <ReportHeader
        title="NEIGHBOURHOOD ANALYSIS"
        subtitle={center?.name}
      />

      {/* Center entity */}
      {center && (
        <Box sx={{ mb: 2 }}>
          <NodeCard entity={center} index={1} total={1} />
        </Box>
      )}

      {/* Stats */}
      <Box sx={{ bgcolor: R.unBlue + '18', border: `1px solid ${R.unBlue}40`, borderRadius: 1, px: 2, py: 1, mb: 2 }}>
        <Stack direction="row" spacing={3}>
          <MetaItem label="Depth" value={content.depth} />
          <MetaItem label="Neighbours" value={neighbors.length} />
          <MetaItem label="Relationships" value={edges.length} />
          <MetaItem label="Rel. Types" value={Object.keys(byRel).length} />
        </Stack>
      </Box>

      {/* Neighbours by relationship type */}
      {Object.entries(byRel).map(([rel, group]) => (
        <Box key={rel} sx={{ mb: 1.75 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 0 }}>
            <Box sx={{ width: 2, height: 14, bgcolor: R.edgeBorder }} />
            <Box sx={{ bgcolor: R.edgeBg, border: `1px solid ${R.edgeBorder}`, borderRadius: 1, px: 1.5, py: 0.4, width: '60%', textAlign: 'center' }}>
              <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.75}>
                <Link2 size={11} style={{ color: R.accent }} />
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: R.accent, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {rel.replace(/_/g, ' ')}
                </Typography>
                <Chip label={group.length} size="small" sx={{ fontSize: '0.58rem', height: 14 }} />
              </Stack>
            </Box>
          </Box>
          {group.map((node, ni) => {
            const c = pc(node.type);
            return (
              <Box key={node.entityId} sx={{ ml: 3, mt: 0.5, p: 0.75, bgcolor: R.paper, border: `1px solid ${R.border}`, borderLeft: `4px solid ${c.border}`, borderRadius: '0 6px 6px 0' }}>
                <Stack direction="row" alignItems="center" spacing={0.75}>
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: R.text, flex: 1 }}>{node.name}</Typography>
                  {node.type && <Chip label={node.type} size="small" sx={{ fontSize: '0.58rem', height: 16, color: c.text, bgcolor: c.bg }} />}
                </Stack>
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

// ─── STRUCTURE Report ─────────────────────────────────────────────────────────
function StructureReport({ content }) {
  const metrics = content.metrics || [];
  const bridges = content.bridges || [];
  const s = content.summary || {};
  const maxDeg = Math.max(...metrics.map(m => m.degree || 0), 1);

  return (
    <Box sx={{ bgcolor: R.bg, p: 1.5, borderRadius: 1.5 }}>
      <ReportHeader
        title="NETWORK STRUCTURE ANALYSIS"
        subtitle={s.mostCentral ? `Most central: ${s.mostCentral.name}` : undefined}
      />

      {/* Stats */}
      <Box sx={{ bgcolor: R.unBlue + '18', border: `1px solid ${R.unBlue}40`, borderRadius: 1, px: 2, py: 1, mb: 2 }}>
        <Stack direction="row" spacing={3} flexWrap="wrap">
          <MetaItem label="Nodes" value={s.nodeCount || metrics.length} />
          <MetaItem label="Edges" value={s.edgeCount || 0} />
          <MetaItem label="Bridges" value={s.bridgeCount || bridges.length} />
          {s.mostCentral && <MetaItem label="Top Degree" value={s.mostCentral.degree} />}
        </Stack>
      </Box>

      {/* Centrality ranking */}
      <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: R.muted, textTransform: 'uppercase', letterSpacing: '0.07em', mb: 1 }}>
        Centrality Ranking
      </Typography>
      {metrics.map((m, i) => {
        const c = pc(m.type);
        const barW = Math.round((m.degree / maxDeg) * 100);
        return (
          <Box key={m.entityId} sx={{ mb: 0.75, bgcolor: R.paper, border: `1px solid ${R.border}`, borderLeft: `4px solid ${m.isBridge ? '#D97706' : c.border}`, borderRadius: '0 8px 8px 0', px: 1.5, py: 0.75 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography sx={{ fontSize: '0.65rem', color: R.muted, width: 18, flexShrink: 0, textAlign: 'right' }}>#{i + 1}</Typography>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: R.text, flex: 1 }}>{m.name}</Typography>
              {m.isBridge && <Chip label="bridge" size="small" color="warning" sx={{ fontSize: '0.58rem', height: 16 }} />}
              <Typography sx={{ fontSize: '0.72rem', color: R.muted, width: 28, textAlign: 'right' }}>d={m.degree}</Typography>
            </Stack>
            <Box sx={{ mt: 0.4, ml: '30px', height: 4, bgcolor: '#E2E8F0', borderRadius: 1, overflow: 'hidden' }}>
              <Box sx={{ width: `${barW}%`, height: '100%', bgcolor: m.isBridge ? '#D97706' : c.border, borderRadius: 1 }} />
            </Box>
            {m.betweennessProxy > 0 && (
              <Typography sx={{ fontSize: '0.62rem', color: R.muted, ml: '30px', mt: 0.2 }}>
                betweenness proxy: {m.betweennessProxy.toFixed(3)}
              </Typography>
            )}
          </Box>
        );
      })}

      {/* Bridge analysis */}
      {bridges.length > 0 && (
        <>
          <Divider sx={{ my: 1.5, borderColor: R.border }} />
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: R.muted, textTransform: 'uppercase', letterSpacing: '0.07em', mb: 1 }}>
            Structural Bridges
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: R.subtle, mb: 1 }}>
            These edges are critical connectors — removing them would disconnect the network.
          </Typography>
          {bridges.map((b, i) => {
            const nodeMap = Object.fromEntries((content.nodes || []).map(n => [n.entityId, n]));
            const src = nodeMap[b.sourceId];
            const tgt = nodeMap[b.targetId];
            return (
              <Box key={i} sx={{ mb: 0.6, p: 0.75, bgcolor: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 1 }}>
                <Stack direction="row" alignItems="center" spacing={0.75}>
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 500, color: R.text }}>{src?.name || b.sourceId}</Typography>
                  <ArrowRight size={11} style={{ color: '#D97706', flexShrink: 0 }} />
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 500, color: R.text }}>{tgt?.name || b.targetId}</Typography>
                  {b.relType && <Chip label={b.relType.replace(/_/g, ' ')} size="small" sx={{ fontSize: '0.58rem', height: 14 }} />}
                </Stack>
              </Box>
            );
          })}
        </>
      )}
    </Box>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
function MetaItem({ label, value }) {
  return (
    <Box>
      <Typography sx={{ fontSize: '0.6rem', color: R.muted, fontWeight: 700, textTransform: 'uppercase', mb: 0.2 }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: R.accent }}>{value}</Typography>
    </Box>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────
export default function ArtifactReportTab({ artifact }) {
  const c = artifact?.content || {};
  switch (artifact?.primitiveType) {
    case 'CONNECT':   return <ConnectReport content={c} />;
    case 'EXPAND':    return <ExpandReport content={c} />;
    case 'STRUCTURE': return <StructureReport content={c} />;
    default:          return (
      <Box sx={{ p: 3, textAlign: 'center', opacity: 0.4 }}>
        <Typography variant="body2">Report not available for {artifact?.primitiveType}</Typography>
      </Box>
    );
  }
}
