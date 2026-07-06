/**
 * ArtifactPreviewDialog — rich preview of an investigation artifact before (or after) commit.
 *
 * Tabs:
 *   Visual  — type-specific renderer (graph, table, list, text)
 *   Summary — AI-generated analytical narrative (loaded lazily)
 *
 * Footer actions:
 *   PROPOSED artifact → [Discard] [Commit]
 *   COMMITTED artifact → [Close]
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Stack, Typography, Chip, Button, Tabs, Tab,
  CircularProgress, Alert, Divider, Tooltip, IconButton,
  Table, TableBody, TableCell, TableHead, TableRow,
  LinearProgress,
} from '@mui/material';
import {
  Search, Link2, Network, Braces, Cpu, Clock, ScanLine,
  FileText, StickyNote, CheckCircle, Trash2, X,
  ArrowRight, GitMerge, RefreshCw, Zap, BookOpen,
} from 'lucide-react';
import MiniGraphViewer from './MiniGraphViewer';
import ArtifactReportTab from './ArtifactReportTab';
import ProfileRenderer from './renderers/ProfileRenderer';
import ImpactRenderer from './renderers/ImpactRenderer';

// Graph-producing primitives get [Graph] + [Report] tabs
const GRAPH_PRIMITIVES = ['CONNECT', 'EXPAND', 'STRUCTURE'];

const API = '/api/v1/investigation';

// ─── Primitive meta ───────────────────────────────────────────────────────────
const PRIMITIVE_META = {
  LOCATE:    { icon: Search,    color: '#3b82f6', label: 'Locate' },
  CONNECT:   { icon: Link2,     color: '#8b5cf6', label: 'Connect' },
  EXPAND:    { icon: Network,   color: '#06b6d4', label: 'Expand' },
  PROFILE:   { icon: BookOpen,  color: '#f59e0b', label: 'Profile' },
  IMPACT:    { icon: Zap,       color: '#ef4444', label: 'Impact' },
  MATRIX:    { icon: Braces,    color: '#10b981', label: 'Matrix' },
  STRUCTURE: { icon: Cpu,       color: '#ec4899', label: 'Structure' },
  TIMELINE:  { icon: Clock,     color: '#f97316', label: 'Timeline' },
  RESOLVE:   { icon: ScanLine,  color: '#84cc16', label: 'Resolve' },
  SYNTHESIZE:{ icon: FileText,  color: '#a78bfa', label: 'Synthesize' },
  TEXT:      { icon: StickyNote,color: '#64748b', label: 'Text' },
};

// ─── Visual renderers ─────────────────────────────────────────────────────────

function LocateRenderer({ content }) {
  const results = content.results || [];
  if (results.length === 0) return <EmptyState text={`No entities matching "${content.query}"`} />;
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, fontSize: '0.72rem' }}>
        Query: <b>"{content.query}"</b> — {results.length} result(s)
      </Typography>
      <Stack spacing={0.75}>
        {results.map(e => (
          <Box key={e.entityId} sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, px: 1.5, py: 0.75 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem', flex: 1 }}>{e.name}</Typography>
              {e.type && <Chip label={e.type} size="small" sx={{ fontSize: '0.6rem', height: 16 }} />}
              {e.mentionCount > 0 && (
                <Tooltip title="Mention count in documents">
                  <Chip label={`×${e.mentionCount}`} size="small" variant="outlined" color="primary" sx={{ fontSize: '0.6rem', height: 16 }} />
                </Tooltip>
              )}
            </Stack>
            {e.description && (
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', display: 'block', mt: 0.25 }}>
                {e.description.slice(0, 140)}{e.description.length > 140 ? '…' : ''}
              </Typography>
            )}
            {e.namespace && (
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem' }}>{e.namespace}</Typography>
            )}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function ConnectRenderer({ content }) {
  const bundles = Object.values(content.bundles || {});
  const entities = content.entities || [];
  const paths = content.paths || [];

  const getName = (id) => entities.find(e => e.entityId === id)?.name || id?.slice(0, 12);

  if (bundles.length === 0 && paths.length === 0) {
    return <EmptyState text="No connections found between the specified entities" />;
  }

  return (
    <Box>
      {/* Stats row */}
      <Stack direction="row" spacing={2} sx={{ mb: 2, p: 1.25, bgcolor: 'action.hover', borderRadius: 1.5 }}>
        <StatBox label="Paths" value={paths.length} />
        <StatBox label="Entities" value={entities.length} />
        {content.structuralAnalysis?.connectionRobustness && (
          <StatBox label="Robustness" value={content.structuralAnalysis.connectionRobustness} />
        )}
      </Stack>

      {/* Pair bundles */}
      {bundles.length > 0 && (
        <>
          <Typography variant="overline" sx={{ fontSize: '0.62rem', color: 'text.disabled', display: 'block', mb: 0.75 }}>
            Relationship Bundles
          </Typography>
          <Stack spacing={0.75}>
            {bundles.map((b, i) => (
              <Box key={i} sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, px: 1.25, py: 0.75 }}>
                <Stack direction="row" alignItems="center" spacing={0.75}>
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{b.nodeA}</Typography>
                  <ArrowRight size={13} style={{ opacity: 0.5, flexShrink: 0 }} />
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{b.nodeB}</Typography>
                  <Box sx={{ flex: 1 }} />
                  <Chip label={`${b.count} rel.`} size="small" sx={{ fontSize: '0.6rem', height: 16 }} />
                </Stack>
                {(b.relationships || []).slice(0, 4).map((r, ri) => (
                  <Chip key={ri} label={r.relType || r} size="small" variant="outlined"
                    sx={{ fontSize: '0.6rem', height: 14, mt: 0.4, mr: 0.4 }} />
                ))}
              </Box>
            ))}
          </Stack>
        </>
      )}

      {/* Evidential limitation notice */}
      {content.evidentialLimitation && (
        <Alert severity="info" sx={{ mt: 1.5, fontSize: '0.72rem', py: 0.25 }}>
          Results limited to committed evidence — may not reflect full KB.
        </Alert>
      )}
    </Box>
  );
}

function ExpandRenderer({ content }) {
  const nodes = content.nodes || [];
  const edges = content.edges || [];
  const center = nodes.find(n => n.entityId === content.entityId);
  const neighbors = nodes.filter(n => n.entityId !== content.entityId);

  // Group neighbors by relationship type from edges
  const byRel = {};
  edges.forEach(e => {
    const neighborId = e.targetId === content.entityId ? e.sourceId : e.targetId;
    const node = nodes.find(n => n.entityId === neighborId);
    if (!node) return;
    const rel = e.relType || 'RELATED';
    if (!byRel[rel]) byRel[rel] = [];
    byRel[rel].push(node);
  });

  // If grouping didn't work, show flat list
  const hasGroups = Object.keys(byRel).length > 0;

  return (
    <Box>
      {/* Center entity */}
      {center && (
        <Box sx={{ border: 2, borderColor: 'primary.main', borderRadius: 1.5, px: 1.5, py: 0.75, mb: 1.5, bgcolor: 'primary.50' }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Network size={14} style={{ color: '#3b82f6' }} />
            <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{center.name}</Typography>
            {center.type && <Chip label={center.type} size="small" sx={{ fontSize: '0.6rem', height: 16 }} />}
          </Stack>
        </Box>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontSize: '0.7rem' }}>
        {content.nodeCount} nodes · {content.edgeCount} edges · depth {content.depth}
      </Typography>

      {hasGroups ? (
        Object.entries(byRel).map(([rel, group]) => (
          <Box key={rel} sx={{ mb: 1.25 }}>
            <Chip label={rel} size="small" variant="outlined" sx={{ fontSize: '0.62rem', height: 16, mb: 0.5 }} />
            <Stack spacing={0.4} sx={{ pl: 1 }}>
              {group.slice(0, 10).map(n => (
                <Stack key={n.entityId} direction="row" alignItems="center" spacing={0.75}>
                  <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'text.disabled' }} />
                  <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>{n.name}</Typography>
                  {n.type && <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem' }}>{n.type}</Typography>}
                </Stack>
              ))}
              {group.length > 10 && (
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>+{group.length - 10} more</Typography>
              )}
            </Stack>
          </Box>
        ))
      ) : (
        <Stack spacing={0.4}>
          {neighbors.slice(0, 20).map(n => (
            <Stack key={n.entityId} direction="row" alignItems="center" spacing={0.75}>
              <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'text.disabled' }} />
              <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>{n.name}</Typography>
              {n.type && <Chip label={n.type} size="small" sx={{ fontSize: '0.58rem', height: 14 }} />}
            </Stack>
          ))}
          {neighbors.length > 20 && (
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>+{neighbors.length - 20} more nodes</Typography>
          )}
        </Stack>
      )}
    </Box>
  );
}

function MatrixRenderer({ content }) {
  const rows = content.rowEntities || [];
  const cols = content.colEntities?.length > 0 ? content.colEntities : rows;
  const cells = content.cells || [];
  const s = content.summary || {};

  const getCell = (rowId, colId) =>
    cells.find(c => c.rowEntityId === rowId && c.colEntityId === colId);

  const cellColor = (cell) => {
    if (!cell) return '#f1f5f9';
    if (cell.self) return '#e2e8f0';
    if (cell.directRel) return '#bbf7d0';
    if (cell.indirectPath) return '#fde68a';
    return '#f1f5f9';
  };

  return (
    <Box>
      {/* Stats */}
      <Stack direction="row" spacing={2} sx={{ mb: 1.5 }}>
        <StatBox label="Direct" value={s.directConnections || 0} color="success.main" />
        <StatBox label="Indirect" value={s.indirectConnections || 0} color="warning.main" />
        <StatBox label="None" value={s.noConnection || 0} color="text.disabled" />
      </Stack>

      {/* Legend */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 1.25 }}>
        <LegendItem color="#bbf7d0" label="Direct" />
        <LegendItem color="#fde68a" label="Indirect" />
        <LegendItem color="#e2e8f0" label="Self" />
        <LegendItem color="#f1f5f9" label="None" />
      </Stack>

      {/* Matrix table */}
      <Box sx={{ overflow: 'auto' }}>
        <Table size="small" sx={{ borderCollapse: 'collapse', '& td, & th': { border: 1, borderColor: 'divider', p: 0.5, fontSize: '0.7rem' } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ bgcolor: 'action.hover', fontWeight: 700, minWidth: 80 }}>↓ Row / Col →</TableCell>
              {cols.map(col => (
                <TableCell key={col.entityId} sx={{ bgcolor: 'action.hover', fontWeight: 600, whiteSpace: 'nowrap', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {col.name}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(row => (
              <TableRow key={row.entityId}>
                <TableCell sx={{ fontWeight: 600, bgcolor: 'action.hover', whiteSpace: 'nowrap' }}>{row.name}</TableCell>
                {cols.map(col => {
                  const cell = getCell(row.entityId, col.entityId);
                  return (
                    <Tooltip key={col.entityId} title={cell?.relType || cell?.context || (cell?.self ? 'Same entity' : 'No connection')} arrow>
                      <TableCell sx={{ bgcolor: cellColor(cell), textAlign: 'center', cursor: 'default' }}>
                        {cell?.self ? '—' : cell?.directRel ? '●' : cell?.indirectPath ? '◌' : ''}
                        {cell?.relType && !cell.self && (
                          <Typography component="div" sx={{ fontSize: '0.55rem', color: 'text.secondary', lineHeight: 1 }}>
                            {cell.relType.replace(/_/g, ' ')}
                          </Typography>
                        )}
                      </TableCell>
                    </Tooltip>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}

function StructureRenderer({ content }) {
  const metrics = (content.metrics || []).slice(0, 20);
  const bridges = content.bridges || [];
  const s = content.summary || {};
  const maxDegree = Math.max(...metrics.map(m => m.degree), 1);

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 1.5 }}>
        <StatBox label="Nodes" value={s.nodeCount || 0} />
        <StatBox label="Edges" value={s.edgeCount || 0} />
        <StatBox label="Bridges" value={s.bridgeCount || 0} color="warning.main" />
        {s.mostCentral && <StatBox label="Top Node" value={s.mostCentral.name} />}
      </Stack>

      <Typography variant="overline" sx={{ fontSize: '0.62rem', color: 'text.disabled', display: 'block', mb: 0.75 }}>
        Centrality Ranking
      </Typography>
      <Stack spacing={0.6}>
        {metrics.map((m, i) => (
          <Box key={m.entityId}>
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.2 }}>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem', width: 16, textAlign: 'right', flexShrink: 0 }}>
                {i + 1}
              </Typography>
              <Typography variant="body2" sx={{ fontSize: '0.78rem', flex: 1, fontWeight: m.isBridge ? 700 : 400 }}>
                {m.name}
              </Typography>
              {m.isBridge && (
                <Tooltip title="Structural bridge">
                  <Chip label="bridge" size="small" color="warning" sx={{ fontSize: '0.58rem', height: 14 }} />
                </Tooltip>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', width: 28, textAlign: 'right' }}>
                {m.degree}
              </Typography>
            </Stack>
            <Box sx={{ pl: 2.5 }}>
              <LinearProgress
                variant="determinate"
                value={(m.degree / maxDegree) * 100}
                sx={{ height: 3, borderRadius: 1, bgcolor: 'action.hover' }}
              />
            </Box>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function TimelineRenderer({ content }) {
  const events = content.events || [];
  const span = content.span || {};

  if (events.length === 0) return <EmptyState text="No dated events found for these entities" />;

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, fontSize: '0.72rem' }}>
        {events.length} events · {span.earliest || '?'} — {span.latest || '?'}
        {span.durationDays && ` (${span.durationDays} days)`}
      </Typography>
      <Stack spacing={0}>
        {events.map((ev, i) => (
          <Stack key={i} direction="row" spacing={1.25} sx={{ position: 'relative', pb: 1 }}>
            {/* Timeline line */}
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 16 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', mt: 0.4, flexShrink: 0 }} />
              {i < events.length - 1 && <Box sx={{ width: 1, flex: 1, bgcolor: 'divider', mt: 0.4 }} />}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                {ev.date || 'Unknown date'} · {ev.eventType || ev.relType || ev.property || ''}
              </Typography>
              <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 500 }}>{ev.name}</Typography>
              {ev.description && (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                  {ev.description.slice(0, 100)}
                </Typography>
              )}
            </Box>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

function ResolveRenderer({ content }) {
  const anchor = content.anchor || {};
  const candidates = content.candidates || [];
  const merges = content.suggestedMerges || [];
  const s = content.summary || {};

  return (
    <Box>
      {/* Anchor entity */}
      <Box sx={{ border: 2, borderColor: 'primary.main', borderRadius: 1.5, px: 1.5, py: 0.75, mb: 1.5, bgcolor: 'primary.50' }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <ScanLine size={13} style={{ color: '#3b82f6' }} />
          <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.82rem' }}>{anchor.name}</Typography>
          {anchor.type && <Chip label={anchor.type} size="small" sx={{ fontSize: '0.6rem', height: 16 }} />}
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', ml: 'auto !important' }}>anchor</Typography>
        </Stack>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontSize: '0.7rem' }}>
        {s.candidateCount || 0} candidates · {s.highConfidenceMerges || 0} high-confidence
      </Typography>

      <Stack spacing={0.6}>
        {candidates.map(c => (
          <Box key={c.entityId} sx={{ border: 1, borderColor: c.similarity >= 0.85 ? 'warning.main' : 'divider', borderRadius: 1.5, px: 1.25, py: 0.6 }}>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <Typography variant="body2" sx={{ fontSize: '0.78rem', flex: 1, fontWeight: 500 }}>{c.name}</Typography>
              {c.type && <Chip label={c.type} size="small" sx={{ fontSize: '0.58rem', height: 14 }} />}
              <Chip
                label={`${Math.round(c.similarity * 100)}%`}
                size="small"
                color={c.similarity >= 0.85 ? 'warning' : 'default'}
                sx={{ fontSize: '0.6rem', height: 16 }}
              />
            </Stack>
            {(c.matchReasons || []).length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                {c.matchReasons.slice(0, 2).join(' · ')}
              </Typography>
            )}
          </Box>
        ))}
      </Stack>

      {merges.length > 0 && (
        <>
          <Divider sx={{ my: 1.25 }} />
          <Typography variant="overline" sx={{ fontSize: '0.62rem', color: 'warning.main', display: 'block', mb: 0.5 }}>
            Suggested Merges
          </Typography>
          {merges.map((m, i) => (
            <Stack key={i} direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
              <Typography variant="caption" sx={{ fontSize: '0.72rem' }}>{m.keepName}</Typography>
              <GitMerge size={12} style={{ opacity: 0.5 }} />
              <Typography variant="caption" sx={{ fontSize: '0.72rem' }}>{m.mergeName}</Typography>
              <Chip label={`${Math.round(m.confidence * 100)}%`} size="small" color="warning" sx={{ fontSize: '0.58rem', height: 14 }} />
            </Stack>
          ))}
        </>
      )}
    </Box>
  );
}

function SynthesizeRenderer({ content }) {
  return (
    <Box>
      <Typography variant="body2" sx={{ fontSize: '0.82rem', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
        {content.narrative || 'No narrative generated.'}
      </Typography>
      {(content.claimsWithEvidence || []).length > 0 && (
        <>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="overline" sx={{ fontSize: '0.62rem', color: 'text.disabled', display: 'block', mb: 0.75 }}>
            Claims & Evidence
          </Typography>
          <Stack spacing={0.75}>
            {content.claimsWithEvidence.map((c, i) => (
              <Box key={i} sx={{ pl: 1, borderLeft: 2, borderColor: 'primary.light' }}>
                <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 500 }}>{c.claim}</Typography>
                {c.evidenceNote && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                    Evidence: {c.evidenceNote}
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
        </>
      )}
    </Box>
  );
}

function TextRenderer({ content }) {
  return (
    <Box>
      {content.title && (
        <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 700, mb: 1.25 }}>
          {content.title}
        </Typography>
      )}
      <Typography variant="body2" sx={{ fontSize: '0.82rem', lineHeight: 1.75, whiteSpace: 'pre-line' }}>
        {content.body || ''}
      </Typography>
      <Typography variant="caption" color="text.disabled" sx={{ mt: 1.5, display: 'block', fontSize: '0.65rem' }}>
        {content.wordCount || 0} words{content.hasEvidence ? ' · linked to evidence' : ''}
      </Typography>
    </Box>
  );
}

// ─── Shared micro-components ──────────────────────────────────────────────────

function StatBox({ label, value, color }) {
  return (
    <Box sx={{ textAlign: 'center' }}>
      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.92rem', color: color || 'text.primary' }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem' }}>{label}</Typography>
    </Box>
  );
}

function LegendItem({ color, label }) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.4}>
      <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: color, border: 1, borderColor: 'divider' }} />
      <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{label}</Typography>
    </Stack>
  );
}

function EmptyState({ text }) {
  return (
    <Box sx={{ textAlign: 'center', py: 4, opacity: 0.45 }}>
      <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{text}</Typography>
    </Box>
  );
}

// ─── Visual renderer router ───────────────────────────────────────────────────

function VisualRenderer({ artifact }) {
  const c = artifact.content || {};
  switch (artifact.primitiveType) {
    case 'LOCATE':    return <LocateRenderer content={c} />;
    case 'CONNECT':   return <ConnectRenderer content={c} />;
    case 'EXPAND':    return <ExpandRenderer content={c} />;
    case 'PROFILE':   return <ProfileRenderer content={c} />;
    case 'IMPACT':    return <ImpactRenderer content={c} />;
    case 'MATRIX':    return <MatrixRenderer content={c} />;
    case 'STRUCTURE': return <StructureRenderer content={c} />;
    case 'TIMELINE':  return <TimelineRenderer content={c} />;
    case 'RESOLVE':   return <ResolveRenderer content={c} />;
    case 'SYNTHESIZE':return <SynthesizeRenderer content={c} />;
    case 'TEXT':      return <TextRenderer content={c} />;
    default:          return <Typography variant="body2" sx={{ opacity: 0.5 }}>No renderer for {artifact.primitiveType}</Typography>;
  }
}

// ─── Summary tab (lazy AI narrative) ─────────────────────────────────────────

function SummaryTab({ artifact }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!artifact) return;

    // SYNTHESIZE and TEXT: summary IS the content itself — no API call needed
    if (artifact.primitiveType === 'SYNTHESIZE') {
      setSummary(artifact.content?.narrative || null);
      return;
    }
    if (artifact.primitiveType === 'TEXT') {
      setSummary(artifact.content?.body || null);
      return;
    }

    // Use cached summary if already stored in artifact content
    if (artifact.content?.aiSummary) {
      setSummary(artifact.content.aiSummary);
      return;
    }

    // Generate (lazy) — only called once per artifact since result is cached server-side
    let cancelled = false;
    setLoading(true);
    fetch(`${API}/artifacts/${artifact.artifactId}/summary`)
      .then(r => r.json())
      .then(json => { if (!cancelled && json.success) setSummary(json.data.summary); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [artifact?.artifactId]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 4, justifyContent: 'center', opacity: 0.6 }}>
        <CircularProgress size={18} />
        <Typography variant="caption">Generating analytical summary…</Typography>
      </Box>
    );
  }

  if (!summary) {
    return <EmptyState text="No summary available for this artifact type." />;
  }

  // Support structured { paragraphs, keyInsight } and legacy plain string
  const isStructured = summary && typeof summary === 'object' && Array.isArray(summary.paragraphs);
  const paragraphs   = isStructured ? summary.paragraphs : null;
  const keyInsight   = isStructured ? summary.keyInsight  : null;
  const plainText    = !isStructured ? (typeof summary === 'string' ? summary : null) : null;

  return (
    <Box sx={{ p: 0.5 }}>
      <Box sx={{ border: '1px solid #BAE6FD', borderRadius: 1, overflow: 'hidden' }}>
        {/* Header — same style as AI Interpretation */}
        <Box sx={{ px: 1.5, py: 0.75, bgcolor: '#0284C7', display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            AI Summary
          </Typography>
          <Typography sx={{ fontSize: '0.6rem', color: '#BAE6FD', ml: 'auto' }}>generated on first view · cached in artifact</Typography>
        </Box>

        <Box sx={{ bgcolor: '#F0F9FF', p: 1.5 }}>
          {paragraphs ? (
            <>
              {paragraphs.map((para, i) => (
                <Box key={i} sx={{ mb: i < paragraphs.length - 1 ? 1.75 : 0 }}>
                  <Typography sx={{
                    fontSize: '0.6rem', fontWeight: 700, color: '#0369A1',
                    textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.5,
                    pb: 0.3, borderBottom: '1px solid #BAE6FD',
                  }}>
                    {para.label}
                  </Typography>
                  <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.72, whiteSpace: 'pre-line' }}>
                    {para.text}
                  </Typography>
                </Box>
              ))}
              {keyInsight && (
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mt: 1.5, pt: 1.25, borderTop: '1px solid #BAE6FD' }}>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap' }}>Key insight:</Typography>
                  <Typography sx={{ fontSize: '0.8rem', color: 'primary.main', fontStyle: 'italic', lineHeight: 1.6 }}>
                    {keyInsight}
                  </Typography>
                </Box>
              )}
            </>
          ) : (
            // Legacy plain-text fallback
            <Typography variant="body2" sx={{ fontSize: '0.85rem', lineHeight: 1.75, whiteSpace: 'pre-line', color: 'text.secondary' }}>
              {plainText}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}

// ─── Graph tab (MiniGraphViewer wrapper) ─────────────────────────────────────

function _buildGraphProps(artifact) {
  const c = artifact.content || {};
  switch (artifact.primitiveType) {
    case 'CONNECT': {
      const entities = (c.entities || []).map(e => ({
        id: e.id || e.entityId, name: e.name, type: e.type,
        namespace: e.namespace, description: e.description, mentionCount: e.mentionCount || 0,
      }));

      // id→name for bundle lookup
      const idToName = Object.fromEntries(entities.map(e => [e.id, e.name]));

      // Bundle lookup by entity ID pair — bundle.nodeA/nodeB are entity IDs (not names)
      const bundleById = {};
      Object.values(c.bundles || {}).forEach(b => {
        bundleById[`${b.nodeA}||${b.nodeB}`] = b.relationships || [];
        bundleById[`${b.nodeB}||${b.nodeA}`] = b.relationships || [];
      });

      // content.relationships has actual entity IDs — always valid for graph topology
      // Augment each pair with bundle context (expand to multiple edges when available)
      const baseRels = (c.relationships || [])
        .map(r => ({
          srcId: r.fromId || r.fromEntityId || r.sourceId,
          tgtId: r.toId   || r.toEntityId   || r.targetId,
          relType: r.relType, confidence: r.confidence,
        }))
        .filter(r => r.srcId && r.tgtId);

      const relationships = baseRels.flatMap(r => {
        const bundleRels = bundleById[`${r.srcId}||${r.tgtId}`]
          || bundleById[`${r.tgtId}||${r.srcId}`]
          || [];
        if (bundleRels.length > 0) {
          return bundleRels.map(br => ({
            sourceId: r.srcId, targetId: r.tgtId,
            relType: br.relType || r.relType,
            confidence: br.confidence ?? r.confidence,
            context: br.context, direction: br.direction,
          }));
        }
        return [{ sourceId: r.srcId, targetId: r.tgtId, relType: r.relType, confidence: r.confidence }];
      });

      const paths = (c.paths || []).map(p => ({
        nodeIds: p.nodeIds || (p.segments || []).map(s => s.id),
        hopCount: p.hopCount, pathStrength: p.pathStrength,
      }));
      return { entities, relationships, paths, centerNodeId: null };
    }
    case 'EXPAND': {
      const entities = (c.nodes || []).map(n => ({
        id: n.entityId, name: n.name, type: n.type, description: n.description,
      }));
      const relationships = (c.edges || []).map(e => ({
        sourceId: e.sourceId, targetId: e.targetId, relType: e.relType,
        context: e.context, confidence: e.confidence,
      }));
      return { entities, relationships, paths: [], centerNodeId: c.entityId };
    }
    case 'STRUCTURE': {
      const metricsMap = Object.fromEntries((c.metrics || []).map(m => [m.entityId, m]));
      const bridgeEdgeSet = new Set((c.bridges || []).map(b => `${b.sourceId}|${b.targetId}`));
      const entities = (c.nodes || []).map(n => ({
        id: n.entityId, name: n.name, type: n.type,
        isBridge: metricsMap[n.entityId]?.isBridge || false,
      }));
      const relationships = (c.edges || []).map(e => ({
        sourceId: e.sourceId, targetId: e.targetId, relType: e.relType,
        context: e.context, confidence: e.confidence,
        isBridge: bridgeEdgeSet.has(`${e.sourceId}|${e.targetId}`),
      }));
      return { entities, relationships, paths: [], centerNodeId: c.summary?.mostCentral?.entityId };
    }
    default:
      return { entities: [], relationships: [], paths: [] };
  }
}

function GraphTab({ artifact }) {
  const props = React.useMemo(() => _buildGraphProps(artifact), [artifact?.artifactId]);
  return (
    <Box sx={{ height: 440, position: 'relative', borderRadius: 1.5, overflow: 'hidden', border: 1, borderColor: 'divider', bgcolor: '#0d1117' }}>
      <MiniGraphViewer {...props} />
    </Box>
  );
}

// ─── Header context panel ─────────────────────────────────────────────────────

const PRIMITIVE_PURPOSE = {
  LOCATE:    'Entity search — finding entities by name, type or description in the knowledge base',
  CONNECT:   'Path analysis — tracing connection routes between two entities through the knowledge graph',
  EXPAND:    'Neighborhood exploration — mapping all direct relationships around a focal entity',
  PROFILE:   'Entity dossier — comprehensive relationship profile and structural analysis for one entity',
  IMPACT:    'Impact analysis — reverse dependency traversal to identify what depends on a changed entity',
  MATRIX:    'Cross-reference matrix — mapping relationships between sets of entities',
  STRUCTURE: 'Network topology — analysing centrality, bridges and structural properties',
  TIMELINE:  'Temporal mapping — ordering entity events and relationships chronologically',
  RESOLVE:   'Entity resolution — identifying duplicates and merge candidates for an entity',
  SYNTHESIZE:'Narrative synthesis — generating an analytical narrative from committed artifacts',
  TEXT:      'Analyst note — free-form text annotation attached to the investigation',
};

/** Extract key entities (with full metadata) relevant to this artifact execution */
function _getKeyEntities(artifact) {
  const c = artifact.content || {};
  const pt = artifact.primitiveType;

  // Build entity lookup from whatever the content provides
  const byId = {};
  (c.entities || c.nodes || c.results || []).forEach(e => {
    const id = e.id || e.entityId;
    if (id) byId[id] = e;
  });

  switch (pt) {
    case 'CONNECT': {
      const from = byId[c.fromEntityId];
      const to   = byId[c.toEntityId];
      const res  = [];
      if (from) res.push({ ...from, _role: 'Source' });
      if (to)   res.push({ ...to,   _role: 'Target' });
      return res;
    }
    case 'EXPAND': {
      const center = byId[c.entityId] || (c.nodes || [])[0];
      return center ? [{ ...center, _role: 'Center' }] : [];
    }
    case 'LOCATE':
      return (c.results || []).slice(0, 3).map(e => ({ ...e, _role: 'Found' }));
    case 'STRUCTURE': {
      const top = c.summary?.mostCentral;
      if (!top) return [];
      const e = byId[top.entityId] || top;
      return [{ ...e, _role: 'Most Central' }];
    }
    case 'MATRIX': {
      // Show up to 2 row + 2 col entities
      const rows = (c.rowEntityIds || []).slice(0, 2).map(id => ({ ...(byId[id] || { id }), _role: 'Row' }));
      const cols = (c.colEntityIds || []).slice(0, 2).map(id => ({ ...(byId[id] || { id }), _role: 'Col' }));
      return [...rows, ...cols];
    }
    case 'TIMELINE': {
      const e = byId[c.entityId];
      return e ? [{ ...e, _role: 'Subject' }] : [];
    }
    case 'RESOLVE': {
      const e = c.anchor;
      return e ? [{ ...e, _role: 'Anchor' }] : [];
    }
    case 'PROFILE': {
      const e = c.entity;
      return e ? [{ ...e, _role: 'Subject' }] : [];
    }
    case 'IMPACT': {
      const e = c.entity;
      return e ? [{ ...e, _role: 'Subject' }] : [];
    }
    default:
      return [];
  }
}

/** Context purpose sentence, specific to this execution */
function _getPurposeLine(artifact) {
  const c = artifact.content || {};
  const pt = artifact.primitiveType;
  const byId = {};
  (c.entities || c.nodes || c.results || []).forEach(e => {
    const id = e.id || e.entityId;
    if (id) byId[id] = e;
  });
  const name = (id) => byId[id]?.name || null;

  switch (pt) {
    case 'CONNECT': {
      const f = name(c.fromEntityId), t = name(c.toEntityId);
      if (f && t) return `Tracing connection paths between "${f}" and "${t}"`;
      return 'Tracing connection paths between two entities';
    }
    case 'EXPAND': {
      const n = name(c.entityId) || (c.nodes?.[0]?.name);
      const depth = c.depth ? ` at depth ${c.depth}` : '';
      return n ? `Expanding network neighborhood of "${n}"${depth}` : 'Expanding entity neighborhood';
    }
    case 'LOCATE':
      return c.query ? `Searching the knowledge base for: "${c.query}"` : 'Entity search';
    case 'MATRIX': {
      const nr = (c.rowEntityIds || []).length, nc = (c.colEntityIds || []).length;
      return `Cross-referencing ${nr} × ${nc} entity sets`;
    }
    case 'STRUCTURE': {
      const n = (c.nodes || []).length || c.summary?.nodeCount;
      return n ? `Structural analysis of a ${n}-entity network` : 'Network structure analysis';
    }
    case 'TIMELINE':
      return name(c.entityId) ? `Timeline reconstruction for "${name(c.entityId)}"` : 'Temporal mapping';
    case 'RESOLVE':
      return c.anchor?.name ? `Resolving entity identity of "${c.anchor.name}"` : 'Entity resolution';
    case 'SYNTHESIZE':
      return 'Synthesising investigation findings into an analytical narrative';
    case 'TEXT':
      return c.title ? `Note: "${c.title}"` : 'Analyst note';
    case 'PROFILE': {
      const n = c.entity?.name;
      return n ? `Building full dossier for "${n}"` : 'Entity dossier';
    }
    case 'IMPACT': {
      const n = c.entity?.name;
      const risk = c.riskAssessment?.riskLevel?.toUpperCase();
      const count = c.riskAssessment?.totalImpactCount;
      if (n) return `Impact analysis for "${n}"${risk ? ` — ${risk} risk` : ''}${count != null ? `, ${count} dependents` : ''}`;
      return 'Reverse dependency impact analysis';
    }
    default:
      return PRIMITIVE_PURPOSE[pt] || '';
  }
}

const ENTITY_TYPE_COLOR = {
  ACTOR: '#3b82f6', ORGANIZATION: '#7c3aed', PERSON: '#ea580c',
  CONCEPT: '#16a34a', DOCUMENT: '#ca8a04', EVENT: '#e11d48',
  PROCESS: '#0284c7', TECHNOLOGY: '#a21caf', POLICY: '#d97706',
  SYSTEM: '#475569',
};
const typeColor = (t) => ENTITY_TYPE_COLOR[(t || '').toUpperCase()] || '#94a3b8';

function EntityMiniCard({ entity }) {
  if (!entity) return null;
  const id    = entity.id || entity.entityId;
  const name  = entity.name || id?.slice(0, 8) || '?';
  const type  = entity.type || entity.entityType;
  const ns    = entity.namespace && entity.namespace !== 'DEFAULT' ? entity.namespace : null;
  const role  = entity._role;
  const col   = typeColor(type);
  const layer = entity.epistemicLayer?.replace(/L\d+_/, '') || null;

  return (
    <Box sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.6,
      bgcolor: 'background.paper',
      border: '1px solid',
      borderColor: `${col}44`,
      borderLeft: `3px solid ${col}`,
      borderRadius: 1,
      px: 1, py: 0.35,
      maxWidth: 340,
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {role && (
        <Typography sx={{ fontSize: '0.54rem', fontWeight: 700, color: col, textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {role}
        </Typography>
      )}
      <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'text.primary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>
        {name}
      </Typography>
      {type && (
        <Chip label={type} size="small" sx={{ fontSize: '0.52rem', height: 14, bgcolor: `${col}18`, color: col, border: `1px solid ${col}44`, fontWeight: 600, flexShrink: 0 }} />
      )}
      {layer && (
        <Typography sx={{ fontSize: '0.52rem', color: 'text.disabled', whiteSpace: 'nowrap', flexShrink: 0 }}>{layer}</Typography>
      )}
      {ns && (
        <Typography sx={{ fontSize: '0.52rem', color: 'text.disabled', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 2 }}>{ns}</Typography>
      )}
    </Box>
  );
}

function ArtifactHeaderContext({ artifact }) {
  const purposeLine = _getPurposeLine(artifact);
  const keyEntities = _getKeyEntities(artifact);
  const meta = PRIMITIVE_META[artifact.primitiveType] || PRIMITIVE_META.TEXT;
  const col  = meta.color;

  return (
    <Box sx={{
      mt: 0.75, pt: 1, pb: 1, px: 0,
      borderTop: `1px solid`,
      borderColor: 'divider',
    }}>
      {/* Purpose line */}
      <Typography sx={{ fontSize: '0.73rem', color: 'text.secondary', lineHeight: 1.5, mb: keyEntities.length > 0 ? 0.85 : 0 }}>
        <Box component="span" sx={{ fontWeight: 700, color: col, mr: 0.5 }}>
          {meta.label}:
        </Box>
        {purposeLine}
      </Typography>

      {/* Key entity cards */}
      {keyEntities.length > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 0.75 }}>
          {keyEntities.map((e, i) => (
            <EntityMiniCard key={i} entity={e} />
          ))}
        </Stack>
      )}
    </Box>
  );
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

/**
 * @param {object}   artifact    — InvestigationArtifact to preview
 * @param {string}   sessionId
 * @param {boolean}  open
 * @param {function} onClose     — () => void
 * @param {function} onCommit    — (sessionId, artifactId) => Promise
 * @param {function} onDiscard   — (artifactId) => Promise
 * @param {function} onRerun     — (artifact) => Promise<newArtifact>  (optional)
 */
export default function ArtifactPreviewDialog({ artifact, sessionId, open, onClose, onCommit, onDiscard, onRerun }) {
  const [tab, setTab] = useState(0);
  const [committing, setCommitting] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [error, setError] = useState(null);

  // Reset tab when artifact changes
  useEffect(() => {
    if (open) { setTab(0); setError(null); }
  }, [artifact?.artifactId, open]);

  const isProposed = artifact?.status === 'PROPOSED';
  const meta = PRIMITIVE_META[artifact?.primitiveType] || PRIMITIVE_META.TEXT;
  const Icon = meta.icon;

  // SYNTHESIZE and TEXT are text-primary — no tabs
  const textOnly = artifact?.primitiveType === 'SYNTHESIZE' || artifact?.primitiveType === 'TEXT';
  // CONNECT, EXPAND, STRUCTURE get extra Graph + Report tabs
  const isGraph = GRAPH_PRIMITIVES.includes(artifact?.primitiveType);
  // PROFILE and IMPACT: rich visual-first layout (Analysis tab first, AI Summary second)
  const isRichVisual = artifact?.primitiveType === 'PROFILE' || artifact?.primitiveType === 'IMPACT';

  // Tab indices:
  //   non-graph:   0=AI Summary,  1=Raw
  //   rich-visual: 0=Analysis,    1=AI Summary
  //   graph:       0=Report,      1=Graph, 2=AI Summary, 3=Raw
  const tabLabels = isGraph
    ? ['Report', 'Graph', 'AI Summary', 'Raw']
    : isRichVisual
      ? ['Analysis', 'AI Summary']
      : ['AI Summary', 'Raw'];

  const handleCommit = async () => {
    setCommitting(true);
    setError(null);
    try {
      await onCommit(sessionId, artifact.artifactId);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setCommitting(false);
    }
  };

  const handleDiscard = async () => {
    setDiscarding(true);
    setError(null);
    try {
      await onDiscard(artifact.artifactId);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setDiscarding(false);
    }
  };

  const handleRerun = async () => {
    if (!onRerun) return;
    setRerunning(true);
    setError(null);
    try {
      await onRerun(artifact);
    } catch (e) {
      setError(e.message);
    } finally {
      setRerunning(false);
    }
  };

  if (!artifact) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { maxHeight: '88vh', borderRadius: 2 } }}
    >
      {/* Header */}
      <DialogTitle sx={{ pb: 1, pt: 1.5, px: 2 }}>
        {/* Top row: icon + title + chips + actions */}
        <Stack direction="row" alignItems="center" spacing={1.25}>
          <Box sx={{
            width: 30, height: 30, borderRadius: 1, bgcolor: `${meta.color}18`,
            border: `1px solid ${meta.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon size={16} style={{ color: meta.color }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              {meta.label}
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem' }}>
              {PRIMITIVE_PURPOSE[artifact.primitiveType] || 'Investigation tool'}
            </Typography>
          </Box>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ flexShrink: 0 }}>
            <Chip
              label={isProposed ? 'Draft' : 'Committed'}
              size="small"
              color={isProposed ? 'warning' : 'success'}
              sx={{ fontSize: '0.62rem', height: 18 }}
            />
            {artifact.producedBy === 'AI' && (
              <Chip label="AI" size="small" color="secondary" sx={{ fontSize: '0.62rem', height: 18 }} />
            )}
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem' }}>
              {new Date(artifact.createdAt).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
            </Typography>
            {onRerun && (
              <Tooltip title="Re-run with same parameters (overwrites result)">
                <span>
                  <IconButton size="small" onClick={handleRerun} disabled={rerunning}
                    sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}>
                    {rerunning ? <CircularProgress size={13} /> : <RefreshCw size={14} />}
                  </IconButton>
                </span>
              </Tooltip>
            )}
            <IconButton size="small" onClick={onClose}>
              <X size={15} />
            </IconButton>
          </Stack>
        </Stack>

        {/* Context row: specific purpose + key entity cards */}
        <ArtifactHeaderContext artifact={artifact} />
      </DialogTitle>

      {/* Tabs */}
      {!textOnly && (
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ px: 2, borderBottom: 1, borderColor: 'divider', minHeight: 36 }}
          TabIndicatorProps={{ sx: { height: 2, bgcolor: meta.color } }}
        >
          {tabLabels.map(label => (
            <Tab key={label} label={label} sx={{ fontSize: '0.72rem', minHeight: 36, py: 0, px: 1.5 }} />
          ))}
        </Tabs>
      )}

      {/* Content */}
      <DialogContent sx={{ p: 2 }}>
        {error && <Alert severity="error" sx={{ mb: 1.5, fontSize: '0.75rem' }}>{error}</Alert>}

        {isProposed && (
          <Alert severity="warning" icon={false} sx={{ mb: 1.5, fontSize: '0.72rem', py: 0.4 }}>
            This is a draft — not yet part of the investigation record. Review and commit to finalize.
          </Alert>
        )}

        {textOnly ? (
          <VisualRenderer artifact={artifact} />
        ) : isGraph ? (
          <>
            {tab === 0 && <ArtifactReportTab artifact={artifact} />}
            {tab === 1 && <GraphTab artifact={artifact} />}
            {tab === 2 && <SummaryTab artifact={artifact} />}
            {tab === 3 && <VisualRenderer artifact={artifact} />}
          </>
        ) : isRichVisual ? (
          <>
            {tab === 0 && <VisualRenderer artifact={artifact} />}
            {tab === 1 && <SummaryTab artifact={artifact} />}
          </>
        ) : (
          <>
            {tab === 0 && <SummaryTab artifact={artifact} />}
            {tab === 1 && <VisualRenderer artifact={artifact} />}
          </>
        )}
      </DialogContent>

      {/* Footer actions */}
      <DialogActions sx={{ px: 2, py: 1.25, borderTop: 1, borderColor: 'divider' }}>
        {isProposed ? (
          <>
            <Button
              color="error"
              startIcon={discarding ? <CircularProgress size={13} /> : <Trash2 size={13} />}
              disabled={discarding || committing}
              onClick={handleDiscard}
              sx={{ fontSize: '0.75rem' }}
            >
              Discard
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button onClick={onClose} sx={{ fontSize: '0.75rem' }}>Cancel</Button>
            <Button
              variant="contained"
              color="success"
              startIcon={committing ? <CircularProgress size={13} sx={{ color: 'inherit' }} /> : <CheckCircle size={13} />}
              disabled={committing || discarding}
              onClick={handleCommit}
              sx={{ fontSize: '0.75rem', minWidth: 90 }}
            >
              {committing ? 'Committing…' : 'Commit'}
            </Button>
          </>
        ) : (
          <Button onClick={onClose} sx={{ fontSize: '0.75rem' }}>Close</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
